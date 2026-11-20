import { appendSwipe } from "@/lib/memory/taste.ts";

// Taste tap — fire-and-forget from card taps / claim / approve. Always
// records locally (wants.json swipes); with COGNEE_* configured it also
// feeds the taste graph so the next scan's T11 drifts.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { listingId, title, signal } = body as {
    listingId?: string;
    title?: string;
    signal?: string;
  };
  if (!listingId || !signal) {
    return Response.json({ error: "listingId + signal required" }, { status: 400 });
  }

  appendSwipe({ id: listingId, signal, title: title ?? "" });

  if (process.env.COGNEE_API_KEY) {
    const { remember } = await import("@/lib/memory/cognee.ts");
    const verb =
      signal === "approve" || signal === "claim" ? "CLAIMED"
      : signal === "keep" ? "KEPT"
      : "INSPECTED but passed on";
    void remember(`user ${verb} a free-stuff listing: "${title ?? listingId}"`).catch(() => {});
  }

  return Response.json({ ok: true });
}
