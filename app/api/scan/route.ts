import { start } from "workflow/api";
import { scanWorkflow } from "@/workflows/scan";

// Vercel caps the streaming function at 300s. A run must finish well
// under that: ~3.5s/listing text pass + ~8s per eye pass, so 30 items
// worst-case ≈ 2min. Bigger scans belong to the detached workflow —
// they keep running server-side even after the stream disconnects.
export const maxDuration = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dir = url.searchParams.get("dir") ?? "data/corpus";
  // 50 fits under 300s with a short pace (Jev text ≈ 0.5–1.5s measured live).
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 50);
  const paceMs = Number(url.searchParams.get("pace") ?? 1000);
  const live = url.searchParams.get("live") === "1";
  // The run judges at the fixed lenient bar — the picky dial is a
  // post-run UI filter, not a scan parameter. runToken namespaces the
  // selection/chat hooks so concurrent runs can't cross-talk.
  const runToken = crypto.randomUUID();
  const run = await start(scanWorkflow, [dir, paceMs, limit, live, runToken]);
  return new Response(run.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
