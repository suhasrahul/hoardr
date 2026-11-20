# PLAN — Firedrill: simulated claim send

**Priority: second** (after SingleStore). Verified against
docs.firedrill.run — the mechanism is different from SPONSORS.md's
assumption, so read the corrected flow below.

## Status: built + locally verified — auth steps remain

- `sendClaim` env-gate shipped in `workflows/claim.ts` (invoke →
  `via:"firedrill"` + response id in receipt; any error → `via:"simulated"`).
- `app/api/drill/route.ts` — the http.v1 driver adapter (`claim|id|title`,
  `approve|id`, `inbox` intents through the real workflow + hook).
- `firedrill/giver-inbox/` — custom tool package; `tools validate` passes.
  `bundle/app/server.mjs` records sends, dedupes per listing, models the
  outage via `availability.set` (scenario `dependency_unavailable` events
  also exercise the fallback).
- `firedrill/descriptor.json` + `plan.template.json` + generated
  `firedrill/plan.json` (gitignored); persona/evaluation/scenario/world
  drafts alongside.
- **Verified live on this machine**: giver-inbox server + `GIVER_INVOKE_URL`
  + dev server → `claim|probe-t2` suspended with zero sends, `approve|…`
  returned `{via:"firedrill", ref:"msg:probe-t2"}`, second approve was a
  no-op with the inbox still at one message.
- Remaining (account-side): `firedrill init` sign-in, `tools push`,
  library saves, world save, plan/apply/run. Exact commands in
  `firedrill/README.md`.

## How Firedrill actually works (doc-verified)

Firedrill is a local simulation harness, not a hosted send API:

1. You write a **`descriptor.json`** declaring your agent's services and
   its external **dependencies** (name + operations only — no secrets,
   no paths). `firedrill register` uploads it → prints an agent ID +
   descriptor digest.
2. You write a **`plan.json`** (LOCAL ONLY — absolute paths, never
   committed) telling the CLI how to launch each service per-drill and
   which **env var receives each synthetic dependency's address**
   (`dependency_env`).
3. During a drill each dependency gets a fresh local address, e.g.
   `http://127.0.0.1:<port>/<key>/<alias>/v1/invoke`. Your agent calls it
   via `POST $THAT_URL` with `{operation, arguments, idempotency_key}`.
   Your agent never sees a Firedrill token — the env var is everything.
4. A **custom tool** is a simulated service you build for anything not
   in their catalog (Gmail/Slack/Stripe/…): `firedrill tools init` →
   `tool.json` + `bundle/app/` code → `validate` → zip →
   `firedrill tools push`.
5. Scenarios can force `503 dependency_unavailable` — our fallback path
   gets exercised **by design**, which is exactly the demo beat.

Docs: quickstart.md · connect/register-agent.md · connect/local-plan.md
· connect/tools.md · tools/custom-tools.md

## So the code change is small

`sendClaim` (`workflows/claim.ts:14-26`) calls
`process.env.GIVER_INVOKE_URL` when set:

```ts
POST $GIVER_INVOKE_URL
{ "operation": "messages.send",
  "arguments": { "listingId": id, "body": draft },
  "idempotency_key": `claim:${id}` }
```

Unset (normal dev/demo, no drill running) → existing mock path,
`via: "simulated"`. Firedrill errors (503 unavailable/not-ready, 403
undeclared) → log + same simulated fallback. Retry only with the same
`idempotency_key` — never mint a new one.

## Setup (user does, ~30 min)

1. app.firedrill.run → account + workspace → Billing → event code
   `TOKENSAND` (+1,500 credits).
2. `npm i -g firedrill-run` — must be ≥ 3.0.5 (`firedrill --version`),
   then workspace auth.

## Steps (I do)

1. `workflows/claim.ts` — env-gated invoke call above; emit `via` in the
   `claim_sent` stream event (`"firedrill"` | `"simulated"`).
2. `tools/giver/` — custom tool package: `tool.json` with one service +
   `messages.send` / `messages.list` ops (http transport), `bundle/app/`
   fake giver-inbox that records messages. Validate + push.
3. `descriptor.json` (committable — names/hashes only): service `agent`
   (the Next app), dependency `giver` {protocol: http, mode: synthetic,
   operations: [messages.send]}, configuration entry for
   `GIVER_INVOKE_URL`. Driver `http.v1` needs an entry endpoint the
   drill persona can talk to — likely a thin `POST /api/drill` adapter
   that runs `claimWorkflow` on a fixture listing (design at impl time;
   the dashboard's click-approve flow can't be driven over plain HTTP).
4. `plan.json` (gitignored): `mode: "launch"`, `command: npm run dev`
   (or a small node runner), `per_drill: true`, `port_env: "PORT"`,
   `dependency_env: [{alias:"giver", name:"GIVER_INVOKE_URL",
   url:"invoke"}]`, readiness http on a health route.
5. `firedrill register` → copy digest into plan → world mapping `giver`
   → tool version → scenario ("approve the claim on listing X") +
   error variant → `firedrill run --plan plan.json`.
6. Optional (needs SingleStore plan first): persist claim receipts to a
   `claims` table; `GET /api/claim/:id` returns `via` so the UI can say
   "sent via firedrill · <id>" instead of hardcoded "(simulated)".

## Fallback / gates

- No `GIVER_INVOKE_URL` → identical to today, labeled "simulated".
- Firedrill 5xx/403 → simulated fallback + log; scan lane never stalls.

## Demo artifact

- Drill report: `messages.send` recorded exactly once with the draft —
   "we verified the action, not the reply" (their stated eval criterion).
- Error drill live: `dependency_unavailable` → receipt shows the
   simulated fallback firing.

## Cut criteria

If the custom tool or driver adapter drags past the deadline, keep the
env-gated `sendClaim` (harmless without the var) and demo
`npx workflow web` step traces instead.
