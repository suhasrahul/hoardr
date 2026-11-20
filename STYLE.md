# STYLE.md — Hoardr UI Design System

Direction: **bright candy pop** — toy-like, bold, friendly. Hoardr is your
little treasure goblin: it digs through piles of junk so you don't have to.

The screen is a **sorting table**: one card at a time goes under
judgment in a central hot seat, then gets physically *thrown* — left
onto the junk pile, right onto the keeps pile. One central progress bar
(the verdict strip) tracks the whole shift. Big buttons, saturated
color blocks, springy motion, casual copy.

This doc is the source of truth for look & feel. Reskins keep the
existing data flow (`EventSource` scan stream, claim fetch calls)
untouched.

## User experience walkthrough

Every beat is driven by a real workflow event — the UI follows the
agent's thinking, it doesn't fake it. Realtime model latency is a
feature: the gaps are "the goblin is working," filled with shimmer.

0. **Arrival** — cream background, `HOARDR 🦝` wordmark, a one-line
   promise, and one big breathing coral `🚀 GO FIND TREASURE`. The feed
   choice sits below the button. No empty piles, counters, or verdict strip.
1. **Press** — button physically sinks, flips to `⛏️ DIGGING…`.
2. **The pile** — `pool` reveals the sorting table and deals a facedown stack behind the hot
   seat with a count badge; a sub-line under the strip reads
   `25 new · 12 already judged · 140 in pile`, with a `dedupe: sqlite`
   or `dedupe: blob` pill and `live · trash nothing` tag when live.
   Sets the stakes; dedupe is visibly saving re-judged junk.
3. **The sort** (per listing) — `seen` deals the top card into the hot
   seat, face-up: title, hood, photo thumb. Soft "sniffing" shimmer
   while the battery runs. Photo-bearing provisional PUSH or a score
   near the user's bar → `eye_start`: banana shimmer, `👁` tag, the
   photos fan out behind the card ("leaning in to look"). `eye_result`
   pops a `🔍 IKEA lamp` identity pill. `eye_error` deflates to grey —
   a provisional keeper quietly demotes. Then `verdict` decides the
   throw:
   - **REJECT** — verdict stamp slams, card arcs **left**, lands
     crumpled and dim on the junk pile.
   - **Kill vetoes** (`SCAM`, `☣ HAZARD`, `CONTRADICTED`, `UNVERIFIED`)
     — the loud stamp hits *mid-throw*: the goblin protecting you is
     the drama.
   - **Stage-0 kills** (`wanted`, `taken`, `nopics`) — no model call;
     a fast, cheap *flick* left. Didn't even look twice.
   - **DIGEST** — card tucks down into the maybe tray, half-hidden.
   - **PUSH** — mint flash, card glides **right** onto the keeps pile,
     score sticker spinning into its −6° tilt. "Ooh — keeper!"
   - `counter` → the verdict strip grows one segment — a live
   histogram of the goblin's calls. The strip and legend first appear
   when there's a verdict to read.
4. **Piles talk** — junk pile stacks messy (random tilts, dead grey,
   `🗑 18 tossed` chip; last-tossed title peeks). Keeps pile stacks
   clean, mint edges, score stickers peeking (`⭐ 3 kept`). Maybe tray
   sits low-opacity under the hot seat (`🤔 4 maybe`).
5. **The claim** — the keeper grid appears at clock-out (or tap the
   keeps pile to preview it during a scan). `CLAIM →` wiggles the card, `drafting your claim…`,
   then the drafted message appears with banana `APPROVE SEND` (a
   deliberate pause). Approve → confetti + mint `sent ✓ (simulated)`
   stamp.
6. **Clock-out** — `round_done` (not `done`) is the sorting-finished
   cue: the run is about to suspend on the chat hook, so `done` may
   arrive late or never. The table gives way to “3 keepers from 25
   listings” and the keeper cards. Maybe, Tossed, and Run details are
   expandable; the verdict strip moves into Run details.
7. **Round 2 — talk to the raccoon** — `chat_ready` enables the
   optional chat below the results. A candidate receipt can send
   `{pin}` on the chat hook to set the topic without limiting the
   raccoon to one listing. Answers stream in as `chat_delta`
   with `chat_tool` activity lines, then `chat` settles the exchange.
   `end` resumes the hook
   → `done` quietly closes the stream. The suspension is durable —
   leave the tab and the workflow
   still waits.

Emotional arc: pile pressure → rhythmic sort (toss, toss, toss) → the
dopamine spike of a card gliding right → the satisfying approve
ritual → a "defend your calls" finale. `paceMs` is a floor for
mock-mode demos only — real Jev latency provides the rhythm and
`pace` can drop near zero.

## Palette

The palette is the information system — each color has a job, and the
verdict strip literally becomes a histogram of the run as segments
land. CSS custom properties on `:root` in `app/globals.css`:

| Token | Hex | Job |
|---|---|---|
| `--paper` | `#FFF8EC` | The table everything sits on — warm cream, like a sticker-book page |
| `--card` | `#FFFFFF` | Cards, chips, deck backs |
| `--ink` | `#1B1B1B` | Every border, shadow, and label — what makes it toy-like, not flat-modern |
| `--coral` | `#FF6B57` | **"do the thing"** — only the primary action: GO FIND TREASURE, CLAIM. Also kill-veto stamps + strip segments |
| `--mint` | `#5CE1A0` | **"yes"** — keep glide, keeps-pile edges, score stickers, sent confirmations |
| `--banana` | `#FFD23F` | **"look closer"** — vision stage, eye-flips, APPROVE SEND; a deliberate pause before consequential actions |
| `--sky` | `#6EC6FF` | Neutral info, focus rings |
| `--grape` | `#B8A9FF` | Oddball accents: receipts, `mock judge` label, maybe-tray |
| `--muted` | `#9A917F` | Tossed cards, junk pile — deliberately dead so rejects sink |

Signature treatment on every interactive element:
**3px solid `--ink` border + `5px 5px 0 var(--ink)` hard shadow**,
`border-radius: 16–20px`. On `:active`, `translate(4px, 4px)` and
shadow shrinks to `1px 1px 0` — the button physically presses down.
No soft shadows, no gradients, no translucency.

## Typography

Loaded via `next/font/google` in `app/layout.tsx`:

- **Display — Bricolage Grotesque**: logo, headings, button labels,
  stat numbers, stamps. Chunky, opinionated.
- **Body — Nunito**: listing titles, descriptions, microcopy. Rounded
  and friendly.
- **Mono — Geist Mono** (already loaded): receipt probability bars only.

Scale: hero CTA 20–22px/700 · card titles 17–18px/700 · body 15px ·
micro labels 12px/700 uppercase tracked +0.05em.

## Components

### BigButton
- min-height 64px, padding `0 28px`, radius 18px, signature border+shadow.
- Label: Display font, ~18–20px, may start with an emoji (`🚀 GO FIND TREASURE`).
- Variants: `primary` = coral bg/white text; `approve` = banana bg/ink text;
  `secondary` = card-white bg/ink text; `disabled` = muted bg, no shadow,
  `cursor: default`.
- The header has exactly **one** primary button. Disabled while running
  (`DIGGING…`).

### StatChip
Chunky counters: white bg, signature border+shadow (smaller:
`3px 3px 0`), radius 999px, emoji + number + label. Pile chips live on
their piles: `🗑 N tossed` · `🤔 N maybe` · `⭐ N kept`.

### TheTable (the stage — replaces the two-column layout)

- **Deck** — facedown card stack behind the hot seat; offset ink
  shadows give depth, count badge on top. Shrinks as cards deal.
- **HotSeat** — the one active card, big (~320px wide), signature
  border, slight idle tilt. Shows title, hood, photo thumb. Shimmer
  states: `sniffing` (battery) and `👁 looking` (banana sweep, photos
  fan out behind the card).
- **JunkPile** — left of the hot seat. Messy stack: each tossed card
  keeps a random ±8deg tilt, dead-grey wash, ~35% opacity. Top card's
  title stays readable; `🗑 N tossed` chip. Hover/click peeks the last
  toss + its stamp.
- **KeepsPile** — right of the hot seat. Cleaner stack: mint borders,
  score stickers peeking, small intentional tilts. `⭐ N kept` chip.
  Click fans out into the review grid.
- **MaybeTray** — front-center under the hot seat. DIGEST cards tuck
  in half-submerged at low opacity. `🤔 N maybe` chip.
- **Pile browser** — count and close action stay at the top while
  compact rows scroll below. A row uses a small photo when available,
  with the title and verdict together. The same rows appear in the
  finished run's Maybe and Tossed disclosures.
- **VerdictStrip** — **the one central progress bar**, spanning the
  stage under the piles. Chunky track: 3px ink border, radius 999px,
  paper fill. Each judged item appends one segment, left→right:
  `--muted` tossed · `--grape` maybe · `--mint` kept · `--coral`
  kill-veto · thin `--banana` tick when eye-flipped. Ends as a
  readable histogram of the entire run. Label `N / total sorted`.

### FindCard ("treasure card" — the keeps-pile review card)
- Card-white, 3px ink border, `6px 6px 0` shadow, radius 20px, padding 18px.
- Score rendered as a **sticker badge**: circular mint chip, Display
  font, rotated −6deg, overlapping the card's top-right corner. Final
  verdicts drive the card groups, not a second display score cutoff.
- Vision-identified brand/model gets a banana pill tag (`🔍 IKEA lamp`).
- Eye-flipped finds get a `👁 eye-flipped` grape pill tag.
- `url` disclosure becomes a small `view post ↗` link.
- Actions row: `RECEIPT` (secondary, small) + `CLAIM →` (primary,
  coral) → `APPROVE SEND` (banana) → `sent ✓ (simulated)` in mint.
- Receipt expands to probability bars as **chunky candy bars** (rounded
  8px, filled mint/coral, label left, value right) — not ASCII blocks.
  Keep the same `probs` data.

### VerdictStamp
Reusable rotated label: Display font 12–13px, 2px ink border, radius
8px, `rotate(-8deg)`, stamp-slam entrance. Variants: `KEEPER` mint ·
`PASS` muted · `DIGEST` grape · `EYE↯` banana · kill set in coral/red:
`SCAM`, `☣ HAZARD`, `CONTRADICTED` (T2v), `UNVERIFIED` (eye_failed),
`GONE` (taken), `NOPE · wanted`, `NOPE · no photo`. Kill stamps can
slam *mid-throw*.

### InterrogationPanel (Round 2)
- An optional disclosure below the keeper cards and pile summaries.
- Dialogue box: raccoon portrait + `HOARDR` name plate on the left,
  transcript and input on the right. A pinned listing is shown as
  the current topic.
- Transcript: user questions in banana `>` lines, raccoon answers in
  body text — streamed via `chat_delta` with a blinking caret until
  `chat` settles the exchange.
- `chat_tool` shows an italic activity line ("…digging up the
  receipt…") while the model works; `chat_error` surfaces as a banner
  and the hook stays resumable.
- Input row: chunky bordered input + `ASK` primary button + `end`
  chip. `chat_ready` arms it for the whole conversation — until it
  lands, show `the raccoon is waking up…`; after `done`, `the
  raccoon clocked out 🦝💤`.
- No selection gate — “Ask about this listing” in a candidate's
  receipt can pin the card via `{pin}` on the chat hook.

### Feed Choice
- Saved listings by default, with a quiet text button to switch feeds.
  After a scan, the header distinguishes the previous run's feed from
  the feed selected for the next scan.
- No pickiness control or display threshold. The workflow owns the
  final keep, maybe, or toss call.

## Motion

The sort IS the show — one card at a time judged, then thrown.
Component motion is **Motion** (`motion/react`, pinned ≥7 days old);
CSS keeps ambient loops (shimmers, poofs, goblin poses, confetti,
breathe). `MotionConfig reducedMotion="user"` covers all Motion
animations; the CSS keyframes sit under the media query in
`globals.css`.

Choreography:

1. **Idle** — the CTA breathes (subtle ~2s scale pulse).
2. **Press** — `whileTap` squash, `⛏️ DIGGING…`.
3. **Deal** — deck's top card springs into the hot seat (`layoutId`
   + drop-in spring).
4. **Sniff** — shimmer while the battery runs (real latency as
   anticipation).
5. **Eye lean-in** — banana sweep, `👁` tag, photos fan behind the card
   (`eye_start`); identity pill pops (`eye_result`).
6. **The throw** — verdict decides. The card shares `layoutId`
   `card-{id}` between hot seat and pile card, so the same element
   physically travels to its pile with a spring; `FLIGHT` tunes
   spin/overshoot per throw:
   - toss: spins ~−38° into the junk pile, lands dim.
   - flick: stage-0 kills — fast tight whip, no ceremony.
   - glide: clean deliberate move to the keeps pile + mint flash.
   - tuck: soft drop into the maybe tray.
   - Kill stamps (`SCAM`, `☣ HAZARD`, `CONTRADICTED`) slam mid-throw.
7. **Strip tick** — a verdict segment pops scaleY onto the strip.
8. **Claim payoff** — wiggle → confetti + `sent ✓` stamp.

Tempo: throws are the punch (springs ~0.3–0.5s), deal springy,
confetti the one indulgence (~800ms). Tune `SPRING_*` / `FLIGHT`
stiffness+damping at the top of `page.tsx`.

Pacing: at fast cadences throws overlap — the next card deals while
the previous still flies. That's good: a blur of sorting. Only stamps
need the card settled first (slam fires on a delay).

## Event → animation contract

The workflow's stream events are the animation's script — every SSE
event on `run.readable` is a cue. Emitted by `workflows/scan.ts` (all
writes inside `"use step"` fns via `getWritable()`):

| Event | Discloses | Cue |
|---|---|---|
| `pool` | `runId`, total in pile, judging count, skipped, dedupe flag + `source` (sqlite/blob), `feed` (corpus/live) | Deck appears + pool sub-line + dedupe/feed pills; `runId` arms the `/api/scan/stream` reconnect lane |
| `seen` | id, title, hood, status, images (≤4) | Deal to the hot seat, sniff shimmer begins |
| `battery` | T1–T12 `probs`, strict/lenient/`mine` verdicts, score | Sniff resolves; may flash provisional lean (use `mine`, not strict/lenient) |
| `eye_start` | images (≤4) | Banana sweep, `👁` tag, photos fan behind the card |
| `eye_result` | verdict, `identity`, T2v, flipped | `🔍` identity pill pops; T2v ≤ 0.1 = fake-photo reject |
| `eye_error` | error string | Shimmer dies grey "couldn't see it"; provisional PUSH demotes |
| `verdict` | verdict, score, probs, `vetoedBy`, `bar`, `level`, identity, flipped, images, url | **The throw**: REJECT→toss-left, PUSH→glide-right, DIGEST→tuck-under, kill-veto→loud stamp mid-throw, stage-0→`flick` |
| `counter` | scanned, pushed, total | Verdict strip grows one segment |
| `round_done` | scanned, pushed, `run` stats, `candidates[]` (id, title, hood, verdict, score) | **Clock-out cue** — summary lands, candidate cards glow |
| `chat_ready` | `token`, `focusId` — once, right after `round_done` | Dialogue box docks, input arms for the whole conversation |
| `selected` | id, title | `{pin}` landed — card pins to the hot seat, piles dim |
| `chat_delta` | text | Streamed answer text with blinking caret |
| `chat_tool` | name, id? | "…digging up the receipt…" activity line |
| `chat` | q, a, turn | Exchange settles into the log, replacing the streamed draft |
| `chat_error` | error | Banner; the chat hook stays resumable |
| `done` | scanned, pushed | Quiet stream close after end — "the raccoon clocked out" |

From `workflows/claim.ts`:

| Event | Discloses | Cue |
|---|---|---|
| `claim_pending` | drafted message text | Card reveals draft + banana APPROVE SEND |
| `claim_sent` | draft, `simulated: true`, timestamp | Confetti + mint `sent ✓` stamp |

Recorded tool calls (`npx workflow web` timeline) mirror the show:
`pickPool`, `detectEye`, `judgeListing` (battery + ledger + eye call),
`emitEvent`, `sleep`, `buildRunContext`, `runTurn` (one per chat
turn, tools inside); hooks: a single `{runToken}:chat` drained by
`for await` — questions, `{pin}`s and `{done}` all arrive on it via
`/api/scan/interact`, and the suspension **is** the round-2 wait. Claim side:
`draftClaim`, `emitPending`, `sendClaim`, and the `claim:{id}` hook
resumed via `app/api/claim/[id]/route.ts`.

Disclosures the UI doesn't use (kept for the ledger, don't surface):
`battery.strict`/`lenient` (internal priors), `verdict.bar`/`level`
(vestigial — pickiness is a post-run UI filter now), `eye_result.verdict`
(superseded by `verdict`), `round_done.candidates` (client already has
rows by id), `chat_ready.turn`/`chat.turn`, `seen.status` (optional
WANTED/TAKEN badge only).

Wish-list events (not in the workflow — design around their absence):

- Deck peek — `pool` carrying the first few titles would let the
  facedown deck tease "next up" on card edges.
- `taste_hit` — T11 knows which saved want matched, but nothing
  discloses it; "hits your 'mid-century lamp' want" can't be shown yet.
- `run_error` — a fatal step failure just ends the SSE quietly; the
  goblin never trips visibly. On drop, the client reconnects via
  `/api/scan/stream?runId&from` (one event = one durable chunk, so the
  received count is the resume index); after 3 retries it falls back
  to the generic "connection lost" line.
- `battery` drip — a per-question emit inside `runBattery` would pace
  the sniff shimmer (wording stays frozen; progress emits don't change
  instructions).
- Images on stage-0 kills — `wanted`/`taken` verdicts emit
  `images: []`; those tossed cards show no thumbs.

Known gaps:

- Claim events go unheard — the client never opens an `EventSource` on
  the claim run's `run.readable`; it updates optimistically. Subscribing
  would make `claim_pending`/`claim_sent` drive the UI for real.

## Copy voice

First-person goblin. Short, warm, a little cheeky:

- CTA idle: `🚀 GO FIND TREASURE` · running: `⛏️ DIGGING…`
- Empty hot seat: `Hit the big button and I'll start digging 🦝`
- Empty keeps pile: `Nothing worth the trip yet.`
- New find: `Ooh — keeper!`
- Clock-out: `I looked at {n} things so you didn't have to — {k} kept,
  {m} maybe, {t} tossed.`
- Claim flow: `CLAIM →` → `drafting your claim…` → `APPROVE SEND` →
  `sent ✓ (simulated)`
- Round 2: input placeholder `ask the raccoon…` ·
  `the raccoon is waking up…` · `the raccoon clocked out 🦝💤`
- Mock mode must stay visibly labeled: grape pill `mock judge`.

## Layout

- Cream `--paper` background, single centered stage, max-width ~1100px,
  padding 24px.
- Header: `HOARDR 🦝` wordmark (Display font, ~28px) left. Once
  the pool arrives, show the current feed, run details, and scan action.
  Bottom border 3px ink.
- Stage (desktop): **JunkPile left · HotSeat center · KeepsPile
  right**; Deck behind the hot seat; MaybeTray front-center;
  VerdictStrip spanning the stage width just below.
- Results: keeper cards first, then Maybe, Tossed, optional chat,
  and Run details.
- Mobile (<720px): hot seat center; piles become bottom corners (toss
  flies bottom-left, keep bottom-right); strip full-width under the
  seat. The pile browser and keeper cards stack in one column as needed.
- All tap targets ≥48px.

## Accessibility

- Ink-on-pastel text everywhere; white-on-`--coral` only for large bold
  button labels (18px+/700 — meets 3:1).
- `:focus-visible` = 3px `--sky` outline, 3px offset, never removed.
- Verdicts never rely on color alone — stamp text always present.
- Piles expose counts textually; verdict strip gets
  `aria-label="N of total sorted, K kept"`.
- `prefers-reduced-motion` honored (see Motion).

## Dev must-work (offline baseline) vs. full path

The entire show must run end-to-end in dev with **no keys** —
`npm run dev`, `mockJudge`, corpus replay. That's the floor; anything
that only works with env vars is an upgrade, not a dependency.

| Beat | Offline dev (`npm run dev`, no keys) | Full path |
|---|---|---|
| `pool` / deck | Fires; `source: sqlite`, `feed: corpus` | `source: blob` on Vercel, `feed: live` with Trash Nothing creds |
| Deal / sniff | `mockJudge` answers instantly — `paceMs` (~1000) supplies the rhythm | Real Jev latency (~3.5s) is the rhythm; `pace` can drop toward 0 |
| Kill stamps / flick | Works — stage-0 kills need no model | Same |
| Eye lean-in (`👁`) | **Skipped** — `pickEye()` is null offline; the banana beat never fires | `AI_GATEWAY_API_KEY` → `jev-1.14.0` re-judges photo-bearing cards |
| Verdict / throw / strip | Works fully | Same, with real probs on receipts |
| `round_done` / Round 2 | Works — `runTurn` returns the grounded `offline receipt:` string over the whole run ctx (no LLM) | Gateway chat model answers in raccoon voice, tools + streamed deltas |
| Claim / approve | Works fully — simulated send + `createHook` suspension | Same (always simulated) |
| `mock judge` pill | Must be visible | Hidden |

Dev verification checklist — a full run must show: deck appears →
cards deal → kills flick → keeps glide → strip fills → `round_done`
prompt → pick → chat answers → `done` → claim → approve → confetti.
If any beat is missing offline it's a UI bug, not a missing key —
except `👁` and real chat answers, which are key-gated by design.

## Implementation notes

- Reskin only: `app/page.tsx` keeps `EventSource("/api/scan…")`,
  `claim()`, `approve()`, and all state shapes. Replace inline styles
  with `app/hoardr.module.css` (rename/replace the boilerplate
  `page.module.css`).
- Fonts: add `Bricolage_Grotesque` + `Nunito` to `next/font/google` in
  `layout.tsx`; keep `Geist_Mono` for receipts; drop `Geist` sans.
- Card flights use `layoutId` shared-element morphs (Motion) — the
  same element travels hot seat → pile; springs replace the `arrive-*`
  keyframes. CSS still owns ambient loops + poofs + confetti.
- Dependency: `motion` (`motion/react`) — pinned version ≥7 days old.
- Conventions still apply: battery wording frozen, mock output labeled,
  claims simulated with approval.
