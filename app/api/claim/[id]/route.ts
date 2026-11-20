import { resumeHook, start } from "workflow/api";
import { claimWorkflow } from "@/workflows/claim";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (body.action === "approve") {
    try {
      await resumeHook(`claim:${id}`, { approved: true });
      return Response.json({ ok: true, resumed: `claim:${id}` });
    } catch {
      return Response.json({ error: "no pending claim" }, { status: 404 });
    }
  }
  const run = await start(claimWorkflow, [id, body.title ?? "item"]);
  return Response.json({ ok: true, runId: run.runId, hook: `claim:${id}` });
}
