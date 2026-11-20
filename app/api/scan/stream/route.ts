import { getRun } from "workflow/api";

// Reconnect lane: the durable stream keeps every emitted chunk, so a
// dropped EventSource can resume mid-run — and a long chat is no longer
// bounded by the 300s cap on the original /api/scan response.
export const maxDuration = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  const from = Number(url.searchParams.get("from") ?? 0);
  if (!runId) return new Response("runId required", { status: 400 });
  try {
    const run = getRun(runId);
    return new Response(run.getReadable({ startIndex: from }) as ReadableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch {
    return new Response("run not found", { status: 404 });
  }
}
