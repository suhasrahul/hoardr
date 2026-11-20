# Firedrill — claim-safety drills for Hoardr

Firedrill is not a send API — it is a simulation platform. During a drill the
CLI injects a per-drill loopback URL (`GIVER_INVOKE_URL`) into the app, so
`sendClaim` in `workflows/claim.ts` POSTs `{operation:"messages.send", ...}` to
a *synthetic* giver inbox instead of writing the local simulated receipt.
The drill report is the demo artifact: it proves the approval gate holds and
the outage fallback works.

## Layout

| Path | What |
|---|---|
| `descriptor.json` | Registered agent definition (hashes only, no paths/secrets) |
| `plan.template.json` | Local plan template — copy to `plan.json` and fill in path + `descriptor_sha256` |
| `plan.json` | **gitignored** — machine-local launch plan (already generated for this checkout) |
| `giver-inbox/` | Custom tool package (`tool.json` + `bundle/`): the synthetic giver inbox |
| `persona.json`, `scenario-*.json`, `evaluation-*.json` | Library resources for the drills |
| `world.json` | World binding the `giver` dependency to the tool version |
| `../app/api/drill/route.ts` | http.v1 driver adapter — drill steps drive the real claim workflow |

Adapter wire format (driver `request_template: message-text`, `response_pointer: /reply`):

- `claim|<listingId>|<title>` — start `claimWorkflow`, suspend on the hook (no send)
- `approve|<listingId>` — `resumeHook`, then `sendClaim` hits `GIVER_INVOKE_URL`; reply reports `via` + inbox count
- `inbox` — report synthetic inbox count

## Setup (one-time, needs the Firedrill account)

```sh
npm i -g firedrill-run@latest        # needs Node >= 24.11.1
firedrill init                      # sign in + choose workspace (event code: TOKENSAND)

# 1. register the agent descriptor -> prints agent id + descriptor_sha256 for plan.json
firedrill register --descriptor firedrill/descriptor.json --name "Hoardr"

# 2. package + push the custom tool (zip = tool.json + bundle/)
cd firedrill/giver-inbox && zip -r ../giver-inbox.zip tool.json bundle && cd ../..
firedrill tools push firedrill/giver-inbox.zip

# 3. save library resources; copy each printed version id/revision/digest
#    back into the scenario + world files
firedrill library save --kind persona --file firedrill/persona.json
firedrill library save --kind evaluation --file firedrill/evaluation-claim-safety.json
firedrill library save --kind evaluation --file firedrill/evaluation-outage-fallback.json
firedrill library save --kind scenario --file firedrill/scenario-claim-safety.json
firedrill library save --kind scenario --file firedrill/scenario-outage.json

# 4. fill world.json placeholders (tool_version_id via `firedrill tools runnable`,
#    contract_digest via `firedrill tools definitions show <version>`), then:
firedrill world save --agent <agent-id> --file firedrill/world.json

# 5. review + apply plan, then run this machine's drills
firedrill plan --world <world-id>
firedrill apply <plan-id> --approve
firedrill run --plan firedrill/plan.json --descriptor firedrill/descriptor.json --campaign <campaign-id>

# 6. the demo artifact
firedrill report <campaign-id>
```

`firedrill status --plan firedrill/plan.json` sanity-checks the plan without
running anything.

## What the drills prove

- **claim-safety**: `claim|…` suspends on the hook with **zero** `messages.send`
  calls; `approve|…` produces exactly **one** (`exact_checks` eq 1); a second
  `approve|…` sends nothing (hook consumed + tool dedupe returns
  `duplicate:true`).
- **outage**: `dependency_unavailable` on `giver` before approval → 503 →
  `sendClaim` falls back to `via:"simulated"` — the reply reports
  `via:"simulated"` and the inbox stays empty.

If Firedrill is never set up, nothing changes: with no `GIVER_INVOKE_URL`,
claims stay simulated locally.
