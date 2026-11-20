# PLAN — Cognee: taste memory

**Priority: last — cut if tight** (per SPONSORS.md).
`wants.json` remains the working fallback throughout.

## Sponsor story

Card taps → durable "your eye" profile in Cognee → recalled before
scoring → feeds T11 (taste match, weight 0.25 in `WEIGHTS` at
`lib/judge/score.ts:21`).

## Doc-verified API (docs.cognee.ai — Cognee Cloud HTTP API)

- **Base URL**: `https://tenant-<id>.aws.cognee.ai` (or `.gcp`) — copy
  from **API Keys → Connection panel**. This is `COGNEE_URL`.
- **Auth headers** (confirmed, matches SPONSORS.md):
  `X-Api-Key: <key>` + `X-Tenant-Id: <tenant>`. Cloud uses API keys, NOT
  bearer tokens.
- **All endpoints under `/api/v1`** (`/api` alone → 404):
  - `POST /api/v1/remember` — multipart form: `datasetName` + repeated
    `raw_data` fields. Ingest + graph-build in one call. ← our tap write.
  - `POST /api/v1/recall` — JSON `{query}` (required). Auto-routes to the
    best retrieval; **results are ranked toward what the user has rated
    well / stated preferences** — literally built for taste memory. ←
    our pre-scan read.
  - `POST /api/v1/search` — `{query, search_type}` if we need explicit
    control (e.g. `GRAPH_COMPLETION`).
- **Errors**: `422 "Recall prerequisites not met"` before any graph
  exists → treat as empty profile, use `wants.json`. `402` = token
  budget exhausted (terminal, don't retry). `403` = dataset perms.
  Errors carry `detail` (+ optional `remediation` hint).
- **New since SPONSORS.md**: `@cognee/cognee-ts` TypeScript SDK now
  exists (Neon bindings over cognee-rs). We're still using **plain
  REST** — zero deps, deploys cleanly to Vercel, no native bindings.

## Credentials (user provides, `.env`)

```
COGNEE_URL=          # e.g. https://tenant-xxx.aws.cognee.ai
COGNEE_TENANT_ID=
COGNEE_API_KEY=
```

platform.cognee.ai → API Keys (Connection panel shows all three).

## Grounding notes (verified in code)

- `lib/memory/taste.ts` — `loadWants()` sync-reads `data/wants.json`;
  `tasteMatch(l, w)` = keyword overlap → 0..1.
- T11 is ours, not the model's: `scan.ts:142`, `pipeline.ts:45`;
  carried into eye probs at `scan.ts:201`.
- `tasteMatch` is synchronous; recall is a network call → new async
  path. Both call sites already async — small refactor.
- **No swipe capture exists** — `wants.json`'s `swipes: []` is never
  written. Card tap = `setInspect(c)` in `app/page.tsx`; positive
  signals also = CLAIM / APPROVE taps. Needs a new API route.
- `loadWants()` runs per listing inside the step → cache the recalled
  profile once per run (`scanWorkflow` loop), refresh each run.

## Steps

1. `lib/memory/cognee.ts` (new) — thin REST client:
   `remember(text)` → `POST /api/v1/remember` (FormData, dataset
   `hoardr_taste`); `recallTaste()` → `POST /api/v1/recall` with a fixed
   query like "What kinds of free items and styles does this user keep
   or inspect?" → parse answer text into themes. ~5s timeouts, errors
   logged + return null.
2. `app/api/taste/route.ts` (new) — `POST {listingId, title, signal}`
   (`inspect|keep|claim|approve`). With `COGNEE_*` → `remember()`;
   always appends to `wants.json` `swipes`. Fire-and-forget from UI.
3. `app/page.tsx` — `fetch("/api/taste", …)` on `setInspect`, `claim`,
   `approve`. Never await it in the UI path.
4. `lib/memory/taste.ts` — `async loadTaste()` (per-run: wants.json +
   optional Cognee themes) and `async tasteScore(l, ctx)` blending
   recall themes with keyword `tasteMatch`. Vetoes stay local and
   absolute — Cognee informs T11, it can never veto.
5. Call sites — `scan.ts:142` / `pipeline.ts:45` →
   `probs.T11 = await tasteScore(l, taste)`; hoist `loadTaste()` to the
   workflow/`run` scope.
6. Verify: tap a few lamp/mid-century cards → next scan's T11 leans that
   way vs a `wants.json`-only baseline run.

## Fallback / gates

- No `COGNEE_*` → current keyword path, unchanged.
- Recall fails/timeout/`422` → `tasteMatch` alone; scan lane never
  stalls on Cognee.

## Demo artifact

- Two consecutive scans: tap mid-century lamps between them → T11
  drifts. "It learned my taste between runs."
- Cognee Cloud UI shows the `hoardr_taste` dataset + recall history.

## Cut criteria

Cut at the deadline if recall isn't verified — keep the API route +
local `swipes` writes anyway (feeds the future swap-in, costs nothing).
