import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4000);
const startedAt = Date.now();

/**
 * Scanner service. Scaffold only: a single health route until the
 * fetch/analyze pipeline lands. Types for Scan payloads live in @red/shared.
 */
const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "red-scanner",
        uptimeMs: Date.now() - startedAt,
      }),
    );
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found", path: req.url }));
});

server.listen(PORT, () => {
  console.log(`red-scanner listening on :${PORT}`);
});
