// Two priors — same probabilities, different thresholds.
// Divergence between them IS the debate and the best calibration data.

export interface Prior {
  name: string; // 'strict' | 'lenient' | `level N`
  pushAt: number; // score >= pushAt → PUSH
  digestAt: number; // score >= digestAt → DIGEST, else REJECT
  vetoFloor: number; // 'low' veto questions must clear this
  vetoCeil: number; // 'high' veto questions must stay under this
}

export const STRICT: Prior = {
  name: 'strict',
  pushAt: 0.72,
  digestAt: 0.5,
  vetoFloor: 0.6,
  vetoCeil: 0.4,
};

export const LENIENT: Prior = {
  name: 'lenient',
  pushAt: 0.55,
  digestAt: 0.35,
  vetoFloor: 0.35,
  vetoCeil: 0.6,
};

export const PRIORS: Prior[] = [STRICT, LENIENT];

// User strictness dial (0–10): interpolates score thresholds between
// lenient and strict. Veto bands stay pinned at STRICT — the dial tunes
// taste, it can never talk the agent into scams, ISO posts, or hazards.
export function priorAt(s: number): Prior {
  const t = Math.max(0, Math.min(10, s)) / 10;
  const lerp = (a: number, b: number) => a + (b - a) * t;
  return {
    name: `level ${Math.round(s)}`,
    pushAt: lerp(LENIENT.pushAt, STRICT.pushAt),
    digestAt: lerp(LENIENT.digestAt, STRICT.digestAt),
    vetoFloor: STRICT.vetoFloor,
    vetoCeil: STRICT.vetoCeil,
  };
}
