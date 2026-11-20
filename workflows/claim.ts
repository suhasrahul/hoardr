import { createHook, getWritable } from "workflow";

// Claim workflow — draft → approval hook → simulated send → action receipt.
// The hook suspension IS the "waiting for your approval" UI state; it
// resumes when POST /api/claim/:id calls resumeHook.

const enc = new TextEncoder();

async function draftClaim(listingId: string, title: string): Promise<string> {
  "use step";
  return `Hi! Saw your ${title} — is it still available? I can pick up today. Thanks!`;
}

async function sendClaim(listingId: string, draft: string): Promise<{ sentAt: string; via: string; ref?: string }> {
  "use step";
  // Firedrill's synthetic giver-inbox when the CLI injected
  // GIVER_INVOKE_URL (a drill is running); otherwise the local simulated
  // claim record. Fallback fires on any invoke error — same receipt,
  // still labeled "simulated".
  let via = "simulated";
  let ref: string | undefined;
  const invoke = process.env.GIVER_INVOKE_URL;
  if (invoke) {
    try {
      const res = await fetch(invoke, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "messages.send",
          arguments: { listingId, body: draft },
          idempotency_key: `claim:${listingId}`,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`invoke ${res.status}`);
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      via = "firedrill";
      ref = data.id;
    } catch (err) {
      console.error(`firedrill send failed for ${listingId} — simulated fallback:`, (err as Error).message);
    }
  }
  const w = getWritable<Uint8Array>().getWriter();
  await w.write(
    enc.encode(
      `data: ${JSON.stringify({ type: "claim_sent", id: listingId, draft, via, ref, simulated: via === "simulated", at: new Date().toISOString() })}\n\n`,
    ),
  );
  w.releaseLock();
  return { sentAt: new Date().toISOString(), via, ref };
}

async function emitPending(listingId: string, draft: string): Promise<void> {
  "use step";
  const w = getWritable<Uint8Array>().getWriter();
  await w.write(
    enc.encode(`data: ${JSON.stringify({ type: "claim_pending", id: listingId, draft })}\n\n`),
  );
  w.releaseLock();
}

export async function claimWorkflow(listingId: string, title: string) {
  "use workflow";
  const draft = await draftClaim(listingId, title);
  const hook = createHook<{ approved: boolean }>({ token: `claim:${listingId}` });
  await emitPending(listingId, draft);
  const { approved } = await hook;
  if (!approved) return { sent: false };
  const { sentAt, via, ref } = await sendClaim(listingId, draft);
  return { sent: true, sentAt, via, ref, simulated: via === "simulated" };
}
