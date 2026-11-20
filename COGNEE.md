# Hoardr — Cognee Taste Memory Setup

Nov 20, 2026 · @SR

Cognee is Hoardr's taste memory: when the user taps a card, we remember it
in Cognee; before scoring, we recall a taste profile and use it in the taste
match (T11). Everything falls back to `wants.json` if Cognee is unavailable.

## Setup

Add these three lines to your local `.env`. The URL and tenant ID are below;
the API key is not in this doc on purpose — Suhas sends it to you by DM.
Never commit it.

```bash
COGNEE_URL=https://tenant-<your-tenant-id>.aws.cognee.ai
COGNEE_TENANT_ID=<your-tenant-id>
COGNEE_API_KEY=<from Suhas, by DM>
```

Every request sends two headers: `X-Api-Key` and `X-Tenant-Id`. Our tenant's
own API reference is at `<COGNEE_URL>/docs`; the general docs are at
docs.cognee.ai.

Quick test (should return a list, even `[]`):

```bash
curl -H "X-Api-Key: $COGNEE_API_KEY" \
     -H "X-Tenant-Id: $COGNEE_TENANT_ID" \
     "$COGNEE_URL/api/v1/datasets/"
```

## Code

Two calls, per Cognee's docs: `POST /api/v1/remember` adds data and builds
the knowledge graph in one step (multipart form with `data` file +
`datasetName`), and `POST /api/v1/search` queries it with a `query`, a
`search_type` and the `datasets` to look in. Text goes in as a `.txt` file.
Response shapes aren't fully documented, so log the first real response and
adjust the parsing.

Suggested file: `lib/memory/cognee.ts`

```ts
const BASE = process.env.COGNEE_URL;
const KEY = process.env.COGNEE_API_KEY;
const TENANT = process.env.COGNEE_TENANT_ID;
const DATASET = "hoardr_taste";

export const cogneeEnabled = Boolean(BASE && KEY && TENANT);

const headers = () => ({ "X-Api-Key": KEY!, "X-Tenant-Id": TENANT! });

// Call when the user taps a card they'd grab.
export async function rememberTap(item: {
  title: string; category?: string; brand?: string;
  condition?: string; reason?: string;
}) {
  if (!cogneeEnabled) return { ok: false, reason: "disabled" };
  const text = [
    `User wants items like: ${item.title}`,
    item.category && `Category: ${item.category}`,
    item.brand && `Brand: ${item.brand}`,
    item.condition && `Condition: ${item.condition}`,
    item.reason && `Why: ${item.reason}`,
  ].filter(Boolean).join("\n");

  const form = new FormData();
  form.append("data", new Blob([text], { type: "text/plain" }), `tap-${Date.now()}.txt`);
  form.append("datasetName", DATASET);

  try {
    const res = await fetch(`${BASE}/api/v1/remember`, {
      method: "POST", headers: headers(), body: form,
      signal: AbortSignal.timeout(15000),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

// Call before scoring; returns a short taste profile or null.
export async function recallTaste(): Promise<string | null> {
  if (!cogneeEnabled) return null;
  try {
    const res = await fetch(`${BASE}/api/v1/search`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "Summarize what kinds of items, brands and conditions this user likes, in one short paragraph.",
        search_type: "GRAPH_COMPLETION",
        datasets: [DATASET],
        include_references: false,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    console.log("[cognee] recall raw", JSON.stringify(data).slice(0, 500));
    return typeof data === "string" ? data : JSON.stringify(data);
  } catch {
    return null;
  }
}
```

## Wiring into Hoardr

1. **On card tap** (calibration, "tap 3 cards you'd grab"): call
   `rememberTap()` with the listing's title, category, brand (from the vision
   pass) and condition.
2. **Before scoring** (`lib/memory/taste.ts`): call `recallTaste()` once per
   scan, not per listing, and cache the result for the run.
3. **In the taste match (T11):** pass the profile to the judge alongside
   `wants.json`. Plain code still decides; record Cognee's input separately in
   the receipt, e.g. "Your eye: likes vintage lamps, solid wood."
4. **On the card:** show a small "your eye" chip when the profile influenced
   the match.

## Rules

- **Fallback:** if `cogneeEnabled` is false, or a call errors or times out,
  use `wants.json` only. The demo must work without Cognee.
- **Cut time:** if it isn't working by 3:00 PM, leave it out and don't name
  Cognee in the pitch.
- **Secrets:** the API key stays in `.env`, never in the repo, Discord
  channels or this doc.
- **Before relying on it:** run one `rememberTap()` + `recallTaste()` by hand
  and check the response shape against `<COGNEE_URL>/docs`.
