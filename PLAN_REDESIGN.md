# PLAN_REDESIGN.md — Hoardr UI Redesign

Scope: `app/page.tsx` + `app/hoardr.module.css` (plus one data-hygiene fix).
Data flow untouched: `EventSource` scan stream, claim fetches, select/chat
hooks all stay as-is. This is a *staging* pass, not a new direction —
STYLE.md's sorting-table metaphor is right; the current layout doesn't
commit to it. Read STYLE.md before touching anything.

## Findings (why we're doing this)

The screen asserts "sorting table" but the table is invisible. A
`junk | hot | keeps` grid exists in CSS, yet zones have no floor, so
throws have no visible destination. The verdict strip — the live
histogram that should be the emotional scoreboard — is a ~10px sliver
of footer chrome while half the viewport is empty cream. Type hierarchy
is flat: after the wordmark, everything is same-size bold chips, so the
listing title (the protagonist) is among the smallest text on screen.

## P0 — Bugs found during review (fix regardless of reskin)

- [ ] **HTML entities render literally.** `Pegboard - 2 sheets @
      4&#39; x 4&#39;` shows raw `&#39;`. Corpus titles carry entities;
      nothing decodes them. Fix at the data boundary (normalize in
      `scripts/pullSnapshot.ts` / ingest) AND defensively at render
      (`decodeEntities` helper on `c.title` before display — small
      hand-rolled map for `&#39;` `&quot;` `&amp;` `&lt;` `&gt;`
      `&nbsp;` numeric refs is fine, no new dep).
- [ ] **Duplicate candidates.** "Trophies and Trophy Plaques" appears
      twice in the Round 2 chip row and twice in the maybe spread —
      under the `dedupe: blob` brag in the header, judges will notice.
      Dedupe by normalized title (lowercase, strip punctuation) when
      building the `candidates` list and the spread grid; also check
      whether the corpus itself has the dupe.
- [ ] **`waiting for treasure…` lags.** Status line still reads it
      while digging is underway. Wire it to scan state, not just
      stream-open state.
- [ ] **`0 / ? sorted`.** Total is known after `pool` — render
      `0 / 25` the moment the count lands; the `?` reads as a cop-out.
- [ ] **`skip` is camouflaged as a candidate.** Identical pill styling,
      wrapped into the same row. It's an action — ghost/outline
      treatment, pinned apart from the chips.
- [ ] **The raccoon occludes maybe-tray text.** He sits *on top of*
      the "Trophies and Trophy Plaq…" chip, covering the truncated
      tail — the exact chars needed to tell the two Trophy listings
      apart. A mascot that hides content is a bug, not decoration:
      reposition off the chip row or drop below it in z-order.

## Design principles for the pass

1. **Commit to the table.** Zones need visible ground. A throw must
   have a destination even when the pile is empty.
2. **One primary action per beat.** Coral CTA and the Round 2 banner
   currently fight at `round_done`. Only one thing glows at a time.
3. **The strip is the scoreboard, not chrome.** Promote it; it's the
   run's histogram and deserves mass.
4. **The card title is the protagonist.** Biggest text on stage after
   the wordmark.
5. **HUD is HUD, copy is copy.** Debug meta (`dedupe: blob`,
   `bar 0.64`, replay/corpus tags) gets a deliberate monospace ticker
   treatment so it reads as intentional demo instrumentation — or goes
   behind a `?dev` flag.
6. **The mascot commits or cuts.** Currently a smudge at card bottom.

## P1 — Stage the layout

### Zones get floors

- `.stage` grid stays `junk | hot | keeps`. Add to each zone a visible
  region: dashed ink boundary or a low-contrast zone label
  (`JUNK`, `HOT SEAT`, `KEEPS`) so empty zones still read.
- **Keeps zone ghost**: until first PUSH, render an empty dashed
  outline + `keeps land here ⭐`. Currently the right third is dead
  space for most of the run — the ghost makes the metaphor legible at
  t=0 and the first keep *activates* the zone (pop animation).
- Junk zone: same treatment — a floor boundary so tossed cards land
  *somewhere*.
- Deck: anchor it to the hot seat (stack behind/above the seat, count
  badge attached). It currently floats at top-center, detached from
  the action it feeds.
- Maybe tray: docks under the hot seat (already does). Raise resting
  opacity — it's currently easy to miss. See "Maybe tray legibility"
  below — it's the weakest element on screen right now.

### Maybe tray legibility (close-up review)

The tray is a horizontal grape bar that fails four ways at once:

- **Chips wrap then clip.** "Trophies and / Trophy Plaq" wraps to two
  lines and still truncates mid-word. Pills must never wrap — fixed
  height, `white-space: nowrap`, ellipsis or a wider chip; and the
  `slice(0,26)` cut should break on word boundaries.
- **No scroll affordance.** Chips run off the right edge with no
  fade/arrow — there's no way to know 9 more exist. Edge fade
  (mask-image) + a `›` nudge, or wrap to a 2-row mini-grid.
- **Chips don't separate from the tray.** Light-grape borders on a
  lavender bar — bump chip bg to `--card` white so they pop.
- **`N MAYBE` label hides its affordance.** It opens the spread but
  reads as a static count. Add `↗`/`fan` hint + pointer + hover state,
  same as the piles' `tap ⭐ to review`.
- Raccoon overlap handled in P0.

### Verdict strip promotion

- Height ~40–48px, full width, directly under the stage (not a page
  footer). Each segment = one verdict, colored per palette, min-width
  ~18px so small runs still show color.
- Segment icon or letter on hover; tap segment → open that zone's
  spread (junk segs → junk spread, etc.). Cheap to wire — `setSpread`
  already exists.
- Narration line integrated beside the count: `8 / 25 sorted — last:
  REJECT Free Walking Pad`. This replaces/fixes the lagging
  `waiting for treasure…` text — same element, real state.

### Header split

- Row 1 (user-facing): wordmark + LIVE + CHILL–PICKY slider + CTA.
  `PICKY 5 · bar 0.64` moves into the slider's tooltip or the HUD row.
- Row 2 (HUD ticker, monospace, small, clearly instrumentation):
  `25 new · 179 judged · 765 pile — replay · corpus · dedupe: blob`.
  Visually demoted (muted, tracked-out) so it stops competing with
  the controls row. Optional `?hud=0` to hide for clean screenshots.

### Hot seat card

- Title scale up to ~20–24px — protagonist of the stage.
- No-photo state: compact layout, no empty white photo frame (today a
  photo-less card is ~60% dead box). Photo frame only renders when
  `images.length > 0`.
- `CHECKING PHOTOS…` / `leaning PUSH…` pills: keep inside the card but
  anchor to a consistent slot (under hood line), not floating.
- Kill stamps mid-throw: keep, it's the best beat in the app.

## P2 — Round 2 + modal polish

### Round 2 — dialogue box (per updated STYLE.md)

STYLE.md now specs a dialogue box (raccoon portrait + `HOARDR` name
plate, docked at the bottom of the stage, piles dimmed, picked card
pinned on the hot seat) — not a slide-over panel. What still needs
fixing from the current build:

- **Prompt banner**: shrink the banana block to one row — heading
  `ROUND 2 — ask me why about any of these`, horizontally scrollable
  candidate chips, `skip` as a ghost button pinned right (P0). No
  wrapping wall of chips.
- Candidates deduped (P0) + word-boundary truncation.
- When the dialogue box docks (`chat_ready`), the banner collapses to
  a thin header line so the conversation owns the stage.
- During Round 2, the re-armed `GO FIND TREASURE` CTA demotes to
  secondary (outline, no coral fill) — the dialogue is the primary beat.
- Dialogue box itself is new build: raccoon portrait left, transcript
  (`chat_delta` + blinking caret, `chat_tool` activity line) and input
  row (`ASK` + `end`) right. Copy per STYLE.md:
  `the raccoon is waking up…` / `the raccoon clocked out 🦝💤`.

### Spread modal (maybe/junk/keeps fan-out)

- Real close affordance: ink-bordered `✕ close` chip top-right (now a
  tiny low-contrast pill) + Esc key + backdrop click (backdrop exists).
- Card tilts in the spread grid: reset to near-flat (≤2°) for
  legibility — scatter is charming in piles, noisy in a grid.
- Stamps (`MAYBE`, `KEEPER`, `NOPE·…`): consistent corner placement,
  smaller radius; currently they collide with titles at small sizes.
- Panel header already says `N maybe — tap any card for the why` —
  keep copy.

### Piles polish

- Junk pile: cap legible stamps to the top ~3 cards; deeper cards mute
  to silhouette/grey so the stack reads as texture, not mush.
- `all N →` chip: keep, good affordance.
- Demoted keeps in the maybe tray (below-bar): give a distinct edge
  (grape border → muted label like `below bar`) so demotion is a
  visible event, not a silent resort.

## P3 — Mascot & juice

- Pick ONE raccoon role: perched on the verdict strip, reacting —
  flinch on `SCAM`/`HAZARD` kills, lean-in on `CHECKING PHOTOS`,
  happy bounce on PUSH. Remove the tiny instances at card/chip bottom
  — and never let him overlap content again (see P0). Note the
  dialogue-box portrait (P2) is a second sanctioned spot; that's
  consistent — he lives on the strip, then sits up to talk in Round 2.
- First-keep zone activation pop (from P1) — small celebration since a
  PUSH at a picky bar is rare and is *the* demo moment.
- Segment-land tick sound/haptic-style scale pulse on the strip.

## Type & contrast pass (with P1)

- Ramp: wordmark (display) > hot-seat title (~22px) > zone labels >
  chips/pills > HUD ticker (mono, muted).
- `#9A917F` muted on `#FFF8EC` fails for small text — status/narration
  line bumps to ink at reduced opacity or a darker muted tone.
- Legal line (`raccoon art: OpenMoji`) stays small, moves to HUD row
  or settings — it's the faintest thing on screen, fine.

## Files

| File | Change |
|---|---|
| `app/page.tsx` | Zone ghosts, strip promotion, header split, banner collapse, modal close/Esc, dedupe, entity decode helper, narration state, CTA demotion during round 2 |
| `app/hoardr.module.css` | Zone floors, strip sizing, grid rows, ghost/outline button, ticker style, stamp muting, close chip, title scale |
| `scripts/pullSnapshot.ts` or ingest | Normalize/decode entities in titles at the source (preferred over UI-only) |
| `workflows/scan.ts` | Only if candidate dedupe is better done before emitting `round_done.candidates` |

## Phase order

- **P0** — bugs: entities, dupes, status lag, `?` total, skip styling,
  raccoon-on-text. Small, independent, unblocks demo credibility.
- **P1** — staging: zone floors + keeps ghost, strip promotion, header
  split, hot-seat title scale, no-photo card collapse. The big visual
  win lives here.
- **P2** — round 2 banner, modal close/Esc, pile stamp muting.
- **P3** — mascot role, activation pop, segment pulse. Polish only
  after staging lands.

Verify after each phase: `npm run dev`, replay-driven run
(`round_done` included), `npx workflow inspect runs` for event shape,
screenshot each beat (arrival / digging / mid-sort / round_done /
spread) to compare against the five current states.
