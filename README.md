<div align="center">

<img src="public/raccoon.svg" alt="HOARDR raccoon" width="120" />

# HOARDR
### LINK TO PAGE: https://hoardr.vercel.app 

### *I find free stuff you didn't know you absolutely needed.* 🦝

![LIVE](https://img.shields.io/badge/●_LIVE-Trash_Nothing_feed-ff6b57?style=for-the-badge&labelColor=1b1b1b)
![Judge](https://img.shields.io/badge/judge-Jev-5ce1a0?style=for-the-badge&labelColor=1b1b1b)
![Audit trail](https://img.shields.io/badge/every_keeper-has_a_receipt-ffd23f?style=for-the-badge&labelColor=1b1b1b)
![Claims](https://img.shields.io/badge/claims-simulated-b8a9ff?style=for-the-badge&labelColor=1b1b1b)

**"50 scanned · 3 worth your time."**

</div>

---

## 🗺️ The mission

Every day, thousands of perfectly good things get posted for free — a solid
oak desk, a barely-used espresso grinder, a box of vinyl — and the good ones
are gone within hours. Nobody has time to refresh a feed all day, and most of
it is junk: empty boxes, "WANTED" posts, mystery bags, and one suspicious
"send me a gift card" listing.

**HOARDR is a personal agent that does the digging for you.** It watches live
free-stuff listings, judges every single one, tosses the junk, and only taps
you on the shoulder when something is actually worth the trip.

And it never asks you to just trust it. **Every keeper comes with a receipt:**
the score, the questions it asked, what the photos showed, a price estimate,
and why it cleared your bar. An agent with an audit trail, not a black box.

Built in one day at the **tokens& × AWS Personal Agents Hackathon**
(San Francisco, Nov 20, 2026) — the brief was *"a shopping agent with an audit
trail"*. Our shopping is free. Our receipts are real.

---

## 🦝 A day in the life of the raccoon

```
  🌐 fetch           50 fresh listings from the live Trash Nothing feed
   │
  🧹 sniff           skip anything already judged
   │
  🧠 think           Jev answers the question battery — ONE call per listing:
   │                 is it real? a scam? condition? desirable? a hidden hazard?
   │                 a real find? does it match your wants? what's it worth?
   │
  ⚖️  decide          plain code (not the model!) applies vetoes + a weighted score
   │                 → KEEPER ⭐ · MAYBE 🤔 · PASS 🗑
   │
  📸 squint          promising ones get a second look with photos:
   │                 photo quality gate → Jev vision → do the photos match the text?
   │                 brand/model spotted? better price estimate?
   │
  🧾 receipt         every verdict is written to the ledger, with every answer
   │
  ✋ claim           you tap "Claim it" → see the drafted message → Approve
                     → "Simulated claim recorded" (nobody gets spammed)
```

### The house rules 📜

- **The model answers questions. Code makes decisions.** Jev returns typed
  answers (probabilities, scores, choices); thresholds and vetoes live in
  plain, readable code (`lib/judge/score.ts`).
- **No proof, no keeper.** Blurry, dark, or tiny photos fail the photo gate
  and count as *insufficient evidence* — which can never confirm a keeper.
- **Price is a hint, never a verdict.** Every listing gets a resale estimate
  (`≈ $25–50`), but it never changes whether something is kept.
- **Nothing is sent without you.** Claims wait for your approval, and in this
  demo they're simulated and clearly labeled.

---

## 🧾 What a receipt looks like (example)

```
⭐ KEEPER — Deep, Solid Two-Drawer File Cabinet           ≈ $50–100
   Lakeshore / Grand Ave, Oakland

   score vs your bar     0.64 vs 0.55   (+0.09) ✓
   condition             ██████████████████░░  0.95
   desirability          ██████████░░░░░░░░░░  0.52
   resale signal         ████████████████░░░░  0.84
   honesty               ██████████████░░░░░░  0.70
   photo vs text         ✓ photos confirm the listing
   brand / model         brand identified
   strict vs lenient     strict: MAYBE · lenient: KEEP

   [ Claim it → ]
```

---

## 🧰 Tools in the backpack

### Sponsor tools

| | Tool | What it does for the raccoon |
|---|---|---|
| 🗄️ | **SingleStore** | The ledger. Every judgment — listing, prior, stage, score, verdict, veto, and every per-question answer — goes into a `judgments` table. That's the audit trail behind each receipt. Also holds a seeded `price_reference` table. Falls back to SQLite when unset. |
| 🧠 | **Cognee** | Taste memory. Your taps, claims and approvals are remembered in a knowledge graph (`hoardr_taste`); before each scan the raccoon recalls your taste once and blends it into the "does this match your wants?" question. Falls back to `data/wants.json`. |
| 🚒 | **Firedrill** | Claim-safety drills against a synthetic giver inbox: no message before approval, exactly one after, none on a double-tap, and a clean fallback when the inbox is down. Integrated — agent registered, giver-inbox tool uploaded. |

### The rest of the kit

| | Tool | What it does |
|---|---|---|
| 🔮 | **Jev** (TypeSafe AI) via **Vercel AI Gateway** | The judge. `typesafe-ai/jev` answers the text battery; `typesafe-ai/jev-1.14.0` re-judges with photos. Called through the AI SDK's `experimental_decide`. |
| 🔁 | **Vercel Workflow SDK** | Each scan is a durable workflow: every step is a recorded tool call, events stream live to the page, and claims wait on an approval hook. |
| ⚛️ | **Next.js** | The sorting-table UI — cards fly to the junk pile or the keeps pile. |
| 🖼️ | **sharp** | Photo quality gate (blur, exposure, resolution) and resizing for the vision model. |
| 🌐 | **Trash Nothing API** | The live feed of free listings. |

---

## 🚀 Run it yourself

Requires Node 24+.

```bash
npm install
cp .env.example .env          # add AI_GATEWAY_API_KEY + TRASHNOTHING_API_KEY
npm run dev                   # → http://localhost:3000, hit "GO FIND TREASURE"
```

Handy extras:

```bash
node lib/pipeline.ts 20                   # headless run (mock judge if no gateway key)
node scripts/gateCheck.ts <photo-folder>  # see how photos score on the quality gate
```

Every sponsor integration switches on only when its env vars are set. With
none set, HOARDR still runs end to end on local fallbacks (mock judge,
SQLite, `wants.json`, simulated claims).

> **Note:** the Freecycle replay corpus used during development isn't in this
> repo (it isn't ours to publish), so scans use the Trash Nothing live feed.

---

## 🔮 What's next for the raccoon

- 🎯 **Fairer taste matching** — today a listing that just isn't on your
  wants list gets quietly penalized. "Not on your list" should mean
  "unknown", not "bad".
- 🧠 **A raccoon that learns your eye** — tap three cards you'd grab and watch
  the next scan reshuffle, with Cognee building a real taste profile over time.
- 📬 **Contacting the seller for you** — in the future, HOARDR will reach out
  to the seller or giver directly to claim or buy the item: it sends the
  "still available?" message through the listing site, handles the reply,
  and lines up the pickup — always behind your one-tap approval.
- 🔔 **Pings, not polling** — scheduled scans in the background and a push
  notification only when a true keeper shows up.
- 🗺️ **Worth-the-trip math** — pickup distance, travel time and "needs a truck"
  folded into the decision, not just the badge.
- 🧲 **More hunting grounds** — Craigslist free, Buy Nothing, Freecycle (with
  permission), all deduped into one pile.
- 🪞 **"Similar to a past keeper"** — vector search in SingleStore to spot
  repeats and cross-posts.
- 💵 **Sharper prices** — back the resale bands with sold-listing comps and
  cite the source on the receipt.
- 🚒 **Drills on every change** — run the Firedrill claim-safety drills in CI
  so "never sends without approval" stays provably true.

---

## 👥 Team

**Suhas Rahul** · **Hadrien Postel-vinay**

## 🙏 Credits

Raccoon art: [OpenMoji](https://openmoji.org) — CC BY-SA 4.0.

<div align="center">

*Nothing good today? "I looked at 50 things so you didn't have to."* 🦝

</div>
