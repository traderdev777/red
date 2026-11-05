import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { asRequest, freshDatabase, hasDb } from "./setup-db";

const hash = (n: number) => n.toString(16).padStart(64, "0");

describe.skipIf(!hasDb)("scanner queue: claim, progress, complete, fail, reap", () => {
  let admin: pg.Client;
  let apiUrl: string;
  let carol: string;
  const opened: pg.Client[] = [];
  const service = async () => {
    const c = await asRequest(apiUrl, { role: "service_role" });
    opened.push(c);
    return c;
  };
  const as = async (sub: string) => {
    const c = await asRequest(apiUrl, { role: "authenticated", sub });
    opened.push(c);
    return c;
  };
  /** A queued scan the way the app creates one: quota charged, then inserted by the service role. */
  const enqueue = async (n: number, opts: { charged?: boolean } = {}) => {
    const charged = opts.charged ?? true;
    if (charged) {
      await admin.query(
        `insert into public.scan_usage (user_id, day, count) values ($1, (now() at time zone 'utc')::date, 1)
         on conflict (user_id, day) do update set count = scan_usage.count + 1`,
        [carol],
      );
    }
    const { rows } = await admin.query(
      `insert into public.scans (user_id, url, normalized_url, url_hash, quota_charged)
       values ($1, $2, $2, $3, $4) returning id`,
      [carol, `https://site${n}.example/`, hash(n), charged],
    );
    return rows[0].id as string;
  };
  const usage = async () =>
    Number(
      (
        await admin.query(
          "select coalesce((select count from public.scan_usage where user_id = $1 and day = (now() at time zone 'utc')::date), 0) as c",
          [carol],
        )
      ).rows[0].c,
    );
  const row = async (id: string) => (await admin.query("select * from public.scans where id = $1", [id])).rows[0];

  beforeAll(async () => {
    const db = await freshDatabase(`red_test_queue_${process.pid}`);
    apiUrl = db.apiUrl;
    admin = new pg.Client({ connectionString: db.adminUrl });
    await admin.connect();
    carol = (await admin.query("insert into auth.users (email) values ('carol@example.com') returning id")).rows[0].id;
  }, 30_000);

  afterAll(async () => {
    await Promise.all(opened.map((c) => c.end().catch(() => {})));
    await admin?.end();
  });

  it("two workers claiming at the same time never get the same scan", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) ids.push(await enqueue(100 + i, { charged: false }));
    const w1 = await service();
    const w2 = await service();
    const claimAll = async (c: pg.Client, worker: string) => {
      const got: string[] = [];
      for (;;) {
        const { rows } = await c.query("select id from public.claim_next_scan($1)", [worker]);
        if (!rows.length) return got;
        got.push(rows[0].id);
      }
    };
    const [a, b] = await Promise.all([claimAll(w1, "worker-a"), claimAll(w2, "worker-b")]);
    expect(a.length + b.length).toBe(12);
    expect(new Set([...a, ...b]).size).toBe(12);
    expect([...a, ...b].sort()).toEqual([...ids].sort());
    const { rows } = await admin.query(
      "select worker_id, count(*)::int as n from public.scans where id = any($1) group by worker_id",
      [ids],
    );
    for (const r of rows) expect(["worker-a", "worker-b"]).toContain(r.worker_id);
    const one = await row(a[0] ?? b[0]!);
    expect(one.status).toBe("collecting");
    expect(one.started_at).not.toBeNull();
  });

  it("claims oldest first", async () => {
    await admin.query("update public.scans set status = 'done' where status in ('queued','collecting')");
    const first = await enqueue(200, { charged: false });
    await enqueue(201, { charged: false });
    const w = await service();
    const { rows } = await w.query("select id from public.claim_next_scan('w')");
    expect(rows[0].id).toBe(first);
  });

  it("progress is monotonic, capped below 100, and only from the owning worker", async () => {
    const w = await service();
    const id = await enqueue(300, { charged: false });
    await admin.query("update public.scans set status = 'done' where status = 'queued' and id <> $1", [id]);
    await w.query("select public.claim_next_scan('owner')");
    expect((await w.query("select public.update_scan_progress($1, 'owner', 45) as ok", [id])).rows[0].ok).toBe(true);
    await w.query("select public.update_scan_progress($1, 'owner', 30)", [id]);
    expect((await row(id)).progress).toBe(45);
    await w.query("select public.update_scan_progress($1, 'owner', 150)", [id]);
    expect((await row(id)).progress).toBe(99);
    expect((await w.query("select public.update_scan_progress($1, 'intruder', 60) as ok", [id])).rows[0].ok).toBe(false);
  });

  it("entering analyzing restarts the phase bar; it never goes back to collecting", async () => {
    const w = await service();
    const id = await enqueue(350, { charged: false });
    await admin.query("update public.scans set status = 'done' where status = 'queued' and id <> $1", [id]);
    await w.query("select public.claim_next_scan('phase')");
    await w.query("select public.update_scan_progress($1, 'phase', 95)", [id]);
    await w.query("select public.update_scan_progress($1, 'phase', 0, 'analyzing')", [id]);
    expect([(await row(id)).status, (await row(id)).progress]).toEqual(["analyzing", 0]);
    await w.query("select public.update_scan_progress($1, 'phase', 40)", [id]);
    expect((await row(id)).progress).toBe(40);
    expect((await w.query("select public.update_scan_progress($1, 'phase', 50, 'collecting') as ok", [id])).rows[0].ok).toBe(false);
    expect((await row(id)).status).toBe("analyzing");
  });

  it("complete_scan sets done, 100, result; a stale worker cannot overwrite it", async () => {
    const w = await service();
    const id = await enqueue(400, { charged: false });
    await admin.query("update public.scans set status = 'done' where status = 'queued' and id <> $1", [id]);
    await w.query("select public.claim_next_scan('w400')");
    expect((await w.query("select public.complete_scan($1, 'w400', '{\"ok\":true}'::jsonb) as ok", [id])).rows[0].ok).toBe(true);
    const r = await row(id);
    expect([r.status, r.progress, r.result]).toEqual(["done", 100, { ok: true }]);
    expect((await w.query("select public.fail_scan($1, 'w400', 'late') as ok", [id])).rows[0].ok).toBe(false);
    expect((await row(id)).status).toBe("done");
  });

  it("fail_scan during collection refunds the quota exactly once", async () => {
    const w = await service();
    const before = await usage();
    const id = await enqueue(500);
    expect(await usage()).toBe(before + 1);
    await admin.query("update public.scans set status = 'done' where status = 'queued' and id <> $1", [id]);
    await w.query("select public.claim_next_scan('w500')");
    await w.query("select public.fail_scan($1, 'w500', 'Blocked by bot protection. RED does not bypass protections.')", [id]);
    const r = await row(id);
    expect([r.status, r.failed_stage, r.quota_charged]).toEqual(["failed", "collecting", false]);
    expect(r.error).toBe("Blocked by bot protection. RED does not bypass protections.");
    expect(await usage()).toBe(before);
    expect((await w.query("select public.fail_scan($1, 'w500', 'again') as ok", [id])).rows[0].ok).toBe(false);
    expect(await usage()).toBe(before);
  });

  it("a failure during analysis keeps the charge", async () => {
    const w = await service();
    const before = await usage();
    const id = await enqueue(600);
    await admin.query("update public.scans set status = 'done' where status = 'queued' and id <> $1", [id]);
    await w.query("select public.claim_next_scan('w600')");
    await w.query("select public.update_scan_progress($1, 'w600', 0, 'analyzing')", [id]);
    await w.query("select public.fail_scan($1, 'w600', 'model error')", [id]);
    const r = await row(id);
    expect([r.status, r.failed_stage, r.quota_charged]).toEqual(["failed", "analyzing", true]);
    expect(await usage()).toBe(before + 1);
  });

  it("reaper fails scans stuck in collecting past the timeout and refunds", async () => {
    const w = await service();
    const before = await usage();
    const stuck = await enqueue(700);
    const fresh = await enqueue(701);
    await admin.query("update public.scans set status = 'done' where status = 'queued' and id not in ($1, $2)", [stuck, fresh]);
    await w.query("select public.claim_next_scan('dead-worker')");
    await w.query("select public.claim_next_scan('live-worker')");
    // The worker that held `stuck` died 6 minutes ago.
    await admin.query("update public.scans set started_at = now() - interval '6 minutes' where id = $1", [stuck]);
    const { rows } = await w.query("select * from public.reap_stuck_scans(300) as id");
    expect(rows.map((r) => r.id)).toEqual([stuck]);
    const r = await row(stuck);
    expect([r.status, r.error, r.quota_charged]).toEqual(["failed", "Scanner timed out", false]);
    expect((await row(fresh)).status).toBe("collecting");
    expect(await usage()).toBe(before + 1); // stuck refunded, fresh still charged
    const audit = await admin.query("select event from public.scan_audit where scan_id = $1", [stuck]);
    expect(audit.rows.map((x) => x.event)).toEqual(["scan.reaped"]);
    // The dead worker coming back cannot resurrect it.
    expect((await w.query("select public.update_scan_progress($1, 'dead-worker', 80) as ok", [stuck])).rows[0].ok).toBe(false);
    expect((await w.query("select public.complete_scan($1, 'dead-worker', '{}') as ok", [stuck])).rows[0].ok).toBe(false);
  });

  it("users cannot call any queue function", async () => {
    const c = await as(carol);
    for (const q of [
      "select public.claim_next_scan('x')",
      "select public.reap_stuck_scans(60)",
      "select * from public.scan_queue_stats()",
      `select public.fail_scan('${"00000000-0000-0000-0000-000000000000"}', 'x', 'y')`,
      `select public.complete_scan('${"00000000-0000-0000-0000-000000000000"}', 'x', '{}')`,
      `select public.update_scan_progress('${"00000000-0000-0000-0000-000000000000"}', 'x', 1)`,
    ]) {
      await expect(c.query(q)).rejects.toThrow(/permission denied/);
    }
  });

  it("scan_queue_stats reports depth for the service role", async () => {
    const w = await service();
    await enqueue(800, { charged: false });
    const { rows } = await w.query("select * from public.scan_queue_stats()");
    expect(Number(rows[0].queued)).toBeGreaterThanOrEqual(1);
  });
});
