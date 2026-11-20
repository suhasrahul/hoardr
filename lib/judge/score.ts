import type { Listing } from '../ingest/normalize.ts';
import type { ProbMap } from './model.ts';
import type { Prior } from './priors.ts';
import { TEXT_BATTERY, VISION_BATTERY } from './battery.ts';

export type Verdict = 'PUSH' | 'DIGEST' | 'REJECT' | 'CLAIMED';

export interface Judgment {
  prior: string;
  score: number;
  verdict: Verdict;
  vetoedBy?: string;
  probs: ProbMap;
}

const WEIGHTS: Record<string, number> = {
  T3: 0.3, // condition — the core treasure question
  T5: 0.2, // desirability
  T6: 0.15, // brand value
  T9: 0.1, // credibility of the claims
  T11: 0.25, // taste match
  T13: 0.15, // the find — niche/collectible value T5 can't see
};

// Score = weighted treasure quality only. Logistics (T7/T8/T10) are
// card metadata — worth knowing, never worth scoring.
function quality(probs: ProbMap): number {
  let sum = 0;
  let wsum = 0;
  for (const [q, w] of Object.entries(WEIGHTS)) {
    if (probs[q] === undefined) continue;
    sum += probs[q] * w;
    wsum += w;
  }
  return wsum ? sum / wsum : 0;
}

export function judge(l: Listing, probs: ProbMap, prior: Prior): Judgment {
  if (l.status === 'TAKEN') return { prior: prior.name, score: 0, verdict: 'CLAIMED', probs };
  if (l.status === 'WANTED') return { prior: prior.name, score: 0, verdict: 'REJECT', vetoedBy: 'status', probs };

  const questions = [...TEXT_BATTERY, ...(l.images.length ? VISION_BATTERY : [])];
  for (const q of questions) {
    const p = probs[q.id];
    if (p === undefined) continue;
    if (q.veto === 'low' && p < (q.at ?? prior.vetoFloor))
      return { prior: prior.name, score: 0, verdict: 'REJECT', vetoedBy: q.id, probs };
    if (q.veto === 'high') {
      // T12 = hidden hazard. A disclosed defect is honest, not hidden:
      // T9 measures exactly that disclosure. Two tiers — egregious risk
      // (pests/mold > .6) kills regardless; mid-band risk only kills
      // when the giver is also evasive (hazard + hidden = veto).
      if (q.id === 'T12') {
        const hidden = (probs.T9 ?? 1) < 0.5;
        if (p <= 0.6 && !(p > prior.vetoCeil && hidden)) continue;
        return { prior: prior.name, score: 0, verdict: 'REJECT', vetoedBy: q.id, probs };
      }
      if (p > (q.at ?? prior.vetoCeil))
        return { prior: prior.name, score: 0, verdict: 'REJECT', vetoedBy: q.id, probs };
    }
  }

  // blind-spot pass-through: no photo → score floored, can never PUSH
  const score = quality(probs);
  const capped = l.images.length ? score : Math.min(score, prior.digestAt - 0.01);
  const verdict: Verdict =
    capped >= prior.pushAt ? 'PUSH' : capped >= prior.digestAt ? 'DIGEST' : 'REJECT';
  // Find-worthiness gate: condition is the heaviest weight, so a flawless
  // trivial item could otherwise alert on T3+T9 alone. PUSH must be a find
  // (T13), broadly desirable (T5), or a taste hit (T11 — a saved want is
  // the user's own definition of treasure).
  if (
    verdict === 'PUSH' &&
    (probs.T13 ?? 0) < 0.4 &&
    (probs.T5 ?? 0) < 0.6 &&
    (probs.T11 ?? 0) < 0.55
  )
    return { prior: prior.name, score: Math.round(capped * 100) / 100, verdict: 'DIGEST', vetoedBy: 'findGate', probs };
  return { prior: prior.name, score: Math.round(capped * 100) / 100, verdict, probs };
}
