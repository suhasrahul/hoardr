// The question battery — his taste, frozen as prompts.
// Wording = identity: edit deliberately, then re-freeze.
// ONE model call per listing: all text questions fan out in a single prompt;
// T2v joins only when images exist.

import type { Listing } from '../ingest/normalize.ts';
import type { JudgeModel, ProbMap } from './model.ts';

export interface BatteryQuestion {
  id: string;
  text: string;
  veto?: 'low' | 'high'; // low: fails if prob < floor; high: fails if prob > ceil
  at?: number; // override the prior's veto threshold for this question
}

// The battery, treasure-focused: quality questions score; gate questions
// veto outright; logistics questions (T7/T8/T10) are metadata on the
// card, never scored. T4 removed — images.length is structural truth.
export const TEXT_BATTERY: BatteryQuestion[] = [
  { id: 'T1', text: 'Is this a real item someone is giving away (not wanted/iso/spam)?', veto: 'low' },
  // T2 pinned at 0.9 — not a skepticism gate, just catches the absurd.
  { id: 'T2', text: 'Does this smell like a scam (gift cards, shipping, money, personal info)?', veto: 'high', at: 0.9 },
  { id: 'T3', text: 'How good is the claimed condition?' },
  { id: 'T5', text: 'How desirable is this item category generally?' },
  { id: 'T6', text: 'Does it have brand/resale value signals?' },
  { id: 'T7', text: 'How much effort is pickup (coordination, scheduling)?' },
  { id: 'T8', text: 'How urgent is the post (moving sale, today only, curb)?' },
  { id: 'T9', text: 'Does the giver seem honest (discloses flaws, specifics)?' },
  { id: 'T10', text: 'Is it portable by one person in a normal car?' },
  { id: 'T11', text: 'Does it match the user\'s saved wants and taste?' },
  // T12 = false treasure: pests/mold/broken makes it worthless, period.
  // (wording frozen — role changed from effort-drag to hard hazard gate)
  { id: 'T12', text: 'Any hidden hassle risk (pests, mold, hazmat, broken)?', veto: 'high' },
  // T13 — probe finding: T5 ("desirable generally") scores mass-market
  // appeal and systematically undervalues niche/collectible treasure
  // (piano .36, FM2 .36, vinyl .39). The find question asks what T5
  // can't: would the right person consider this valuable?
  { id: 'T13', text: 'Is this a find — rare, collectible, or unusually valuable to the right person?' },
];

export const VISION_BATTERY: BatteryQuestion[] = [
  { id: 'T2v', text: 'Do the photos confirm or contradict the text claims?' },
];

export function buildPrompt(l: Listing): string {
  const qs = [...TEXT_BATTERY, ...(l.images.length ? VISION_BATTERY : [])];
  return [
    'You are judging a free-stuff listing. Rate each question 0.0-1.0.',
    'Return STRICT JSON: {"T1":0.x,"T2":0.x,...} — no other text.',
    '',
    `LISTING [${l.status}] ${l.title}`,
    `Location: ${l.hood} (${l.town}) · Posted: ${l.postedAt}`,
    l.body.slice(0, 1200),
    l.images.length ? `Photos: ${l.images.length} attached.` : 'Photos: none.',
    '',
    ...qs.map((q) => `${q.id}: ${q.text}`),
  ].join('\n');
}

export async function runBattery(
  l: Listing,
  model: JudgeModel,
): Promise<{ probs: ProbMap; confs: Record<string, number>; inputTokens?: number; value?: string | null }> {
  const r = await model({
    prompt: buildPrompt(l),
    images: l.images,
    text: `${l.title}\n${l.body}`,
  });
  return { probs: r.probs, confs: r.confs, inputTokens: r.inputTokens, value: r.value ?? null };
}

// --- `decide` question map (experimental_decide via AI SDK) ---
// Frozen battery wording goes into `instructions` verbatim. Graded questions
// get ordered score rubrics (score normalizes to 0..1 by levels-1); yes/no
// questions stay boolean; T2v + T2i are explicit choices.

export type DecideQuestion =
  | { type: 'boolean'; instructions: string }
  | { type: 'score'; instructions: string; criteria: string[] }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> };

const SCORE_CRITERIA: Record<string, string[]> = {
  T3: ['poor or broken', 'used, visible flaws', 'good used condition', 'like new / excellent'],
  T5: ['junk to most people', 'niche interest only', 'broadly useful', 'highly desirable'],
  T7: ['none — curb or easy handoff', 'minor coordination', 'scheduling plus stairs/haul', 'truck or movers needed'],
  T8: ['no rush', 'this week', 'soon', 'today / going fast'],
  T9: ['vague or evasive', 'generic', 'specific and honest', 'discloses flaws unprompted'],
  T13: ['common household item', 'useful but unremarkable', 'niche or collectible interest', 'a real find'],
};

// score answer normalization: score / (levels - 1)
export const SCORE_LEVELS: Record<string, number> = Object.fromEntries(
  Object.entries(SCORE_CRITERIA).map(([k, v]) => [k, v.length]),
);

function decideQuestion(q: BatteryQuestion): DecideQuestion {
  const rubric = SCORE_CRITERIA[q.id];
  return rubric
    ? { type: 'score', instructions: q.text, criteria: rubric }
    : { type: 'boolean', instructions: q.text };
}

export function textDecideQuestions(): Record<string, DecideQuestion> {
  return {
    ...Object.fromEntries(TEXT_BATTERY.map((q) => [q.id, decideQuestion(q)])),
    // Price estimate on EVERY listing, in the same call (no extra request).
    // Text-only, so rougher than the eye's photo-based T2p, which overrides
    // it when the eye runs. Metadata only — not in score.ts WEIGHTS.
    T2p: T2P_TEXT_QUESTION,
  };
}

const T2V_QUESTION: DecideQuestion = {
  type: 'choice',
  instructions: VISION_BATTERY[0].text,
  criteria: {
    confirms: 'photos support the condition claims made in the text',
    contradicts: 'photos show damage, wear, or a mismatch the text hides',
    insufficient_evidence: 'photos do not show enough to confirm or contradict',
  },
};

const T2I_QUESTION: DecideQuestion = {
  type: 'choice',
  instructions: 'What can the photos and text identify about the item\'s make or model?',
  criteria: {
    confirmed_model: 'brand AND model identified from a badge, logo, or model number',
    brand_only: 'brand identified; exact model unclear',
    generic_or_unknown: 'no reliable brand or model identification',
    contradicts_listing: 'photos show a different brand/model than the text claims',
  },
};

// T2p — resale estimate. decide can't emit a dollar figure, so the eye
// (which sees brand/model via T2i) answers in value bands; code maps
// the band to a display label. Metadata, never scored.
const T2P_QUESTION: DecideQuestion = {
  type: 'choice',
  instructions: 'What is the realistic resale value of this item as shown in the photos?',
  criteria: {
    under_10: 'junk or near-worthless — under $10',
    '10_25': 'trivial resale — roughly $10 to $25',
    '25_50': 'small resale — roughly $25 to $50',
    '50_100': 'modest resale — roughly $50 to $100',
    '100_250': 'meaningful resale — roughly $100 to $250',
    '250_500': 'good resale — roughly $250 to $500',
    '500_1000': 'strong resale — roughly $500 to $1,000',
    over_1000: 'serious resale — over $1,000',
  },
};

export const VALUE_LABEL: Record<string, string> = {
  under_10: '≈ <$10',
  '10_25': '≈ $10–25',
  '25_50': '≈ $25–50',
  '50_100': '≈ $50–100',
  '100_250': '≈ $100–250',
  '250_500': '≈ $250–500',
  '500_1000': '≈ $500–1k',
  over_1000: '≈ $1k+',
};

// Same bands as T2P_QUESTION, judged from the listing text alone.
const T2P_TEXT_QUESTION: DecideQuestion = {
  ...T2P_QUESTION,
  instructions: 'What is the realistic resale value of this item, based on the listing title and description?',
};

export function eyeDecideQuestions(): Record<string, DecideQuestion> {
  return {
    ...textDecideQuestions(),
    T2v: T2V_QUESTION,
    T2i: T2I_QUESTION,
    T2p: T2P_QUESTION,
  };
}
