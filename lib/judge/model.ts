// Pluggable model call. Everything downstream consumes ProbMap —
// questionId → 0..1 probability — so the provider can change underneath.

import type { Listing } from '../ingest/normalize.ts';

export type ProbMap = Record<string, number>;

export interface JudgeCall {
  prompt: string;
  images: string[];
  text: string; // listing title+body only — heuristics must not see question text
  // stage-1 answers; eyeJudge returns these (+ T2v) when the photo gate
  // blocks every photo and Jev is never called
  baseProbs?: ProbMap;
}

export interface JudgeResult {
  probs: ProbMap;
  confs: Record<string, number>; // per-question answer confidence (0..1)
  inputTokens?: number;
  value?: string | null; // T2p resale band from the text pass — metadata, never scored
}

export type JudgeModel = (call: JudgeCall) => Promise<JudgeResult>;

// Deterministic heuristic judge — runs the pipeline with no API.
// Also the demo fallback if venue Wi-Fi dies mid-judgment.
export const mockJudge: JudgeModel = async ({ text, images }) => {
  text = text.toLowerCase();
  const has = (...ws: string[]) => ws.some((w) => text.includes(w));
  return {
    probs: {
      T1: has('wanted', 'iso ', 'looking for') ? 0.1 : 0.95, // is-an-item
      T2: has('gift card', 'wire', 'shipping', 'send money') ? 0.9 : 0.05, // scam
      T3: has('like new', 'mint', 'barely used') ? 0.8 : has('broken', 'parts', 'needs repair') ? 0.2 : 0.5,
      T5: has('vintage', 'leather', 'solid wood', 'bike', 'espresso') ? 0.8 : 0.4,
      T6: has('sonos', 'dyson', 'herman miller', 'le creuset', 'miele') ? 0.85 : 0.35,
      T7: has('curb', 'porch', 'first come') ? 0.3 : 0.6, // pickup effort (low = good)
      T8: has('today', 'asap', 'going to goodwill', 'moving') ? 0.85 : 0.4, // urgency
      T9: has('honestly', 'full disclosure', 'as-is', 'as is') ? 0.8 : 0.5,
      T10: has('sofa', 'sectional', 'piano', 'armoire') ? 0.2 : 0.7, // portable
      T11: 0.5, // taste match — needs the want profile, neutral for now
      T12: has('bed bug', 'mold', 'smoke smell', 'roach') ? 0.9 : 0.1, // hassle risk
    },
    confs: {},
  };
};

// --- Real judges: AI SDK `experimental_decide` → Jev via AI Gateway ---
// Stage 1 (jevJudge): text/JSON state, T1–T12 in ONE call per listing.
// Stage 2 (eyeJudge): jev-1.14.0, photo bytes as file parts, T1–T12 re-ask
// plus T2v (confirms/contradicts/insufficient) and T2i (brand/model ID).
// Both need AI_GATEWAY_API_KEY; `ai` is imported lazily so the repo still
// runs offline without node_modules.

import { eyeDecideQuestions, SCORE_LEVELS, textDecideQuestions } from './battery.ts';
import type { PhotoGateResult } from './photoGate.ts';

export interface PhotoGateEntry extends PhotoGateResult {
  url: string;
}

export interface EyeResult {
  probs: ProbMap;
  confs: Record<string, number>;
  identity: string | null; // T2i choice: confirmed_model | brand_only | ...
  value: string | null; // T2p choice: under_10 | … | over_1000 (8 bands)
  model: string;
  gate: PhotoGateEntry[]; // one per photo tried — receipt shows these
  skipped: boolean; // true = no photo passed the gate, Jev not called
  inputTokens?: number;
}

type DecideAnswers = Record<
  string,
  { probability?: number; score?: number; choice?: string; probabilities?: Record<string, number> }
>;

// T2v choice → ProbMap scale. Contradiction (0) is a hard block applied
// by the caller; insufficient evidence is never counted as confirmation.
const T2V_TO_PROB: Record<string, number> = {
  confirms: 1,
  insufficient_evidence: 0.4,
  contradicts: 0,
};

// Jev answers carry per-level probabilities; the AI SDK drops the raw
// `confidence` field, so derive it: conf = top probability = "how
// settled is this answer". Code routes on it downstream.
function answersToProbMap(answers: DecideAnswers): { probs: ProbMap; confs: Record<string, number> } {
  const probs: ProbMap = {};
  const confs: Record<string, number> = {};
  for (const [id, a] of Object.entries(answers)) {
    if (a.probabilities) {
      const ps = Object.values(a.probabilities);
      if (ps.length) confs[id] = Math.max(...ps);
    }
    if (typeof a.probability === 'number') {
      probs[id] = a.probability;
      confs[id] ??= Math.max(a.probability, 1 - a.probability);
    } else if (typeof a.score === 'number') {
      const levels = SCORE_LEVELS[id] ?? 1;
      probs[id] = levels > 1 ? a.score / (levels - 1) : a.score;
    }
  }
  return { probs, confs };
}

export const jevJudge: JudgeModel = async ({ text }) => {
  const { experimental_decide } = await import('ai');
  const r = await experimental_decide({
    model: process.env.JUDGE_MODEL ?? 'typesafe-ai/jev',
    state: text,
    questions: textDecideQuestions(),
  });
  const answers = r.answers as unknown as DecideAnswers;
  const { probs, confs } = answersToProbMap(answers);
  return {
    probs,
    confs,
    inputTokens: (r as { usage?: { inputTokens?: number } }).usage?.inputTokens,
    value: answers.T2p?.choice ?? null,
  };
};

const MAX_PHOTOS = 4;
const MAX_DOWNLOAD_BYTES = 16_000_000; // Jev's per-image cap; we re-encode smaller
const JEV_MAX_SIDE = 1568; // Jev rejects any side outside 280..1568 and never resizes

interface FilePart {
  type: 'file';
  mediaType: string;
  data: Uint8Array;
}

async function fetchPhoto(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > MAX_DOWNLOAD_BYTES) return null;
    const data = Buffer.from(await res.arrayBuffer());
    return data.length > MAX_DOWNLOAD_BYTES ? null : data;
  } catch {
    return null; // unreachable photo — the gate records it as 'decode'
  }
}

// Gate-passed bytes → JPEG Jev accepts: upright, long side ≤ 1568.
// Short side ≥ 280 is already guaranteed by the gate's resolution check.
async function toJevPart(bytes: Buffer): Promise<FilePart> {
  const { default: sharp } = await import('sharp');
  const data = await sharp(bytes)
    .autoOrient()
    .resize(JEV_MAX_SIDE, JEV_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { type: 'file', mediaType: 'image/jpeg', data: new Uint8Array(data) };
}

// Fetch + gate every photo; keep only the ones that pass.
export async function gatePhotos(
  urls: string[],
): Promise<{ gate: PhotoGateEntry[]; parts: FilePart[] }> {
  const { photoGate } = await import('./photoGate.ts'); // lazy: sharp only when photos run
  const gate: PhotoGateEntry[] = [];
  const parts: FilePart[] = [];
  await Promise.all(
    urls.slice(0, MAX_PHOTOS).map(async (url, i) => {
      const bytes = await fetchPhoto(url);
      const g = await photoGate(bytes ?? Buffer.alloc(0));
      gate[i] = { url, ...g };
      if (g.pass && bytes) parts[i] = await toJevPart(bytes);
    }),
  );
  return { gate, parts: parts.filter(Boolean) };
}

export const eyeJudge = async (call: JudgeCall): Promise<EyeResult> => {
  const model = process.env.JUDGE_VISION_MODEL ?? 'typesafe-ai/jev-1.14.0';
  const { gate, parts } = await gatePhotos(call.images);

  // No usable photo → T2v = insufficient_evidence without a Jev call.
  // Stage-1 answers carry over; insufficient evidence can never confirm.
  if (!parts.length) {
    return {
      probs: { ...call.baseProbs, T2v: T2V_TO_PROB.insufficient_evidence },
      confs: {},
      identity: null,
      value: null,
      model: 'photo-gate',
      gate,
      skipped: true,
    };
  }

  const { experimental_decide } = await import('ai');
  const r = await experimental_decide({
    model,
    state: [{ type: 'text' as const, text: call.text }, ...parts],
    questions: eyeDecideQuestions(),
  });
  const answers = r.answers as unknown as DecideAnswers;
  const { probs, confs } = answersToProbMap(answers);
  const t2v = answers.T2v?.choice;
  if (t2v) probs.T2v = T2V_TO_PROB[t2v] ?? 0.4;
  return {
    probs, confs, model, gate, skipped: false,
    identity: answers.T2i?.choice ?? null,
    value: answers.T2p?.choice ?? null,
    inputTokens: (r as { usage?: { inputTokens?: number } }).usage?.inputTokens,
  };
};

// Insufficient photo evidence blocks push (it never counts as
// confirmation). Call on each stage-2 judgment after the T2v veto.
export function capUnconfirmed<J extends { verdict: string; vetoedBy?: string }>(
  j: J,
  t2v: number | undefined,
): J {
  if (j.verdict === 'PUSH' && (t2v === undefined || t2v < T2V_TO_PROB.confirms)) {
    j.verdict = 'DIGEST';
    j.vetoedBy = 'T2v-unconfirmed';
  }
  return j;
}

// env-gated selection — same pattern as the sponsor integrations.
export const pickJudge = (): JudgeModel =>
  process.env.AI_GATEWAY_API_KEY ? jevJudge : mockJudge;

export const pickEye = (): typeof eyeJudge | undefined =>
  process.env.AI_GATEWAY_API_KEY ? eyeJudge : undefined;
