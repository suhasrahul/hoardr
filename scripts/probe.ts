// Battery probe — creative review harness for the Jev question battery.
// data/probe.json holds crafted edge cases with expected directions;
// this scores each through the real judge (Jev if AI_GATEWAY_API_KEY,
// mock otherwise), applies the same deterministic scoring the workflow
// uses, and flags every expectation that misses.
//
//   node scripts/probe.ts          # text battery review
//   node scripts/probe.ts --eye    # + eye pass where expectations ask
//
// The probe judges the battery, not stage 0 — wanted/taken/no-photo
// cases are reported as stage0:* but still judged so we see the probs.

import { readFileSync } from "node:fs";
import { runBattery } from "../lib/judge/battery.ts";
import { pickJudge, pickEye } from "../lib/judge/model.ts";
import { judge } from "../lib/judge/score.ts";
import { PRIORS, priorAt } from "../lib/judge/priors.ts";
import { loadWants, tasteMatch } from "../lib/memory/taste.ts";
import type { Listing } from "../lib/ingest/normalize.ts";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

interface Probe {
  note: string;
  listing: Listing;
  expect: Record<string, string>;
}

const probes: Probe[] = JSON.parse(readFileSync("data/probe.json", "utf8"));
const wants = loadWants();
const model = pickJudge();
const eye = pickEye();
const mine = priorAt(0); // same fixed run bar as the workflow
const wantEye = process.argv.includes("--eye");

const qs = ["T1", "T2", "T3", "T5", "T6", "T9", "T11", "T12", "T13"];
const fmt = (v: number | undefined) => (v === undefined ? "  - " : v.toFixed(2));

function check(op: string, actual: number | string | undefined): boolean {
  if (actual === undefined) return false;
  if (op.startsWith(">=")) return Number(actual) >= Number(op.slice(2));
  if (op.startsWith(">")) return Number(actual) > Number(op.slice(1));
  if (op.startsWith("<=")) return Number(actual) <= Number(op.slice(2));
  if (op.startsWith("<")) return Number(actual) < Number(op.slice(1));
  if (op.startsWith("!")) return actual !== op.slice(1);
  return actual === op;
}

let pass = 0;
let fail = 0;
const misses: string[] = [];

for (const p of probes) {
  const l = p.listing;
  const { probs, confs, inputTokens } = await runBattery(l, model);
  probs.T11 = tasteMatch(l, wants);
  const me = judge(l, probs, mine);
  const strict = judge(l, probs, PRIORS[0]);

  // Stage-0 status for context (these bypassed it on purpose)
  const stage0 = l.status === "WANTED" ? "wanted" : l.status === "TAKEN" ? "taken" : l.images.length ? "" : "nopics";

  const results: string[] = [];
  for (const [k, op] of Object.entries(p.expect)) {
    const actual = k === "verdict" ? me.verdict : probs[k];
    if (check(op, actual)) {
      pass++;
    } else {
      fail++;
      results.push(`${k} ${op} got ${typeof actual === "number" ? actual.toFixed(2) : actual}`);
      misses.push(`${l.id} (${p.note.split("—")[0].trim()}): ${k} ${op} got ${typeof actual === "number" ? actual.toFixed(2) : actual}`);
    }
  }

  // Find-worthiness gate shipped in judge() — flag where it fired so the
  // report shows demotions (PUSH-quality score, not find-worthy).
  const gated = me.vetoedBy === "findGate";

  const t3conf = confs.T3 !== undefined ? ` T3conf=${confs.T3.toFixed(2)}` : "";
  const tok = inputTokens ? ` ${inputTokens}tok` : "";
  console.log(
    `${results.length ? "✗" : "✓"} ${l.id.padEnd(13)} ${me.verdict.padEnd(7)} ${me.score.toFixed(2)}` +
      `${me.vetoedBy ? ` veto:${me.vetoedBy}` : ""} [${qs.map((q) => `${q}=${fmt(probs[q])}`).join(" ")}]${t3conf}${tok}` +
      `${gated ? " ⚠GATE→DIGEST" : ""}` +
      `${stage0 ? ` stage0:${stage0}` : ""} ${results.length ? `MISS: ${results.join("; ")}` : ""}`,
  );
  console.log(`    ↳ ${p.note}`);

  if (wantEye && eye && l.images.length) {
    try {
      const r = await eye({ prompt: "", images: l.images, text: `${l.title}\n${l.body}`, baseProbs: probs });
      console.log(
        `    eye: t2v=${fmt(r.probs.T2v)} identity=${r.identity ?? "-"} value=${r.value ?? "-"} skipped=${r.skipped}`,
      );
    } catch (e) {
      console.log(`    eye: ERR ${String(e).slice(0, 100)}`);
    }
  }
}

console.log(`\n${pass} expectations met, ${fail} missed`);
if (misses.length) {
  console.log("Misses:");
  for (const m of misses) console.log(`  ${m}`);
}
