# PLAN — Raccoon chat over the whole run

One durable conversation, whole-run context. The card pick becomes the
*entry point* (pins a focus card), not the *scope*: the raccoon knows
every judged card plus run stats, and drills into details with tools.

**UI concept: video-game dialogue, not a chat panel.** On pick, the
chosen card flies to center stage and stays pinned; piles dim behind
it. A chunky dialogue box docks at the bottom — raccoon portrait +
name plate, typewriter text, blinking ▼ — like an RPG NPC you
question. No card picked → the box opens with just the mascot at the
hot seat: "ask me anything about the pile."

Basis: `node_modules/workflow/docs/cookbook/integrations/ai-sdk.mdx`
(the version-matched durable-chat recipe) + `foundations/serialization`
(freeze shared context; per-step arg storage grows quadratically
otherwise). Verified against installed `workflow@5.7.0` /
`ai@7.0.174`: `defineHook`, `getWorkflowMetadata`, `streamText`,
`tool`, `stepCountIs`, `gateway` all present.

## Today (what we're replacing)

- `chatAbout` (`workflows/scan.ts:289`) — one `generateText`, receipt of
  ONE listing, no history, 1–3 sentence cap.
- Per-turn hook tokens `{runToken}:chat:{turn}` (`scan.ts:360-368`) —
  new token every turn; client dances through "agent resuming…".
- Selection gate `{runToken}:select` — chat only exists for a picked
  card; `skip` kills the conversation entirely.
- Known gaps already documented in STYLE.md: no `chat_thinking` /
  `chat_error`, dead air while the model runs.

## Design

**Context = the step argument.** `judged` lives in workflow memory;
the chat step gets the run by receiving a frozen context object.

- `buildRunContext(judged, meta)` → deep-`Object.freeze`d:
  - `run`: feed (corpus/live), pool totals, skipped/dedupe source,
    counts by verdict, stage-0 kills, eye calls + flips, tokens,
    avg timings, `useEye`, the run bar.
  - `cards[]`: `id, title, hood, verdict, score, vetoedBy, identity,
    value, flipped, key probs (T3/T5/T9/T13/T2v), body (~800 chars),
    images (URLs only — never bytes)`.
  - Build once after `round_done`; frozen → serde stores it once,
    step args reference it cheaply on later turns.
- `runTurn(ctx, messages, focusId)` step → `streamText` on
  `gateway(CHAT_MODEL)`, `stopWhen: stepCountIs(6)`.
  - `system`: raccoon/goblin persona + run stats + digest (one line
    per card) + focus card's full receipt when `focusId` set.
  - Consume `result.fullStream` → `emit()` `chat_delta` /
    `chat_tool` / `chat` events on the existing SSE lane (steps own
    `getWritable`, same as today). Fixes the dead-air gap.
  - Return `result.response.messages`; workflow appends to
    `allMessages: ModelMessage[]` — durable history, dumb client.
    Trim to last ~20 messages to bound arg size.
- Tools (`execute` runs inline in the step — full Node I/O; not
  individually durable, fine for read-only lookups):
  - `getReceipt(id)` → full probs, all priors' verdicts, stage +
    timing detail for that card.
  - `getListingText(id)` → full body (longer slice than the digest).
  - `compareCards(a, b)` → both receipts side by side.
  - `lookAtPhotos(id)` → fetch image bytes inside the step, return
    as tool-result content for a vision-capable chat model
    (verify `toModelOutput`/media tool-result shape in ai@7;
    fallback: mini vision `generateText` inside the tool).
- **One reusable chat hook** — `createHook<{q?,done?}>({token:
  `${runToken}:chat`})`, created once, `for await` loop (hooks are
  async-iterable). Replaces per-turn tokens; client keeps one token.
  `interact` route unchanged (`resumeHook(token, payload)`).
- **Selection kept, optional** — `{runToken}:select` stays;
  `{id}` pins `focusId`, `{id: null}` (skip) opens free chat with
  no pinned card. Either way `chat_ready` emits the single chat token.
  Picking another glowing card *during* chat is out of scope — the
  model already sees the whole run; a follow-up question does the job.

## Event protocol additions

| event | payload | client use |
|---|---|---|
| `round_done` | + `run` stats block (above) | summary line stays |
| `chat_ready` | `token`, `focusId?`, once | input arms once, no resuming… |
| `chat_delta` | `text` | streamed answer bubble |
| `chat_tool` | `name`, `id?` | "digging up the receipt…" activity line |
| `chat` | `q`, `a`, `turn` (final) | replace deltas with settled answer |
| `chat_error` | `error` | toast/banner, hook stays resumable |

STYLE.md event table + round-2 section need updating to match.

## Removed / simplified

- **`chatAbout` step deleted** (`workflows/scan.ts:289-307`) —
  `runTurn` replaces it wholesale: persona + digest system prompt,
  `streamText`, tools, streamed deltas.
- **Per-turn token machinery gone** — the
  `for (let turn…)` + `{runToken}:chat:{turn}` minting loop
  (`scan.ts:360-368`) collapses to one `createHook` + `for await`.
  One `chat_ready` for the whole conversation.
- **Client token dance gone** — `page.tsx` `chat.token` gating and
  the `agent resuming…` branch (`page.tsx:481-483`) disappear; the
  input arms once and stays armed.
- **INTERROGATE panel deleted** — the slide-over chat card
  (`page.tsx:455-484`) and its CSS (`.chat`, `.chatLog`, `.q`, `.a`
  in that context) are replaced by the `Dialogue` box. `.q`/`.a`
  styles may survive inside the box if they fit.
- **`Chat` state slims** — `{id,title,token,log}` →
  `{focusId?, token, log, draft}`; draft accumulates `chat_delta`
  until the final `chat` event settles it.
- **`chatAbout`'s `probs` string-building** — superseded by tools;
  the model pulls full probs via `getReceipt` when it needs them.
- Kept: `{runToken}:select` + `candidates` (the pick stays the way
  in), `interact` route, `endChat` → `{done:true}`.

## Steps

**A. Context + single-hook chat (backend)**
`scan.ts`: `buildRunContext`, `runTurn` (plain `streamText`, no tools
yet — digest in system), `allMessages` loop, one chat hook, `done`
break. Keep turn cap (12 → 24).
*Probe:* `npm run dev` scan → `round_done` → curl `interact` with
`{token, payload:{q:"how did the run go?"}}` → `chat` event answers
with real counts. Follow-up "and the second keeper?" resolves via
history.

**B. Tools**
Add the four tools + `stopWhen`. `lookAtPhotos` last — verify media
tool-result shape before wiring; land the other three first.
*Probe:* "why did you toss <tossed title>?" → `chat_tool` fires →
answer cites real probs. "compare <a> and <b>" works.

**C. UI — dialogue box**
`page.tsx` + `hoardr.module.css`: delete the slide-over INTERROGATE
panel; new `Dialogue` component docked bottom-of-stage —
`raccoon.svg` portrait (reuse mood states: idle/look/celebrate for
thinking/speaking), name plate, typewriter reveal fed by `chat_delta`,
blinking ▼ when the raccoon is done talking, `chat_tool` as an
activity line in the box ("…sniffing the receipt…"). Chosen card flies
to the hot seat via existing `layoutId`/`card-${id}` machinery and
stays; piles dim. `skip` opens the same box, no card. Input stays a
single chunky text field inside the box.
*Probe:* full loop in the browser; offline run (no gateway key) still
returns the labeled `offline receipt:` line.

**D. Stretch** — all shipped:
- ~~Raccoon voice pass on the system prompt~~ done.
- ~~Vercel reconnect~~ done: `pool` emits `runId`;
  `GET /api/scan/stream?runId&from` reads
  `getRun(runId).getReadable({startIndex})`; the client counts events
  (one event = one chunk → count = resume index) and reconnects up to
  3× on drop — removes the 300s `maxDuration` ceiling on long chats.
- ~~`zod` as a direct dep~~ done (`zod@4.1.11`; note: a union return
  type from a tool's `execute` breaks `tool()` overload inference —
  keep tool outputs single-shape).

## Fallback / gates

- No `AI_GATEWAY_API_KEY` → `runTurn` returns the labeled offline
  receipt string over the whole ctx (run summary + focus card) —
  never a naked error. `mockJudge` demos keep working.
- Tool throws → return `{error}` as the tool result, model
  apologizes in-character; `chat_error` only for the turn dying.
- History/context args stay under serialization comfort (~100KB);
  trim `allMessages` and cap digest bodies before it matters.

## Demo artifact

- Scan → pick a keeper → "why this one?" → "what almost made it?" →
  "compare it with <tossed card>" → "is that a stain in photo 2?"
  One continuous conversation, raccoon cites real receipts + photos.
- `npx workflow web` shows the run suspended on ONE chat hook across
  turns — the "the run waits, not a process" beat, intact.

## Cut criteria

If B slips, ship A+C: digest-only chat over the whole run still beats
today's scoped receipt-reader. If streaming deltas fight the SSE
lane, drop `chat_delta` — `chat` final events alone still work.
