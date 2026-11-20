import { resumeHook } from "workflow/api";

// One endpoint resumes whichever hook a scan run is waiting on —
// selection ({id}) or a chat turn ({q} / {done:true}). The token is
// emitted by the run itself in round_done / chat_ready events.
export async function POST(req: Request) {
  const { token, payload } = await req.json().catch(() => ({}));
  if (!token) return Response.json({ error: "missing token" }, { status: 400 });
  try {
    await resumeHook(token, payload ?? {});
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "no pending hook for token" }, { status: 404 });
  }
}
