// Giver inbox — synthetic "message the listing giver" service for Firedrill drills.
// Dependency-free Node HTTP server. Models the one seam Hoardr's claim
// workflow crosses after user approval:
//   POST {"operation":"messages.send","arguments":{"listingId","body"},"idempotency_key"}
// Sends dedupe per listing: a repeat approval returns the original message
// with duplicate:true instead of recording a second send. availability.set
// flips the inbox off so drills prove the agent's simulated fallback.

import { createServer } from "node:http";

const messages = new Map(); // rowId -> {listingId, body, sent}
let available = true;

const ops = {
  "messages.send"(args) {
    if (!available) return { status: 503, body: { error: "UNAVAILABLE", message: "giver inbox is unavailable" } };
    const listingId = String(args.listingId);
    const id = `msg:${listingId}`;
    if (messages.has(id)) return { status: 200, body: { id, listingId, status: "sent", duplicate: true } };
    messages.set(id, { listingId, body: String(args.body), sent: true });
    return { status: 200, body: { id, listingId, status: "sent", duplicate: false } };
  },
  "messages.list"(args) {
    const limit = args.limit === undefined ? 50 : Number(args.limit);
    const after = args.afterId === undefined ? -1 : [...messages.keys()].indexOf(String(args.afterId));
    const items = [...messages.entries()].slice(after + 1, after + 1 + limit).map(([id, v]) => ({ id, ...v }));
    const rows = [...messages.keys()].slice(after + 1);
    return { status: 200, body: { items, nextCursor: rows.length > limit ? rows[limit - 1] : null } };
  },
  "messages.get"(args) {
    const id = String(args.id);
    if (!messages.has(id)) return { status: 404, body: { error: "NOT_FOUND", message: "No message exists with this ID." } };
    return { status: 200, body: { id, ...messages.get(id) } };
  },
  "availability.set"(args) {
    available = args.available === true;
    return { status: 200, body: { available } };
  },
  "availability.get"() {
    return { status: 200, body: { available } };
  },
};

const server = createServer(async (req, res) => {
  const json = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "GET" && req.url === "/health") return json(200, { ok: true });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const chunks = [];
  for await (const c of req) chunks.push(c);
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return json(400, { error: "bad_json" });
  }
  const op = ops[body.operation];
  if (!op) return json(404, { error: "operation_not_declared", operation: body.operation });
  const result = op(body.arguments ?? {});
  return json(result.status, result.body);
});

const port = Number(process.env.PORT ?? 8080);
server.listen(port, "127.0.0.1", () => console.log(`giver-inbox ready on ${port}`));
