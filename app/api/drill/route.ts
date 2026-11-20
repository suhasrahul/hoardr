import { resumeHook, start } from "workflow/api";
import { claimWorkflow } from "@/workflows/claim";

// Firedrill http.v1 driver adapter. Drill steps arrive as
// {message, session}; this routes them through the SAME claim workflow the
// UI uses — start claim (suspends on the approval hook), resume approval.
// Pipe-separated intents so a scenario can drive it deterministically:
//   "claim|<listingId>|<title>"  -> draft + suspend (no send; approval gate holds)
//   "approve|<listingId>"        -> resume the hook; sendClaim runs next
//   "inbox"                      -> report synthetic inbox count via GIVER_INVOKE_URL
// Replies go back as {reply} per the driver's response_pointer.

// Run handles must survive across the claim -> approve requests.
const runs = new Map<string, Awaited<ReturnType<typeof start>>>();

async function inboxCount(): Promise<number | null> {
  const invoke = process.env.GIVER_INVOKE_URL;
  if (!invoke) return null;
  try {
    const res = await fetch(invoke, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "messages.list", arguments: { limit: 100 } }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: unknown[] };
    return Array.isArray(data.items) ? data.items.length : null;
  } catch {
    return null;
  }
}

async function pollInbox(before: number | null, ms = 3000): Promise<number | null> {
  const deadline = Date.now() + ms;
  let last = before;
  while (Date.now() < deadline) {
    const now = await inboxCount();
    if (now !== null) last = now;
    if (before === null || (last !== null && last > before)) return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  return last;
}

export async function POST(req: Request) {
  const { message } = (await req.json().catch(() => ({}))) as { message?: string };
  const [verb, id, title] = String(message ?? "").split("|").map((s) => s.trim());

  if (verb === "claim" && id) {
    const before = await inboxCount();
    const run = await start(claimWorkflow, [id, title || "item"]);
    runs.set(id, run);
    return Response.json({ reply: { pending: true, id, runId: run.runId, inbox: before } });
  }
  if (verb === "approve" && id) {
    const before = await inboxCount();
    const run = runs.get(id);
    try {
      await resumeHook(`claim:${id}`, { approved: true });
    } catch {
      const inbox = await inboxCount();
      return Response.json({ reply: { approved: false, reason: "no pending claim", id, inbox } });
    }
    // sendClaim runs after the resume; its return carries via/ref for evidence
    const result = run
      ? ((await Promise.race([
          run.returnValue as Promise<{ via?: string; ref?: string; sent?: boolean }>,
          new Promise((r) => setTimeout(() => r(null), 10000)),
        ])) as { via?: string; ref?: string } | null)
      : null;
    const inbox = await pollInbox(before);
    return Response.json({ reply: { approved: true, id, via: result?.via ?? null, ref: result?.ref ?? null, inbox } });
  }
  if (verb === "inbox") {
    return Response.json({ reply: { inbox: await inboxCount() } });
  }
  return Response.json({
    reply: { error: "unknown intent", usage: ["claim|<id>|<title>", "approve|<id>", "inbox"] },
  });
}
