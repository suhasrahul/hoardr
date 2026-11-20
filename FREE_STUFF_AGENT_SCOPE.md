# Hoardr — Hackathon Source of Truth

Name: **Hoardr**

> A personal agent that watches free-stuff listings, judges each one
> with a question battery (text + vision), and surfaces only what's
> worth the trip — every alert carrying a literal receipt of the
> judgments behind it. The counter is the promise:
> **"214 scanned today · 3 worth your time."**

Battery lives in `src/judge/battery.ts` (`lib/judge/battery.ts` after migration) — the authored questions
(his taste), T1–T12 + T2v vision; `data/wants.json` — wants, vetoes,
distance. Battery wording = identity: freeze before trusting numbers.

**Deadline: submit by 4:30 PM PT. By 2:30 PM PT, demo a keeper through
Jev text pass → Jev vision check → verdict receipt → user-approved
simulated claim. Use a second permitted listing or labeled fixture to
show photo evidence changing a verdict.**

### Team and owners

| Owner | Owns |
|---|---|
| **Hadrien** | Next.js + Workflow scaffold, AI Gateway key, Jev text pass (`jevJudge`), claim workflow + approval hook, dashboard (counter, find cards, receipt), ledger receipt metadata |
| **Suhas — core** | Photo quality gate (`photoGate.ts`), Jev vision pass (`eyeJudge`: T2v + brand/model), photo-bearing fixtures, Senso value check (`value/senso.ts` + seeded docs) |
| **Suhas — sponsors** | Senso; Firedrill claim service (plugs into Hadrien's approval hook); Cognee taste memory; Statsig or Amplitude as backup third |
| **Suhas — finish line** | Clean public repo (no `.env`, no Freecycle data, no secret history), demo video, submission form with sponsor tools named + team emails |
| **Both** | Authored text fixtures, rehearsal, live demo |

**Schedule by person**

| Time | Hadrien | Suhas | Checkpoint |
|---|---|---|---|
| 11:00–12:00 | Scaffold Next.js + Workflow; AI Gateway key; smoke-test Jev text | Build `photoGate.ts`; sign up for Senso, Firedrill, Cognee; take 4 test photos | 12:00: both smoke tests pass |
| 12:00–1:30 | `jevJudge` with typed answers; persist receipts; text fixtures | `eyeJudge`: smoke-test Jev 1.14 with photo bytes, T2v + brand/model mapping; photo fixtures; seed Senso docs | 1:30: one keeper + one photo-driven verdict change; agree Firedrill ↔ hook interface |
| 1:30–2:00 | Lunch | Lunch | |
| 2:00–2:30 | Claim workflow + approval hook; cards + receipt UI | `senso.ts` value line in receipt; Firedrill wired to the approval hook | **2:30: end-to-end gate** |
| 2:30–3:00 | UI polish, live lane if time | Cognee taste memory (or Statsig/Amplitude events) | **3:00: cut unfinished integrations** |
| 3:00–4:00 | Rehearse demo, fix bugs | Clean public repo: rotate keys, fresh history, `.env.example` only | 4:00: repo ready |
| 4:00–4:15 | Present in the video | Record demo video, fill submission form | |
| 4:15–4:30 | Buffer | Submit | **4:30 hard stop** |

If Suhas falls behind: drop Cognee first (use `wants.json`), never the clean repo.

---

## 1. The event

**Personal Agents Hackathon** — tokens& × AWS Builder Loft
- **Date:** Fri 2026-11-20, San Francisco (AWS Builder Loft — exact
  address on registration approval; 18+, physical govt ID required,
  no digital IDs, no scooters/bikes in building, no on-site parking)
- **⚠️ Registration: EVENT FULL — waitlist only** (as of 2026-11-19)
- Team 2–4 · one project per team · solo → find team in Discord
- Links:
  - Info/submit: https://tokensand.com/personalagenthack
  - Event/Luma: https://luma.com/personalagenthack
  - Discord: https://bit.ly/discord-17
  - Submit: https://tokensand.com/personalagenthack/submit · Gallery: /personalagenthack/projects

**Agenda (PT)**
| Time | |
|---|---|
| 9:30 | Doors + opening remarks |
| 11:00 | **Kickoff & hack** |
| 1:30 | Lunch |
| 4:30 | **Project submission deadline** |
| 5:00 | Finalist demos + judging |
| 7:00 | Awards + closing |

→ ~5.5 hours of build time. Demo slot ~a few minutes, live.

**Challenge summary:** Build a personal agent that does
something useful beyond a chat window. Pick one real task, make it work
end to end, and show what your agent can do. Build a shopping agent
with an audit trail — an agent that helps someone make a purchase or
complete a shopping task, uses reliable context to make decisions,
takes a meaningful action, and shows the information and steps behind
what it did.

**What to submit:** accessible GitHub repo · short demo video
(shareable link) · what you built + tools used · team names + contact
emails. Working website + screenshot welcome. The organizer says to
build during the event; confirm how any existing scaffolding may be used.

## 2. Judges (who we're pitching)

| Judge | Role |
|---|---|
| Riya Dashoriya | Eng Manager @ Meta |
| Lingxi Li | SWE @ Cursor |
| Robert F. | Co-founder/CEO @ Plato |
| Harshal Vaidya | Staff SWE @ Intuit |
| Rebecca Abu Sharkh | Solutions Eng @ Amplitude |
| Daniel Svonava | Founder/CEO @ Superlinked |
| Rahul Parundekar | DevRel @ Superlinked |
| Anneketh Vij | AI Research Scientist @ Arcee AI |
| Sam Fraser | Product @ Arcee AI |
| Veljko Kovac | Head of FDE @ Cognee |
| Corbett Waddingham | Head of DevRel @ Guild.ai |
| Richelle Herrli | Sr Developer Advocate @ Airbyte |
| Newton Asare | Co-founder/CEO @ Firedrill |
| AJ Jain + Aditya Ketkar | CEO + CTO @ Broccoli |
| Kerwell L. | PMM @ Persona |
| Amanda Kwong + Ryan Sarginson | Solutions Eng @ SingleStore |
| Michael Moyo | CEO @ Ocular AI (YC W24) |
| Mogana Kumaran Sivaraman | Sr Staff SWE @ GAP |

Read: heavy sponsor representation + strong technical judges. The
audit-trail receipt and the photo-driven verdict change are the proof;
the persona keeps it memorable for everyone else.

## 3. Sponsor prizes & where they plug in

| Sponsor | Prize | Fit for Hoardr |
|---|---|---|
| **Firedrill** | $2,000 total in gift cards, subscriptions, and credits | Simulate claim approval, a stale listing, or a duplicate send. Docs: firedrill.run/hacker-docs |
| **Cognee** | 1st $500 cash + $500 credits | "Your eye" taste memory — swipes → durable profile. docs.cognee.ai |
| **Amplitude or Statsig** | 1st $1,000 / 2nd $500 (one category) | Alert→claim funnel events or pickiness threshold as Dynamic Config |
| **Senso.ai** | 10k/5k/1k credits | Value check: seed a small knowledge base (brand facts + typical retail prices for the want categories); receipt cites the passage used. Not a live price feed. Matches Senso's "shopping agent with trusted context" track |
| **Superlinked SIE** | 2 × $500 cash+credits | Optional 2nd opinion on match/dedupe (overlaps local match — skip if time) |
| **Arcee AI** | credits+merch | "Pareto frontier" — frontier judge vs small open model angle. Detour. |
| **SingleStore** | 1st $1,000 | listings+vector store. Plumbing — sqlite/Firestore fine. |
| **Airbyte** | $1,000/$500/$250 | No connectors for our sources. Marginal. |
| **Guild AI** | 100M/50M/25M tokens | Generic agent infra. |
| **Persona** | $250 gift cards | "Is the poster a bot" — weakest fit. |

**Sponsor priority (revised):** Target **three exercised integrations**,
not one. A previous tokens& hackathon at this venue scored "uses at least
3 sponsor tools" as one of five equal criteria, and most judges here
represent sponsors. Order, after the core path works:
1. **Firedrill** — synthetic claim service; inspect the state change
   without contacting anyone. (Suhas wires it to Hadrien's approval hook)
2. **Senso** — value check from seeded reference docs, cited in the
   receipt. Small, self-contained, matches the main challenge. (Suhas)
3. **Cognee** — "your eye" taste memory from the calibration taps; Cloud
   needs a tenant URL, tenant ID, and API key. (Suhas, if time)

Fallback third: one of Statsig or Amplitude (funnel events are cheap).
**Verify TypeSafe AI's sponsor status** before counting Jev as a sponsor
tool — it isn't on the event page's sponsor list.

**Opportunistic adds (wire only if Plan A lands early):**
- **Guild AI** — 100M/50M/25M model tokens. Not a replacement for Gateway
  unless it documents and passes a smoke test for the needed Decisions APIs.
- **SingleStore** — swap sqlite for their listings+vector store. Pure
  plumbing, but two of their Solutions Engineers are judges. Medium
  effort, $1k prize.
- **Superlinked** — semantic wants-match/dedupe behind T11. Overlaps our
  local tasteMatch; CEO + DevRel are judging. Medium effort, $1k in
  cash+credits.
- **Arcee** — small open model drafts explanations/claim messages.
  "Pareto frontier" angle (cheap model vs frontier judge). Credits only.

**Deliberately skipped:** Airbyte (no connectors for our sources —
wiring it would be theatre), Persona ($250 gift cards, weakest fit —
"is the poster a bot" adds nothing the battery doesn't do).

**Rule for demo honesty:** only name sponsors actually wired and
exercised in the demo. Judges will ask; "we integrated it" followed by
nothing is worse than not claiming it.

### Integrations and fallbacks

Sponsor integrations are optional. The standalone mock judge exists;
the permitted fixture set, model adapters, and claim flow still need work.

| Layer | Connected path | Local fallback |
|---|---|---|
| Source | Trash Nothing public listings API | Replay synthetic or expressly permitted fixtures |
| Claim action | Firedrill synthetic service | Local simulated claim record |
| Taste memory | Cognee swipes → durable profile | `wants.json` and `taste.ts` |
| Pickiness or analytics | Statsig Dynamic Config or Amplitude funnel events | Local `priors.ts` thresholds or ledger events |
| Value check | Senso citations from seeded documents | Omit the value claim |
| Photo quality | Local photo gate (no external service) | Same — always local |
| Judge model | Jev text pass + Jev vision pass (one model, sponsor: TypeSafe AI) | Saved model receipts or labeled `mockJudge` heuristics |
| Store | Shared database only if hosted writes are essential | SQLite locally; read-only fixture receipts for public preview |

**Rule:** Gate optional integrations on their required configuration
and keep local fallbacks on failures. Cut an unfinished integration by
3:00 PM and only name tools actually exercised.

## 4. Product architecture

```
poll/replay (~10 min real; 2-3s/item demo)
  └─ adapter → normalize → diff vs seen-ids
       └─ new posts → stage 1: jev battery (ONE call, text-only)
            └─ code: apply local taste, thresholds and vetoes → provisional verdict
                 └─ photo-bearing push or contested offers → photo quality gate (code)
                      ├─ fails → T2v = insufficient_evidence (no Jev call)
                      └─ passes → stage 2: Jev vision
                           → value check (Senso, keepers only)
                           → final verdict + receipt → approve → simulate claim
```

- **Photo quality gate (Suhas):** before Stage 2, plain code measures
  each photo: Laplacian variance (blur), % of pixels clipped to black or
  white (exposure), and minimum resolution. Thresholds are fixed and
  versioned with the rules. A failing photo makes T2v
  `insufficient_evidence` without calling Jev, which saves cost and
  matches the rule that insufficient evidence never counts as
  confirmation. The receipt shows the three measurements and which one
  failed. Reuses the diagnostics from Suhas's photo editor.
- **Value check (Suhas):** for final keepers only, query Senso's seeded
  reference docs for the identified brand/model or category. The receipt
  shows the cited passage (for example, "<brand/model>: typical retail
  $X, source: <seeded doc>") or "no verified reference." The value never changes the
  verdict; it's context for the user.

- **Sources:** Replay synthetic or expressly permitted fixtures first.
  Optional live reads: Trash Nothing `GET /api/v1.4/posts` with an app
  key for eligible public listings; use `types=offer` and the documented
  `sources` and location parameters. No per-user OAuth is needed for
  this path. Freecycle's terms prohibit automated downloading and
  redistribution subject to stated exceptions; do not run the legacy
  scraper or publish its snapshot without permission.
- **TAKEN posts judged too** (hackathon call): CLAIMED badge, never
  pushed. TAKEN is an availability signal, not a preference label.
- **Decision rule is fixed code**, not model discretion. Model produces
  typed answers; code applies thresholds + hard vetoes. Keep the frozen
  wording verbatim in `instructions`. Use Boolean P(true) for yes/no
  predicates, ordered score rubrics for graded questions (normalize the
  score to 0–1), and explicit T2v choices: `confirms`, `contradicts`,
  `insufficient_evidence`. Map them in code: contradiction blocks push;
  insufficient evidence never counts as confirmation. Reject invalid
  or missing required answers rather than substituting neutral numbers.
- **Taste:** `lib/judge/battery.ts` — authored battery (T1–T12 + T2v
  vision), hard vetoes on not-an-item/scam/hassle (T1/T2/T12 `veto`),
  no-photo offers can't push. Use `data/wants.json` with local
  `tasteMatch`; record the local T11 override separately from Jev's
  answer. Distance scoring is stretch until reliable distance is available.
- **Two priors (strict vs lenient)** use the same answers with different
  thresholds. Show that comparison separately from stage divergence,
  which compares text vs. vision under the same prior and reflects both
  a different model and new evidence.
- **Stage 1 — Jev:** `experimental_decide` → `typesafe-ai/jev`, T1–T12
  in one text/JSON request per new listing. Pass listing metadata,
  including photo presence, without downloading photos. Vetoes and
  thresholds produce a provisional verdict; record it as final if
  no second pass is needed. Do not alert on a provisional verdict.
- **Stage 2 — Jev vision:** for still-eligible offers with photos and
  a provisional push or disagreement between priors, re-ask the battery
  plus T2v using `typesafe-ai/jev-1.14.0` (image support is experimental —
  smoke-test at kickoff). Include brand/model identification questions:
  `confirmed model`, `brand only`, `generic/unknown`, `contradicts
  listing`. Pass bounded, validated photo bytes as `file` parts (remote
  SDK file URLs need `experimental_download`; prefer a controlled
  downloader). Apply the same local rules to produce the final verdict.
  "No visible damage" ≠ "confirmed working" — photos can't verify
  function. Insufficient or failed evidence means unverified, never
  confirmation; a required photo check failing blocks push. One model
  for both stages keeps the receipt clean and doubles the TypeSafe
  sponsor angle; `google/gemini-decision-1` is the documented fallback
  if Jev images underperform.
- **Receipts and budget:** Persist stage, returned model ID, typed
  answers, scoring inputs, thresholds, rule version, and final verdict.
  Track latency and escalation rate; 5% is a target, not a measurement.
  Check a small sample of rejects for missed gems. Use bounded
  concurrency and backoff for batch runs. Gateway conditional fallbacks
  rerun the same state and questions and return only the selected answers;
  they cannot add photos or replace the explicit second call.

## 5. Repo layout (Next.js + Workflow SDK — revised)

```
hoardr/
  app/
    page.tsx      dashboard — counter, live lane, find cards, receipt, dial
    api/          events (SSE → live lane) · finds · ledger/[id] (receipt)
                  · claim/[id] (approval hook resume) · dial — planned
  components/     Counter · LiveLane · FindCard · Receipt · Dial — planned
  workflows/
    claim.ts      draft → approval hook → simulated send → action receipt
    scan.ts       bounded batch orchestration — stretch
  lib/            = existing src/ as needed; preserve standalone runner:
    pipeline.ts   local mock path built; two-stage model path planned
    ingest/       adapter.ts, normalize.ts, seenStore.ts, replay.ts — built
    judge/        battery.ts, priors.ts, score.ts, model.ts
                  (mockJudge built; Jev text/vision adapters planned), ledger.ts,
                  photoGate.ts (blur/exposure/resolution — planned, Suhas)
    value/        senso.ts (value check from seeded docs — planned, Suhas)
    memory/       taste.ts (wants profile; Cognee wiring, stretch)
    act/          claimDraft.ts — planned
  data/
    authored/     ~15-20 engineered cases — planned
    value-docs/   seeded Senso reference docs (brand facts, typical prices) — planned
    demo/         permitted fixtures and read-only demo receipts — planned
    wants.json    want list + vetoes + maxPickupMiles
  scripts/        seedAuthored.ts — planned
  next.config.ts  withWorkflow({})
  .env.example    public template; keep real credentials out of the submission
```

## 6. Data strategy (proof of concept)

- **Input:** Start with authored fixtures or explicitly permitted
  listing text and photos. Treat the tracked Freecycle corpus as
  legacy only: do not refresh, use in demos, or distribute it without
  permission. Review Git history before sharing the repository; removing
  files from the current tree alone does not remove them from history.
- **Authored cases (~15-20):** engineered to hit every
  branch: photo-text mismatch ("like new" + beat photo), obvious scam,
  honest-disclosure gem, mystery grab-bag, curb-tease, WANTED, TAKEN
  gem, near-threshold mid item, cross-post dupe.
  Photo cases (Suhas): blurry photo (gate fails → insufficient
  evidence), too-dark photo, text claims a brand the photo contradicts,
  photo confirms a premium brand the text didn't mention. Use photos we
  took or have rights to; label all fixtures as synthetic.
- **Replay:** use the standalone runner with an explicit fixture path.
  Show a short live sample, then load precomputed receipts for volume:
  at 2–3 seconds/item, 765 items would take roughly 26–38 minutes.
  Label the feed and counters as live, precomputed replay, or mock.

## 7. UX / demo surface

**Decision (revised): Next.js app + Workflow SDK + AI SDK + AI Gateway.**
Workflow is how the UI watches the agent work in real time — it's the
real-time layer, not just durability:

- **Steps = tool calls.** Every operation (fetch, Jev text call, Jev
  vision call, ledger write, claim send) is a `"use step"` — recorded
  with inputs/outputs/duration/retries. `npx workflow web` renders the
  step timeline live; show it on a second screen as the raw audit trail.
- **`getWritable()` = the live feed.** Steps write events
  (`battery_start` → `battery_result` → `verdict` → `eye_start` →
  `eye_result` → `claim_action`) to the run stream; an API route returns
  `run.readable` (SSE-wrapped) and the scan lane renders each event.
  Streams survive client refresh — judges' reload doesn't lose the run.
- **Hooks = the claim gate.** `createHook()` suspends on "waiting for
  approval" (a live pending state in the UI); `POST /api/claim/:id`
  calls `resumeHook`, the send step runs, result goes on the same
  stream. The claim route checks the caller + listing before resuming;
  one simulated action per approval even across retries.
- The claim send is simulated. Live send + owner replies stay out of
  scope (published Trash Nothing spec has no send/reply-webhook
  endpoint); an optional listing link hands off to the source's reply UI.

SQLite works on a single local host. Vercel Functions have a read-only
deployment filesystem and ephemeral `/tmp`; for the public preview,
ship read-only fixture receipts, or use a shared database if hosted writes
are essential. Keep `pipeline.ts` runnable if Workflow/Next setup eats
the clock.

Rejected: bare `http` single-file page (superseded — Workflow needs a
directive-transform host anyway; Next is cheaper than Vite/Nitro
uncertainty), Telegram bot (can't render the live lane + receipt +
debate; stretch only, for approve/skip taps), browser widget (wrong
shape — the agent replaces browsing).

```
HOARDR                       [dial: chill ——— picky]
"214 scanned today · 3 worth your time"
─ live lane ─────────────────────────────────────────
 ▸ sorting: "vintage lamp"… real ✓ cond 0.8… KEEPER
 ▸ "printer ink (empty)"…………………….PASS
 ▸ "leather sofa"… photo vs text?… DEBATING ▶
─────────────────────────────────────────────────────
 [find cards: photo · brand/model (Jev eye) · hood · urgency ·
  his line · score · RECEIPT ▾ · CLAIM →]
▸ filtered out (211) — "mystery box" "no photo" …
```

- **Receipt** — every card shows questions, typed answers, effective
  scores, threshold bar, and verdict; expanding it shows provenance,
  the photo gate measurements (blur, exposure, resolution) and, for
  keepers, the Senso value citation.
- **Live scan lane** — watches him sort in real time; makes the
  counter feel earned.
- **Debate** — text pass vs. vision pass under the same prior, with
  each change traced to an answer or score. Show strict vs. lenient
  separately (same answers, different thresholds).
- **Calibration (act two)** — 30-sec: tap 3 cards you'd grab → "your
  eye" chip → feed reshuffles. Full calibration loop is post-hackathon.
- **CLAIM** — drafts a message for a keeper; approval creates a
  simulated claim in the demo service and logs the resulting action.
  Clearly label it simulated; never imply a poster was contacted.
- **Voice** — terse, opinionated, never hedges: *"particle board in a
  trench coat."* Empty state: *"Nothing good today. I looked at 214
  things so you didn't have to."*

**Ordering (settled):** his taste leads — curation + audit trail is act
one; calibration is the personalization beat; feedback loop is
talk-track. *"He has taste. He learns yours."*

## 8. Before doors (tonight / before 9:30)

- [ ] **Confirm event entry** — waitlist-only as of 11/19. Confirm
  before investing; concept ports to any agent-judgment demo.
- [x] **Freeze battery wording** (T1–T12 + T2v, `battery.ts`). No edits
  after freeze.
- [ ] Confirm rules on existing scaffolding and fixture provenance.
- [ ] Provision Gateway access; verify the team's balance and model access
  before counting on free credits. At kickoff smoke-test one text and
  one photo request and lock the SDK version.

### Keys to provision (blocking first)

| Key | Where | Status |
|---|---|---|
| `AI_GATEWAY_API_KEY` | Vercel dashboard → AI Gateway → API Keys (vercel.com/docs/ai-gateway/getting-started); free credits need payment method on team | ☐ blocking |
| `JUDGE_MODEL` | Model ID (not a key): `typesafe-ai/jev` (text pass) | ☐ smoke test |
| `JUDGE_VISION_MODEL` | Model ID (not a key): `typesafe-ai/jev-1.14.0` (pinned for image input) | ☐ smoke test with photo |
| `TRASHNOTHING_API_KEY` | App key for optional eligible public reads | ☐ if using live reads |
| `vercel login` (CLI) | Optional read-only public preview | ☐ optional |

Sponsor setup is optional; start with the Firedrill CLI quickstart and
workspace authentication only after the local claim simulator works.

## 9. Build order vs. the clock

| Window | Target | Exit criteria |
|---|---|---|
| 11:00–12:00 | Model smoke tests + fixtures | One labeled fixture runs through both model calls; score mapping and photo bytes validated |
| 12:00–1:30 | Judgment and receipts | One keeper plus one photo-driven verdict change; persist both stages; precompute a permitted or synthetic replay batch |
| 1:30–2:30 | Claim + UI | Receipt visible; approve a simulated claim on the keeper; audit shows resulting action and no duplicate on retry |
| 2:30–4:15 | Demo and submission | Record video, review repo and history, prepare submission; optional sponsor or UI polish only after gate |
| 4:15–4:30 | Buffer | Submit by 4:30. Hard stop. |

### Component checklist

**Ingest**
- [x] Local helpers: normalization, SQLite seen store, and replay.
- [ ] Seed permitted/synthetic fixtures; make the standalone demo use
      them by default. Wire deduplication into the active ingest path.
- [ ] Optional: Trash Nothing public-read adapter.

**Judge**
- [x] Frozen battery wording.
- [x] `priors.ts` — strict + lenient thresholds; log both verdicts
- [x] `score.ts` — quality → tier; vetoes; no-photo cap
- [x] Local ledger with stage field; full receipt metadata still planned.
- [x] `model.ts` — `JudgeModel` interface + `mockJudge` offline fallback
- [ ] `jevJudge`: typed question map, rubrics, answer validation and mapping.
- [ ] `eyeJudge`: Jev 1.14 with photo bytes, re-judge + T2v + brand/model
      questions; persist both stages and alert only on final verdict. (Suhas)
- [ ] `photoGate.ts`: blur, exposure clipping, min resolution; fixed
      versioned thresholds; failing → `insufficient_evidence`, logged in
      receipt. (Suhas)

**Value (Senso)**
- [ ] Seed 10–20 reference docs for the want categories in `data/value-docs/`. (Suhas)
- [ ] `senso.ts`: query by brand/model or category for keepers; return
      cited passage or "no verified reference". Never changes the verdict. (Suhas)

**Act / UX (Next.js + Workflow)**
- [ ] Next.js + `withWorkflow`; pin and lock a tested AI SDK release
      (at least `7.0.136` for file parts with plain Gateway strings).
- [ ] Dashboard with counter, find cards and receipts. SSE and dial stretch.
- [ ] `workflows/claim.ts`: draft → authorized approval hook → simulated
      send → action receipt. Fallback: same local simulation without Workflow.

**Sponsors (target 3 exercised, §3)**
- [ ] Firedrill claim service (Suhas, via Hadrien's approval hook)
- [ ] Senso value check (Suhas)
- [ ] Cognee taste memory, or Statsig/Amplitude as fallback third (Suhas)

**Stretch**
- [ ] If the local demo is ready, deploy a read-only preview.

### Cut order if squeezed
1. Debate *visuals* (keep divergence data in receipt)
2. Calibration act-two
3. Live-lane animation (static list fine)

**Never cut:** receipt, battery, one photo-vs-text catch, and a clearly
labeled simulated claim action.

## 10. Demo script (draft)

1. Short live sample + labeled precomputed replay counter.
2. A KEEPER card → expand RECEIPT → questions, answers, thresholds, verdict.
3. Vision catch: "like new" text vs beat-up photo → same prior, changed verdict.
   Then a blurry photo → gate fails → "insufficient evidence, not pushed."
4. Keeper's value line: Senso citation shown in the receipt.
5. CLAIM → preview message → approve → simulated action receipt.
6. Calibration beat (if it survives): tap 3 cards → "your eye" → reshuffle
7. Talk track: *"He has taste. He learns yours."* — audit trail is the
   product, not a debug panel

## 11. Submission checklist (by 4:30)

- [ ] **Do not share the existing repository as-is.** `.env` is tracked.
      Revoke or rotate every credential committed to it and distribute
      replacements through an approved secret-sharing channel. Submit a
      clean reviewer-accessible repo with `.env.example` only, no secret
      history, and no unapproved listing data. Verify before sharing;
      ignoring a tracked file or removing it in a later commit is not enough.
- [ ] Short demo video, shareable link
- [ ] What you built + tools used (sponsor tools named)
- [ ] Team names + contact emails
- [ ] Submit at https://tokensand.com/personalagenthack/submit

## 12. Risks

| Risk | Mitigation |
|---|---|
| Live listing access unavailable | Use expressly permitted or synthetic fixtures; do not scrape Freecycle |
| Venue Wi-Fi / API dies | Replay saved model receipts, or use labeled `mockJudge` heuristics; don't present mock output as vision |
| Next.js + Workflow setup eats clock | Hard cutoff ~30 min on scaffold; fallback = keep `pipeline.ts` standalone + static page reading ledger |
| Vision access, cost, or latency | Smoke-test Jev image input; gate on photo-bearing survivors, limit photo bytes, measure escalation rate; `gemini-decision-1` documented fallback |
| Waitlist — no entry | Confirm before building; pipeline + receipt UI still demo-able on video |
| Battery drift | Freeze wording; version rubrics and rules and store the inputs used to compute each verdict |

## 13. Prior art / references

- **Organizer and submission** — https://tokensand.com/personalagenthack
- **Listing sources** — https://trashnothing.com/app/developer ·
  https://trashnothing.com/api/v1.4/trashnothing-openapi.yaml · https://freecycle.org/pages/tos

### Stack docs (official)

- **AI SDK** — https://ai-sdk.dev/docs/introduction
  - **`experimental_decide` (the battery API)**: https://ai-sdk.dev/docs/ai-sdk-core/decisions — `ai` ≥7.0.128 for baseline; use ≥7.0.136 for file parts with plain Gateway IDs
  - Gateway provider (`decisionModel`, auth): https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway
  - Agent-readable index: https://ai-sdk.dev/llms.txt
- **Workflow SDK** — https://workflow-sdk.dev
  - API reference (steps, hooks, sleep, `workflow/api` `start`): https://workflow-sdk.dev/docs/api-reference
  - Approval authorization and retry safety: https://workflow-sdk.dev/docs/api-reference/workflow-api/resume-hook · https://workflow-sdk.dev/docs/foundations/idempotency
  - Next.js integration = `withWorkflow` from `workflow/next`; local observability UI = `npx workflow web`
  - Repo + examples: https://github.com/vercel/workflow · llms.txt: https://workflow-sdk.dev/llms.txt
- **AI Gateway** — https://vercel.com/docs/ai-gateway
  - **Decision modality** (typed questions → probs, ONE call): https://vercel.com/docs/ai-gateway/modalities/decision
  - Decision model catalog: vercel.com/ai-gateway/models?capabilities=decision
  - Jev 1.14 image input + file-part SDK versions: https://vercel.com/i/jev-integrations · changelog: https://vercel.com/changelog/typesafe-ais-jev-1-14-is-now-available-on-ai-gateway
  - Decision fallbacks (uncertain-band rerun): https://vercel.com/docs/ai-gateway/models-and-providers/decision-fallbacks
  - OpenAI-compat `/decisions` (image input format — base64 data URLs, ≤128/req): https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-decisions
- **Next.js** — https://nextjs.org/docs/app
- **Vercel Functions filesystem** — https://vercel.com/docs/functions/runtimes
- **Zod** (battery schema) — https://zod.dev