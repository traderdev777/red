import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { asRequest, freshDatabase, hasDb } from "./setup-db";

const HASH = "a".repeat(64);
const HASH2 = "b".repeat(64);

describe.skipIf(!hasDb)("database: profiles, scans, consume_scan_quota", () => {
  let admin: pg.Client;
  let apiUrl: string;
  let alice: string;
  let bob: string;
  const opened: pg.Client[] = [];
  const as = async (sub: string) => {
    const c = await asRequest(apiUrl, { role: "authenticated", sub });
    opened.push(c);
    return c;
  };
  const service = async () => {
    const c = await asRequest(apiUrl, { role: "service_role" });
    opened.push(c);
    return c;
  };

  beforeAll(async () => {
    const db = await freshDatabase();
    apiUrl = db.apiUrl;
    admin = new pg.Client({ connectionString: db.adminUrl });
    await admin.connect();
    alice = (
      await admin.query("insert into auth.users (email) values ('alice@example.com') returning id")
    ).rows[0].id;
    bob = (
      await admin.query("insert into auth.users (email) values ('bob@example.com') returning id")
    ).rows[0].id;
  }, 30_000);

  afterAll(async () => {
    await Promise.all(opened.map((c) => c.end().catch(() => {})));
    await admin?.end();
  });

  it("creates a profile on signup with role user and limit 5", async () => {
    const { rows } = await admin.query(
      "select email, role, daily_scan_limit from public.profiles where id = $1",
      [alice],
    );
    expect(rows[0]).toEqual({ email: "alice@example.com", role: "user", daily_scan_limit: 5 });
  });

  it("lets a user read only their own profile", async () => {
    const c = await as(alice);
    const { rows } = await c.query("select id from public.profiles");
    expect(rows.map((r) => r.id)).toEqual([alice]);
  });

  it("rejects a user changing their own role (no UPDATE privilege)", async () => {
    const c = await as(alice);
    await expect(
      c.query("update public.profiles set role = 'owner' where id = $1", [alice]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      c.query("update public.profiles set daily_scan_limit = 999 where id = $1", [alice]),
    ).rejects.toThrow(/permission denied/);
    const { rows } = await admin.query(
      "select role, daily_scan_limit from public.profiles where id = $1",
      [alice],
    );
    expect(rows[0]).toEqual({ role: "user", daily_scan_limit: 5 });
  });

  it("guard trigger blocks role changes even if UPDATE were granted by mistake", async () => {
    await admin.query("grant update on public.profiles to authenticated");
    await admin.query(
      `create policy "tmp: update own" on public.profiles for update to authenticated using (id = auth.uid())`,
    );
    const c = await as(alice);
    await expect(
      c.query("update public.profiles set role = 'owner' where id = $1", [alice]),
    ).rejects.toThrow(/only be changed by an operator/);
    await admin.query(`drop policy "tmp: update own" on public.profiles`);
    await admin.query("revoke update on public.profiles from authenticated");
  });

  it("allows 5 scans per day, rejects the 6th", async () => {
    const c = await as(alice);
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push((await c.query("select * from public.consume_scan_quota($1)", [alice])).rows[0]);
    }
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, true, true, false]);
    expect(results[5]).toMatchObject({ used: 5, quota_limit: 5, is_owner: false });
  });

  it("is race-safe: 20 concurrent calls with limit 5 allow exactly 5", async () => {
    const clients = await Promise.all(Array.from({ length: 20 }, () => as(bob)));
    const rows = await Promise.all(
      clients.map((c) =>
        c.query("select allowed from public.consume_scan_quota($1)", [bob]).then((r) => r.rows[0]),
      ),
    );
    expect(rows.filter((r) => r.allowed).length).toBe(5);
    const { rows: usage } = await admin.query(
      "select count from public.scan_usage where user_id = $1",
      [bob],
    );
    expect(usage[0].count).toBe(5);
  });

  it("refuses to consume another user's quota", async () => {
    const c = await as(alice);
    await expect(c.query("select * from public.consume_scan_quota($1)", [bob])).rejects.toThrow(
      /another user/,
    );
  });

  it("owner (set by SQL) is unlimited and not counted", async () => {
    await admin.query(
      "update public.profiles set role = 'owner' where email = 'alice@example.com'",
    );
    const c = await as(alice);
    for (let i = 0; i < 10; i++) {
      const r = (await c.query("select * from public.consume_scan_quota($1)", [alice])).rows[0];
      expect(r).toMatchObject({ allowed: true, is_owner: true });
    }
    const { rows } = await admin.query("select count from public.scan_usage where user_id = $1", [
      alice,
    ]);
    expect(rows[0].count).toBe(5); // unchanged from the earlier test
    await admin.query("update public.profiles set role = 'user' where email = 'alice@example.com'");
  });

  it("direct inserts are forced to queued and still charge quota", async () => {
    const c = await as(bob); // bob is at 5/5
    await expect(
      c.query(
        "insert into public.scans (url, normalized_url, url_hash) values ('https://a.com','https://a.com',$1)",
        [HASH],
      ),
    ).rejects.toThrow(/daily scan limit reached/);

    const d = await as(alice);
    await admin.query("delete from public.scan_usage where user_id = $1", [alice]);
    const { rows } = await d.query(
      "insert into public.scans (url, normalized_url, url_hash) values ('https://a.com','https://a.com',$1) returning status, progress, quota_charged, user_id",
      [HASH],
    );
    expect(rows[0]).toEqual({ status: "queued", progress: 0, quota_charged: true, user_id: alice });
  });

  it("users cannot write status or result, or insert for someone else", async () => {
    const c = await as(alice);
    await expect(
      c.query(
        "insert into public.scans (url, normalized_url, url_hash, status) values ('https://a.com','https://a.com',$1,'done')",
        [HASH],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      c.query(
        "insert into public.scans (url, normalized_url, url_hash, user_id) values ('https://a.com','https://a.com',$1,$2)",
        [HASH, bob],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(c.query("update public.scans set status = 'done'")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("users see only their own scans; service role writes status", async () => {
    const s = await service();
    const { rows } = await s.query(
      "insert into public.scans (user_id, url, normalized_url, url_hash, status, progress, finished_at) values ($1,'https://b.com','https://b.com',$2,'done',100,now()) returning id",
      [bob, HASH2],
    );
    await s.query("update public.scans set status = 'collecting', progress = 10 where id = $1", [
      rows[0].id,
    ]);
    const a = await as(alice);
    const seen = await a.query("select user_id from public.scans");
    expect(seen.rows.every((r) => r.user_id === alice)).toBe(true);
  });

  it("release_scan_quota is service-role only", async () => {
    const c = await as(alice);
    await expect(c.query("select public.release_scan_quota($1)", [alice])).rejects.toThrow(
      /permission denied/,
    );
    const s = await service();
    const before = (
      await admin.query("select count from public.scan_usage where user_id = $1", [alice])
    ).rows[0].count;
    await s.query("select public.release_scan_quota($1)", [alice]);
    const after = (
      await admin.query("select count from public.scan_usage where user_id = $1", [alice])
    ).rows[0].count;
    expect(after).toBe(before - 1);
  });

  it("audit table is invisible to users", async () => {
    const c = await as(alice);
    await expect(c.query("select * from public.scan_audit")).rejects.toThrow(/permission denied/);
  });

  it("migration is idempotent", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const sql = readFileSync(
      join(import.meta.dirname, "../migrations/20261104000000_app_core.sql"),
      "utf8",
    );
    await admin.query(sql);
    await admin.query(sql);
  });
});
