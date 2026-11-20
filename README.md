# HOARDR

A personal agent that watches free-stuff listings, judges each one with a
question battery (text + vision), and surfaces only what's worth the trip —
every keeper carrying a literal receipt of the judgments behind it.

**"25 scanned · 2 worth your time."**

Built for the tokens& × AWS **Personal Agents Hackathon** (SF, Nov 20, 2026):
a shopping agent with an audit trail.

## How it works

```
listings (replay corpus or Trash Nothing live feed)
  → normalize → dedupe vs already-judged
  → stage 1: Jev text battery (T1–T13, ONE call per listing)
  → fixed code: vetoes (scam, hazard, wanted, no photo) + weighted quality score
  → stage 2 (keepers + near-the-bar only): photo quality gate → Jev vision
       (photo-vs-text check, brand/model ID, resale band)
  → verdict: KEEPER / MAYBE / PASS, written to the ledger
  → user taps "Claim it" → drafted message → Approve → simulated claim
```

- **The model answers questions; code decides.** Jev returns typed answers
  (probabilities, scores, choices). Thresholds and vetoes are plain code in
  `lib/judge/score.ts` and `lib/judge/priors.ts`.
- **Photo quality gate** (`lib/judge/photoGate.ts`): blur (Laplacian
  variance), exposure clipping and resolution are measured before any photo
  reaches the vision model. A failed gate means *insufficient evidence*,
  which can never confirm a keeper.
- **Receipt on every keeper** ("Why?"): score vs your bar, the key answers,
  photo-vs-text result, brand/model, and what the strict and lenient priors
  would say.
- **Claims are approval-gated and simulated.** Nothing is sent to a real
  giver; the UI labels it "Simulated claim recorded".

## Sponsor tools and how we used them

| Tool | Status | How Hoardr uses it | Code |
|---|---|---|---|
| **SingleStore** | ✅ live | Durable ledger: every judgment (listing, prior, stage, score, verdict, veto, per-question answers) is written to a `judgments` table — the audit trail behind each receipt. Also holds a seeded `price_reference` table ("usually ~$X new" with source URL). Falls back to local SQLite when `SINGLESTORE_*` is unset; a store outage never stalls a scan. | `lib/store/singlestore.ts`, `lib/judge/ledger.ts`, `scripts/seedPrices.ts` |
| **Cognee** | ✅ live | Taste memory. Card taps, claims and approvals are remembered in the `hoardr_taste` dataset (`/api/v1/remember`); before each scan the taste profile is recalled once (`/api/v1/search`, `GRAPH_COMPLETION`) and blended into the taste-match question (T11). Falls back to `data/wants.json`. | `lib/memory/cognee.ts`, `lib/memory/taste.ts`, `app/api/taste/route.ts` |
| **Firedrill** | ✅ integrated | Claim safety against a synthetic giver inbox. During a drill, the approved claim is sent to Firedrill's giver inbox instead of the local simulated record; the drills check that no message is sent before approval, exactly one after, none on a repeated approval, and that a giver outage falls back cleanly to "simulated". The agent is registered and the giver-inbox tool is uploaded to our Firedrill workspace. | `firedrill/`, `workflows/claim.ts`, `app/api/drill/route.ts` |

### Other tools

| Tool | How Hoardr uses it |
|---|---|
| **Jev** (TypeSafe AI) via **Vercel AI Gateway** | The judge. `typesafe-ai/jev` answers the text battery; `typesafe-ai/jev-1.14.0` re-judges with photos (photo-vs-text, brand/model, resale band). Called with AI SDK `experimental_decide`. |
| **Vercel Workflow SDK** | Each scan is a durable workflow: every step is a recorded tool call, events stream live to the sorting table, and the claim waits on an approval hook. |
| **Next.js** | The sorting-table UI (`app/page.tsx`). |
| **sharp** | Photo decoding, the quality gate, and resizing photos for the vision model. |
| **Trash Nothing API** | Optional live feed of free listings. |

## Run

Requires Node 24+.

```bash
npm install
cp .env.example .env        # add AI_GATEWAY_API_KEY; sponsor keys are optional
npm run dev                 # sorting-table UI at http://localhost:3000
node lib/pipeline.ts 20     # headless run (mock judge when no gateway key)
node scripts/gateCheck.ts <photo-folder>   # calibrate the photo gate
```

**Listings source:** the Freecycle replay corpus used during development
isn't included in this repo (it isn't ours to publish), so scans use the
Trash Nothing live feed — set `TRASHNOTHING_API_KEY` in `.env`.

Every sponsor integration is gated on its env vars; with none set, the app
runs end to end on local fallbacks (mock judge, SQLite, `wants.json`,
simulated claims).

## Docs

- `FREE_STUFF_AGENT_SCOPE.md` — architecture, build plan, demo script, risks
- `SPONSORS.md`, `PLAN_*.md` — sponsor wiring plans and status
- `STYLE.md` — UI design system
