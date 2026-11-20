# Sponsor plan

We're going with the 3 sponsors that presented: **Firedrill, SingleStore,
Cognee** (dropping Senso). In priority order:

## ⚠️ Hadrien: please redeploy (Suhas, 3:50 PM)

`main` has new app changes that aren't on Vercel yet — Suhas's machine
isn't linked to the Vercel project. Please run `npx vercel deploy --prod`
from your checkout after pulling:

- Live feed only, blinking LIVE badge (falls back + shows SAVED LISTINGS)
- Price estimate on every listing (T2p in the text pass; eye overrides),
  price chip on every card; value rescue rule removed (price never decides)
- Scans of 50 (route cap 30→50, pace 400ms, live fetch 100)
- `next build` passes locally

## Status (Suhas, 2:20 PM) — creds are in `.env` on main, just `git pull`

- **Cognee** ✅ `COGNEE_URL`, `COGNEE_TENANT_ID`, `COGNEE_API_KEY` set.
  Tested: `GET /api/v1/datasets/` → 200. Headers: `X-Api-Key` +
  `X-Tenant-Id`.
- **SingleStore** ✅ `SINGLESTORE_HOST/PORT/USER/PASSWORD/DB` set,
  login tested over SSL, database `hoardr` created. Password is quoted in
  `.env` (it contains `#`) — Node's `--env-file` reads it correctly.
  Workspace auto-suspends after 20 min idle; if connections fail, resume
  it: `POST https://api.singlestore.com/v1/workspaces/<workspace-id>/resume`
  with `Authorization: Bearer $SINGLESTORE_API_KEY` (key also in `.env`).
- **Firedrill** 🟡 partly set up (Suhas, 2:51 PM) — CLI 3.0.11 on Node
  26.13.1, signed in to workspace **HH** (`<firedrill-workspace-id>`).
  - ✅ `firedrill register` → agent **Hoardr** `<agent-id>`
    (descriptor rev 1, sha256 `b621fdea…`)
  - ✅ persona saved: "Free-stuff hunter" (version `<persona-version-id>`)
  - ⏳ `giver-inbox` tool pushed (request `<tool-request-id>`),
    still **inspecting** — not in `firedrill tools definitions` yet
  - ❌ both evaluations rejected with `native_state_selection_invalid` —
    likely because their `exact_checks` reference the `giver` tool that
    isn't ready yet. Retry after the tool clears inspection.
  - Not started: scenarios, `world save`, plan/apply/run, report.
  - Cut rule: if drills aren't running by ~3:10, leave Firedrill out of
    the pitch; claims stay `via: "simulated"` (already works).
- All of these get rotated before the repo goes public.

## 1) Firedrill (claim action), needed by 2:30

- Sign up via firedrill.run/hacker-docs (or grab their team here),
  apply event code `TOKENSAND`, install `firedrill-run` CLI ≥3.0.5 —
  workspace auth, no API key. `GIVER_INVOKE_URL` is injected per-drill,
  never stored
- In `workflows/claim.ts`: after the approval hook resumes, the send step
  calls Firedrill's simulated service instead of the local mock
- Save the Firedrill response (id + status) in the action receipt
- Fallback: if Firedrill errors, use the local simulated claim record,
  still labeled "simulated"

## 2) SingleStore (store + price table), by 3:00

- portal.singlestore.com, the free Starter Workspace is created on signup.
  Connect → Your App, copy host/port/user/password/db into `.env`
  (`SINGLESTORE_*`)
- Move ledger/receipts from SQLite to SingleStore (keep SQLite as fallback
  when env vars are missing)
- Add a `price_reference` table: product, brand, model,
  typical_new_price, source_url, checked_date. Seed 10-15 rows for our
  demo items
- For keepers with a confirmed brand/model, look up the price and show
  "usually ~$X new" + source link in the receipt. Never changes the verdict

## 3) Cognee (taste memory), only if time, cut at 3:00

- platform.cognee.ai, sign up, API Keys → create key, copy tenant URL +
  tenant ID into `.env` (`COGNEE_URL`, `COGNEE_TENANT_ID`,
  `COGNEE_API_KEY`)
- SDK is Python, so call the REST API from TS with headers `X-Api-Key`
  and `X-Tenant-Id`
- `lib/memory/taste.ts`: when the user taps a card, remember it in Cognee;
  before scoring, recall the taste profile and use it in the taste match
  (T11)
- Fallback: `wants.json`

## Missing env — grab these

```
# SingleStore — portal.singlestore.com → free Starter Workspace → Connect → Your App
SINGLESTORE_HOST=
SINGLESTORE_PORT=
SINGLESTORE_USER=
SINGLESTORE_PASSWORD=
SINGLESTORE_DB=

# Cognee — platform.cognee.ai → API Keys → Connection panel (shows all 3)
COGNEE_URL=            # e.g. https://tenant-xxx.aws.cognee.ai
COGNEE_TENANT_ID=
COGNEE_API_KEY=

# Firedrill — no env vars. CLI login only:
#   npm i -g firedrill-run   (>= 3.0.5)  + app.firedrill.run + code TOKENSAND
```

Already set: `AI_GATEWAY_API_KEY`, `TRASHNOTHING_API_KEY`,
`JUDGE_MODEL`, `JUDGE_VISION_MODEL`, `FREECYCLE_*`.
Optional (have defaults or auto-set): `CHAT_MODEL`,
`TN_LAT/LNG/RADIUS_M`, `BLOB_READ_WRITE_TOKEN` (Vercel),
`STATSIG_KEY`, `AMPLITUDE_API_KEY`.

## Rules

- Keys only in `.env`, never committed
- Cut anything unfinished at 3:00
- In the pitch/submission we only name sponsors actually working in the
  demo

## Suhas

Merging the photo gate into main now, then making 3-4 keeper test
listings with my own photos so Finds isn't empty. From 3:00 I'll do the
clean repo, demo video and submission. Shout if you want me to take one
of these.
