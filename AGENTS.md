# AGENTS.md — Hoardr

Personal agent that watches free-stuff listings, judges each with a
question battery, and surfaces only what's worth the trip. Source of
truth: `FREE_STUFF_AGENT_SCOPE.md`.

## Stack (decided)

| Layer | Tech | Docs |
|---|---|---|
| App/UI | Next.js (`withWorkflow` in `next.config.ts`) | https://nextjs.org/docs/app |
| Judge model | AI SDK `experimental_decide` → `typesafe-ai/jev` (text) + `typesafe-ai/jev-1.14.0` (vision; pin tested `ai` ≥7.0.136 for file parts via plain Gateway IDs) | https://ai-sdk.dev/docs/ai-sdk-core/decisions |
| Model routing | Vercel AI Gateway (`AI_GATEWAY_API_KEY`, plain model strings) | https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway |
| Durability | Vercel Workflow SDK (`use workflow`, steps, hooks) | https://workflow-sdk.dev · API ref https://workflow-sdk.dev/docs/api-reference |
| Schema | Zod | https://zod.dev |

### Key API facts (don't re-derive)

- **Two-stage cascade, one model**: Jev runs T1–T12 with text and
  metadata on each new listing; `typesafe-ai/jev-1.14.0` re-judges
  eligible photo-bearing pushes and contested offers with T1–T12 + T2v
  + brand/model identification questions. Alert only on final verdict.
  "No visible damage" ≠ "confirmed working"; insufficient evidence
  blocks push, it never counts as confirmation.
- `experimental_decide({ model, state, questions })` — questions map
  `{T1:{type:'boolean',instructions}}` → `answers.T1.probability`.
  One call per stage per listing; Boolean probability is P(true).
- Pass `{type:'file',mediaType,data}` with validated photo bytes in
  stage 2 (`jev-1.14.0`, experimental image input). Remote file URLs
  need `experimental_download`. `google/gemini-decision-1` is the
  documented fallback if Jev images underperform.
- Keep both stages in the ledger with model IDs and effective scoring
  inputs. Compare stages under the same prior; compare priors separately.
- Gateway decision fallbacks rerun the original state/questions and
  return the selected answers; they cannot add photos:
  https://vercel.com/docs/ai-gateway/models-and-providers/decision-fallbacks
- OpenAI-compat `/decisions` endpoint (image input = base64 data URLs,
  ≤128/req): https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-decisions
- Decision model catalog: https://vercel.com/ai-gateway/models?capabilities=decision
- Workflow = the real-time UI layer: `"use step"` ops are recorded
  tool calls (visible in `npx workflow web`); steps write events via
  `getWritable()` → `run.readable` → SSE to the scan lane; `createHook`
  suspends for claim approval, `resumeHook` wakes it.
- Workflow local observability UI: `npx workflow web`
- Agent-readable doc indexes: https://ai-sdk.dev/llms.txt ·
  https://workflow-sdk.dev/llms.txt

## Sponsors (optional; local fallback must keep working)

| Sponsor | Use in Hoardr | Docs | Env |
|---|---|---|---|
| Firedrill | Simulated claims and failure scenarios | https://firedrill.run/hacker-docs | CLI/workspace auth |
| Cognee | Taste memory — swipes → durable profile | https://docs.cognee.ai | API key, tenant ID and URL |
| Statsig | Pickiness threshold via Dynamic Config | https://docs.statsig.com | `STATSIG_KEY` |
| Amplitude | Alert→claim funnel events | https://amplitude.com/docs | `AMPLITUDE_API_KEY` |
| ~~Senso~~ | **CUT** — confirmed unusable (apiv2 404s; docs.senso.ai now shared-context/verification). Resale estimate = Jev T2p value band instead. | — | — |
| Guild AI | Alt model pool / agent runtime | https://docs.guild.ai | — |
| SingleStore | Opportunistic listings+vector store | https://docs.singlestore.com | — |
| Superlinked | Opportunistic semantic match/dedupe | https://docs.superlinked.com | — |
| Arcee | Small-model drafting (Pareto angle) | https://docs.arcee.ai | — |

Pick one integration after the core demo. Amplitude and Statsig share
one prize category. Skip Airbyte and Persona.

## Conventions

- UI look & feel follows **`STYLE.md`** (bright candy pop: chunky bordered
  components, hard shadows, big buttons, playful copy). Read it before
  touching `app/`.
- Battery wording is **frozen** — `lib/judge/battery.ts` T1–T12 + T2v.
  Pass it verbatim in `instructions`; use typed scores and rubrics for
  graded questions and explicit choices for T2v.
- Model emits typed answers; code applies thresholds and vetoes.
  Record local T11 separately. Missing required evidence cannot push.
- Use synthetic or expressly permitted fixtures. Trash Nothing's
  public API is the optional live source. Do not run the Freecycle
  scraper or publish the legacy corpus without permission.
- Claims are simulated and require approval; no live send or owner
  webhooks. SQLite is local only; hosted demo receipts are read-only
  unless backed by a shared database.
- Gate integrations on required configuration. Keep `mockJudge`
  available offline and label mock output distinctly.
- On any Workflow SDK bug or error: consult the official docs first
  (https://workflow-sdk.dev/docs · API ref
  https://workflow-sdk.dev/docs/api-reference · agent index
  https://workflow-sdk.dev/llms.txt). Do not guess at semantics.
- Never commit `.env` or any credentials. Copy `.env.example` to `.env`
  locally and fill in your own keys.

## Commands

```bash
# npm scripts (package.json)
npm run snapshot                    # scripts/pullSnapshot.ts — refresh listing corpus
npm run ingest                      # src/ingest/replay.ts — stream corpus, listing log only

# pipeline (full ingest → judge → ledger)
node src/pipeline.ts [limit]        # mockJudge offline (no key needed)
node --env-file=.env src/pipeline.ts [limit]
                                    # real Jev text+vision stages when AI_GATEWAY_API_KEY set

# Next.js app (post-migration)
npm run dev                         # next dev

# Workflow SDK CLI (npx workflow)
npx workflow web                    # local web UI — live step/tool-call timeline
npx workflow inspect runs           # recent workflow runs, terminal view
npx workflow inspect run <run-id>   # single run detail
npx workflow web --backend vercel   # same UI against Vercel World (post-deploy)

# Vercel CLI (optional, deployable-URL bonus only)
npx vercel@latest login             # link account
npx vercel@latest deploy --prod     # REQUIRED for judges' URL — replay-driven, no local SQLite
```

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
