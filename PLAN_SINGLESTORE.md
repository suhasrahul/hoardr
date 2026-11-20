# PLAN — SingleStore: ledger + price reference

**Priority: build first.** Pure code — no platform setup blocks
progress, and it makes Firedrill's claim receipts persist for free.

## Why it's the best sponsor story

- Fixes a real wart: `workflows/scan.ts:153-163` and `217-227` swallow
  ledger errors because Vercel's FS is read-only — receipts silently
  don't persist on the deployed demo. A network DB fixes that.
- `price_reference` gives keepers a "usually ~$X new" tag — visible on
  the Find card without touching the verdict.

## Doc-verified connection (docs.singlestore.com)

- SingleStore is **MySQL wire-compatible**, but the official Node.js
  path is their own driver:
  `npm install singlestore-nodejs` →
  `import singlestore from "singlestore-nodejs/promise"` →
  `await singlestore.createConnection({host, port, user, password,
  database})` → `conn.execute(sql, params)` → `conn.end()`.
  Using their driver is a better sponsor story than `mysql2`.
- **SSL is required for Shared-cluster connections** — Starter
  workspaces count; pass the `ssl` option (see
  connect-with-node-js/connect-with-node-js-using-ssl.md at impl time).
- Alternative if the driver misbehaves: `mysql2` works wire-compatibly,
  or the HTTP Data API (`docs.singlestore.com/cloud/reference/data-api.md`).

## Credentials (user provides, `.env`)

```
SINGLESTORE_HOST=
SINGLESTORE_PORT=        # usually 3306 or 3333
SINGLESTORE_USER=
SINGLESTORE_PASSWORD=
SINGLESTORE_DB=
```

Free Starter Workspace: portal.singlestore.com → Connect → Your App.

## Grounding notes (verified in code)

- `lib/judge/ledger.ts` — `Ledger` over `node:sqlite`. API:
  `record(listingId, j, stage)`, `forListing`, `counts`, `contested`,
  `close`. Called synchronously in `scan.ts` (2 sites) and
  `lib/pipeline.ts` — all inside async `"use step"`/`run()`, so making
  the API async is mechanical.
- `lib/ingest/seenStore.ts` — `SeenStore` (`seen` table) +
  `ListingStore` (`listings` table), same file/DB. `ListingStore` is
  only used by `lib/pipeline.ts`, NOT the scan workflow.
- Env-gated selection pattern to copy: `pickJudge()`/`pickEye()` at
  `lib/judge/model.ts:221-226`.
- **Gotcha:** eye `identity` is a classification (`confirmed_model` /
  `brand_only` / …), not an extracted brand name — `experimental_decide`
  choice questions can't emit free text. Price lookup keyword-matches
  `brand`/`product` against title+body (same trick `mockJudge` T6 uses
  at `lib/judge/model.ts:36`).

## Steps

1. `npm i singlestore-nodejs` (promise API; `ssl` on shared cluster).
2. `lib/judge/ledger.ts` — extract a `LedgerStore` interface; current
   class becomes `SqliteLedger`; add `SingleStoreLedger`
   (`CREATE TABLE IF NOT EXISTS judgments`, same columns;
   `INSERT ... ON DUPLICATE KEY UPDATE` replaces `INSERT OR REPLACE`;
   note SingleStore needs the PK columns indexed — keep the same
   `PRIMARY KEY (listing_id, prior, stage)`). All methods `async`.
3. `pickLedger()` factory — SingleStore when env present, SQLite
   otherwise. Update `workflows/scan.ts` (two blocks) and
   `lib/pipeline.ts`: `await ledger.record(...)`.
4. Same env-gated treatment for `SeenStore` + `ListingStore`
   (`lib/store/singlestore.ts` holds the shared connection helper; blob
   stays the Vercel `seen` fallback).
5. `price_reference` table: `product, brand, model, typical_new_price,
   source_url, checked_date`. `scripts/seedPrices.ts` seeds 10–15 rows
   for demo brands already in `mockJudge` T6 (Herman Miller, Dyson, Le
   Creuset, Sonos, Miele…) + common free-stuff categories.
6. In `judgeListing` (`workflows/scan.ts`), after the eye pass: when
   `identity ∈ {confirmed_model, brand_only}`, keyword-match
   brand/product against `l.title + l.body` → query `price_reference`
   → attach `{price, sourceUrl}` to the `verdict` event payload.
7. `app/page.tsx` — mint tag "usually ~$X new" (link → `source_url`) on
   the Find card beside `VALUE_TAG`, plus a row in the RECEIPT
   dropdown. Verdict logic untouched.

## Fallback / gates

- No `SINGLESTORE_*` → exactly today's behavior (SQLite / blob / no
  price tag).
- Price lookup failure → no tag, scan continues (match + query
  wrapped, logged).
- Price is metadata only — never scores, never changes a verdict.

## Demo artifact

- Receipt on a keeper shows "usually ~$X new" with a source link.
- `SELECT` in the SingleStore SQL Editor shows `judgments` filling live
  during a scan — including on the Vercel deploy where SQLite couldn't
  write.

## Cut criteria

Drop the `seen`/`listings` migration if it drags — the demo only needs
`judgments` + `price_reference`.
