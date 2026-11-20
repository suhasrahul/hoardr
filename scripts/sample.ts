// Sample audit — judge a real sample the same way the workflow does,
// then write a human-reviewable report pairing each listing's actual
// content (title/body/link) with the decision we made and why.
//
//   node scripts/sample.ts            # corpus, newest 25
//   node scripts/sample.ts -n 40      # bigger sample
//   node scripts/sample.ts --live     # pull Trash Nothing instead
//
// Output: reports/sample.md — kept / maybe / rejected, each entry with
// the source link, score, key probs, and the vetoes that fired. The
// point is human review: open the report, click listings, check calls.

import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { runBattery, buildPrompt } from "../lib/judge/battery.ts";
import { capUnconfirmed, pickJudge, pickEye } from "../lib/judge/model.ts";
import { priorAt } from "../lib/judge/priors.ts";
import { judge } from "../lib/judge/score.ts";
import { loadWants, tasteMatch } from "../lib/memory/taste.ts";
import { fetchTnPosts } from "../lib/ingest/trashnothing.ts";
import type { Listing } from "../lib/ingest/normalize.ts";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const args = process.argv.slice(2);
const n = Number(args[args.indexOf("-n") + 1]) || 25;
const live = args.includes("--live");

let items: Listing[] = [];
let feed = "corpus";
if (live) {
  items = await fetchTnPosts(60).catch(() => [] as Listing[]);
  if (items.length) feed = "live:trashnothing";
}
if (!items.length) {
  const files = readdirSync("data/corpus").filter((f) => f.endsWith(".json"));
  items = files.flatMap((f) => JSON.parse(readFileSync(`data/corpus/${f}`, "utf8")));
}
items.sort((a, b) => b.postedAt.localeCompare(a.postedAt));
const pool = items.slice(0, n);

const model = pickJudge();
const eye = pickEye();
const wants = loadWants();
const mine = priorAt(0); // same lenient run bar the workflow ships with
const KEY = ["T1", "T2", "T3", "T5", "T6", "T9", "T11", "T12", "T13"];

interface Row {
  l: Listing;
  verdict: string;
  score: number;
  probs: Record<string, number>;
  confs: Record<string, number>;
  vetoedBy?: string | null;
  batteryMs: number;
  eyeMs: number;
  tokens: number;
  flipped: boolean;
  eyeNote?: string;
  gate?: unknown;
}

const rows: Row[] = [];
for (const l of pool) {
  const kill = l.status === "WANTED" ? "wanted" : l.status === "TAKEN" ? "taken" : l.images.length === 0 ? "nopics" : null;
  if (kill) {
    rows.push({ l, verdict: kill === "taken" ? "CLAIMED" : "REJECT", score: 0, probs: {}, confs: {}, vetoedBy: kill, batteryMs: 0, eyeMs: 0, tokens: 0, flipped: false });
    continue;
  }

  const t0 = Date.now();
  const { probs, confs, inputTokens } = await runBattery(l, model);
  const batteryMs = Date.now() - t0;
  probs.T11 = tasteMatch(l, wants);
  const me = judge(l, probs, mine);
  let final = me;
  let flipped = false;
  let eyeMs = 0;
  let eyeTokens = 0;
  let eyeNote: string | undefined;
  let gate: unknown;

  const promise = (probs.T13 ?? 0) >= 0.5 || (probs.T6 ?? 0) >= 0.6;
  const lowConf = confs.T3 !== undefined && confs.T3 < 0.5;
  if (eye && l.images.length && (me.verdict === "PUSH" || promise || lowConf)) {
    const t1 = Date.now();
    try {
      const r = await eye({ prompt: buildPrompt(l), images: l.images, text: `${l.title}\n${l.body}`, baseProbs: probs });
      eyeMs = Date.now() - t1;
      r.probs.T11 = probs.T11;
      const eMine = judge(l, r.probs, mine);
      if (r.probs.T2v !== undefined && r.probs.T2v <= 0.1) {
        eMine.verdict = "REJECT";
        eMine.vetoedBy = "T2v";
      }
      capUnconfirmed(eMine, r.probs.T2v);
      if (
        eMine.verdict === "DIGEST" &&
        r.probs.T2v === 1 &&
        r.value === "over_150" &&
        eMine.score >= mine.pushAt - 0.05
      ) {
        eMine.verdict = "PUSH";
        delete eMine.vetoedBy;
      }
      flipped = eMine.verdict !== me.verdict;
      eyeTokens = r.inputTokens ?? 0;
      gate = r.gate;
      eyeNote = `t2v=${r.probs.T2v?.toFixed(2) ?? "-"} id=${r.identity ?? "-"} value=${r.value ?? "-"}${flipped ? ` FLIPPED ${me.verdict}→${eMine.verdict}` : ""}`;
      final = eMine;
    } catch (e) {
      eyeMs = Date.now() - t1;
      eyeNote = `eye_error: ${String(e).slice(0, 120)}`;
      if (me.verdict === "PUSH") {
        me.verdict = "DIGEST";
        me.vetoedBy = "eye_failed";
        final = me;
      }
    }
  }
  rows.push({ l, verdict: final.verdict, score: final.score, probs: final.probs, confs, vetoedBy: final.vetoedBy ?? null, batteryMs, eyeMs, tokens: (inputTokens ?? 0) + eyeTokens, flipped, eyeNote, gate });
  process.stderr.write(`  ${rows.length}/${pool.length} ${final.verdict} ${l.id}\r`);
}

// ---- report ----
const by = (v: string) => rows.filter((r) => r.verdict === v);
const kept = by("PUSH"), maybe = by("DIGEST"), rejected = by("REJECT"), claimed = by("CLAIMED");
const bat = rows.filter((r) => r.batteryMs > 0);
const eyes = rows.filter((r) => r.eyeMs > 0);
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
const vetoes = new Map<string, number>();
for (const r of rows) if (r.vetoedBy) vetoes.set(r.vetoedBy, (vetoes.get(r.vetoedBy) ?? 0) + 1);

const f = (v?: number) => (v === undefined ? "-" : v.toFixed(2));
const clip = (s: string, n = 400) => (s.length > n ? `${s.slice(0, n)}…` : s);

function entry(r: Row) {
  const p = r.probs;
  const lines = [
    `### ${r.l.title}`,
    ``,
    `- **link**: ${r.l.url || "(no source url)"}`,
    `- **where**: ${r.l.hood || r.l.town} · **verdict**: ${r.verdict} · **score**: ${r.score.toFixed(2)}${r.vetoedBy ? ` · **veto**: ${r.vetoedBy}` : ""}${r.flipped ? " · **eye flip**" : ""}`,
    `- **probs**: ${KEY.map((q) => `${q}=${f(p[q])}`).join(" ")}`,
  ];
  if (r.eyeNote) lines.push(`- **eye**: ${r.eyeNote}`);
  if (r.gate) lines.push(`- **photo gate**: ${JSON.stringify(r.gate)}`);
  lines.push(`- **says**: ${clip(r.l.body.replace(/\s+/g, " ")) || "(no body)"}`, `- **photos**: ${r.l.images.length}`, ``);
  return lines.join("\n");
}

const interesting = rows.filter(
  (r) => r.flipped || (r.verdict !== "REJECT" && r.probs.T3 !== undefined && r.probs.T3 < 0.4) || (r.verdict === "REJECT" && r.probs.T5 !== undefined && r.probs.T5 > 0.5 && !r.vetoedBy?.startsWith("nopics")),
);

const report = [
  `# Hoardr sample audit — ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
  ``,
  `Feed: **${feed}** · sample: **${rows.length}** of ${items.length} · model: **${process.env.AI_GATEWAY_API_KEY ? "jev" : "mock"}** + **${eye ? "jev-1.14 (eye)" : "no eye"}** · run bar: **${mine.pushAt}** (lenient baseline)`,
  ``,
  `## Summary`,
  ``,
  `| verdict | count |`,
  `|---|---|`,
  `| PUSH (kept) | ${kept.length} |`,
  `| DIGEST (maybe) | ${maybe.length} |`,
  `| REJECT | ${rejected.length} |`,
  `| CLAIMED (gone) | ${claimed.length} |`,
  ``,
  `Stage-0 kills (no model spend): **${rows.filter((r) => r.batteryMs === 0).length}** · battery calls: **${bat.length}** · eye calls: **${eyes.length}** · flips: **${rows.filter((r) => r.flipped).length}**`,
  `avg battery: **${avg(bat.map((r) => r.batteryMs))}ms** · avg eye: **${avg(eyes.map((r) => r.eyeMs))}ms** · total input tokens: **${rows.reduce((a, r) => a + r.tokens, 0)}**`,
  ``,
  `### Vetoes`,
  ``,
  ...[...vetoes.entries()].map(([k, c]) => `- ${k}: ${c}`),
  ``,
  `## Kept — the treasure we pushed (${kept.length})`,
  ``,
  `*Audit: click each link — is it actually good? Would you go get it?*`,
  ``,
  ...kept.sort((a, b) => b.score - a.score).map(entry),
  `## Maybe — digested under the bar (${maybe.length})`,
  ``,
  ...maybe.sort((a, b) => b.score - a.score).map(entry),
  `## Rejected (${rejected.length})`,
  ``,
  ...rejected.map(entry),
  ...claimed.map(entry),
  `## Flagged for review (${interesting.length})`,
  ``,
  `*Eye flips, keeps with weak condition scores, rejects that scored high — the cases most likely to expose miscalibration.*`,
  ``,
  ...interesting.map((r) => `- **${r.l.id}** ${r.l.title} — ${r.verdict} ${r.score.toFixed(2)}${r.vetoedBy ? ` veto:${r.vetoedBy}` : ""}${r.eyeNote ? ` · ${r.eyeNote}` : ""}`),
  ``,
].join("\n");

mkdirSync("reports", { recursive: true });
writeFileSync("reports/sample.md", report);
// Structured sidecar for counterfactual analysis (gate rules, eye spend).
writeFileSync(
  "reports/sample.json",
  JSON.stringify(
    rows.map((r) => ({
      id: r.l.id, title: r.l.title, url: r.l.url, verdict: r.verdict, score: r.score,
      vetoedBy: r.vetoedBy, probs: r.probs, confs: r.confs, batteryMs: r.batteryMs, eyeMs: r.eyeMs,
      tokens: r.tokens, flipped: r.flipped, eyeNote: r.eyeNote,
    })),
    null, 2,
  ),
);
console.log(`\nwrote reports/sample.md — ${kept.length} kept, ${maybe.length} maybe, ${rejected.length} rejected, ${claimed.length} claimed (${bat.length} battery + ${eyes.length} eye calls)`);
