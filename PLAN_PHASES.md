# PLAN — Phased sponsor implementation

Order: SingleStore → Firedrill → Cognee → stretch. Every phase is
env-gated, so each probe has a **no-creds leg** (must behave exactly
like today) and a **creds leg** (lights up when keys land in `.env`).

See: PLAN_SINGLESTORE.md · PLAN_FIREDRILL.md · PLAN_COGNEE.md

## Status (live-verified)

- **Phase 0–1 done + creds-verified**: SingleStore connected, 14
  `price_reference` rows seeded, ledger record/read live, product-specific
  price match fixed (Aeron → $1395, not Eames $5995), `closeS2()` ends the
  process cleanly. No-creds leg: SQLite path unchanged, pipeline probe passes.
- **Phase 2a/2b done + locally verified**: `sendClaim` env-gate, custom
  `giver-inbox` tool package (`tools validate` passes), descriptor + plan +
  drill-adapter route. End-to-end on this machine: claim suspended with
  zero sends → approve → `via:"firedrill"`, `ref:"msg:probe-t2"` → repeat
  approve no-op. Remaining: `firedrill init` sign-in, `tools push`,
  library/world saves, `plan`/`apply`/`run` (see `firedrill/README.md`).
- **Phase 3 done + creds-verified**: `remember` writes files to the
  `hoardr_taste` dataset; `recallTaste` via `POST /api/v1/search`
  (GRAPH_COMPLETION, `datasets` scoped — `/recall` only reads
  default_dataset) returned real learned themes (brands, materials,
  categories) in ~5s; 404/422/timeout → keyword-only fallback.
- **Phase 2c / Phase 4 open.**

## Phase 0 — hygiene (no creds)

- Commit pending work: SPONSORS.md, PLAN_*.md, the motion-animation
  page changes.
- `npm i singlestore-nodejs`
- `.env`: add commented placeholders for all new vars (list below).

**Probe:** `npm run dev` boots; `node lib/pipeline.ts 5` runs and still
writes `data/ledger.db`. Nothing about behavior changes.

## Phase 1 — SingleStore

**1a. Ledger abstraction** — `LedgerStore` interface; current class →
`SqliteLedger`; `record()` goes async; update `scan.ts` ×2 +
`pipeline.ts`.
*Probe (no creds):* scan run writes judgments to `data/ledger.db` —
count grows after `npm run dev` scan.

**1b. SingleStoreLedger + pickLedger()** — `singlestore-nodejs/promise`
connection; env gate on `SINGLESTORE_HOST`.
*Probe (creds):* node REPL one-liner inserts + reads a row; then a
dev-scan → `SELECT * FROM judgments` in the SingleStore SQL Editor
fills live. *Probe (no creds):* identical to 1a.

**1c. price_reference** — `scripts/seedPrices.ts` (10–15 demo-brand
rows); `judgeListing` attaches `{price, sourceUrl}` to `verdict` event
when `identity ∈ {confirmed_model, brand_only}` + keyword match; mint
tag on Find card + receipt row.
*Probe (creds):* scan a corpus slice containing a seeded brand → tag
"usually ~$X new" renders + links out. *Probe (no creds):* no tag,
scan unaffected.

## Phase 2 — Firedrill

**2a. sendClaim env-gate** — `POST $GIVER_INVOKE_URL`
`{operation:"messages.send", arguments, idempotency_key}`; `via` in the
`claim_sent` event.
*Probe (no creds):* claim → approve → "sent ✓ (simulated)" unchanged.

**2b. Tool + descriptor + plan** — `tools/giver/` package
(`firedrill tools init` → `tool.json` ops `messages.send`/`messages.list`
→ `bundle/app/` fake inbox → `validate` → `push`); `descriptor.json`
committed (dependency `giver`, `GIVER_INVOKE_URL` config, `http.v1`
driver + `/api/drill` adapter endpoint); `plan.json` gitignored with
`dependency_env` routing.
*Probe:* `firedrill tools validate` passes; `firedrill status --plan
plan.json` is clean.

**2c. Drills** — world maps `giver` → tool version; scenario "approve
the claim" + outage variant.
*Probe:* drill report = exactly one `messages.send` recorded with the
draft, **zero before approval** (the safety claim); outage drill →
`dependency_unavailable` → receipt shows simulated fallback.

## Phase 3 — Cognee

**3a. Tap capture** — `POST /api/taste {listingId,title,signal}`;
appends `wants.json` `swipes`; fired from `setInspect`/`claim`/
`approve` in `page.tsx` (fire-and-forget).
*Probe (no creds):* tap a pile card → `swipes` grows in `wants.json`.

**3b. Async taste path** — `loadTaste()` + `tasteScore(l, ctx)`; call
sites `scan.ts:142`, `pipeline.ts:45`; profile loaded once per run.
*Probe (no creds):* T11 values identical to keyword-only baseline.

**3c. Cognee client** — `lib/memory/cognee.ts`: `remember()` →
`POST /api/v1/remember` (multipart, dataset `hoardr_taste`);
`recallTaste()` → `POST /api/v1/recall`; blend into `tasteScore`;
`422`/`5xx` → keyword-only.
*Probe (creds):* `curl` remember → 2xx; tap several mid-century cards →
next scan shows T11 drift vs baseline; `GET /api/v1/search` history in
Cognee UI shows the recall.

## Phase 4 — stretch (only if 1–3 landed)

- SingleStore `VECTOR` dedupe: `embed()` via Gateway → similar-listing
  check in `pickPool`; "similar to a past keeper" card tag.
- Cognee-grounded `chatAbout` ("why would I want this?").
- `claims` table → `GET /api/claim/:id` → "sent via firedrill · id" UI.
- Cheap extras: Statsig Dynamic Config for the bar; Amplitude
  claim→approve funnel. Only name them in the pitch if they work.

## Credentials needed (user fetches)

| Var | Purpose | Source |
|---|---|---|
| `SINGLESTORE_HOST` `PORT` `USER` `PASSWORD` `DB` | ledger + prices | portal.singlestore.com → Connect → Your App |
| `COGNEE_URL` `COGNEE_TENANT_ID` `COGNEE_API_KEY` | taste memory | platform.cognee.ai → API Keys → Connection panel |
| — (firedrill CLI login) | claim drills | app.firedrill.run + `npm i -g firedrill-run` ≥3.0.5; `GIVER_INVOKE_URL` is injected per-drill, never stored |

Already set: `AI_GATEWAY_API_KEY`, `TRASHNOTHING_API_KEY`,
`JUDGE_MODEL`, `JUDGE_VISION_MODEL`, `FREECYCLE_*`.
Optional/defaults exist: `CHAT_MODEL`, `TN_LAT/LNG/RADIUS_M`,
`BLOB_READ_WRITE_TOKEN` (Vercel auto), `STATSIG_KEY`,
`AMPLITUDE_API_KEY`.
