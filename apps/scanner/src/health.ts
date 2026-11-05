import { createServer, type Server } from "node:http";
import type { Db } from "./db";
import type { Worker } from "./worker";

/** GET /health: queue depth from Postgres plus this worker's own state. */
export function startHealth(port: number, db: Db, worker: Worker): Server {
  const server = createServer(async (req, res) => {
    if (req.method !== "GET" || req.url !== "/health") {
      res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "not_found" }));
      return;
    }
    let queue: unknown = null;
    let dbOk = true;
    try {
      queue = await db.queueStats();
    } catch (e) {
      dbOk = false;
      queue = { error: (e as Error).message };
    }
    const s = worker.state;
    const ok = dbOk && s.running && !s.draining;
    res.writeHead(ok ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(
      JSON.stringify({
        status: ok ? "ok" : "degraded",
        service: "red-scanner",
        worker: {
          id: s.workerId,
          running: s.running,
          draining: s.draining,
          concurrency: s.concurrency,
          active: s.active,
          completed: s.completed,
          failed: s.failed,
          lastClaimAt: s.lastClaimAt,
          lastError: s.lastError,
          realtime: s.realtime,
          startedAt: s.startedAt,
        },
        queue,
      }),
    );
  });
  server.listen(port);
  return server;
}
