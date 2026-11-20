// Photo quality gate — runs before photos reach the Jev vision pass.
// A photo that is blurry, badly exposed, or too small can't confirm
// anything; a failing gate maps to T2v = insufficient_evidence, never to
// "confirms". Thresholds are versioned so every receipt records the exact
// rules it was judged under.

import sharp from 'sharp';

export const PHOTO_GATE_RULES = {
  version: 'photo-gate-v0.1',
  // TODO-calibrate: Laplacian variance on the ≤512px grayscale image.
  // Below this the photo is too blurry to show condition.
  minBlurVariance: 100,
  // TODO-calibrate: max % of pixels ≤ darkLevel (crushed shadows).
  maxDarkClipPct: 40,
  // TODO-calibrate: max % of pixels ≥ brightLevel (blown highlights).
  maxBrightClipPct: 40,
  darkLevel: 5,
  brightLevel: 250,
  // TODO-calibrate: short side of the ORIGINAL image, px. 280 is Jev's
  // hard per-side minimum for image input.
  minShortSide: 280,
  // analysis size — speed only, not a quality rule
  analysisLongSide: 512,
} as const;

export type PhotoGateCheck = 'decode' | 'blur' | 'dark' | 'bright' | 'resolution';

export interface PhotoGateMeasurements {
  blurVariance: number;
  darkClipPct: number;
  brightClipPct: number;
  width: number;
  height: number;
}

export interface PhotoGateResult {
  pass: boolean;
  failedChecks: PhotoGateCheck[];
  measurements: PhotoGateMeasurements;
  rulesVersion: string;
}

// T2v choices — must match the T2v question in lib/judge/battery.ts.
export type T2vChoice = 'confirms' | 'contradicts' | 'insufficient_evidence';

// A failed gate forces insufficient_evidence. A passing gate forces
// nothing (null) — the vision model decides T2v.
export function gateToT2v(result: PhotoGateResult): T2vChoice | null {
  return result.pass ? null : 'insufficient_evidence';
}

// 3×3 Laplacian [0 1 0; 1 -4 1; 0 1 0] over interior pixels, then variance.
function laplacianVariance(px: Uint8Array, w: number, h: number): number {
  if (w < 3 || h < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      const v = px[i - w] + px[i + w] + px[i - 1] + px[i + 1] - 4 * px[i];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export async function photoGate(bytes: Buffer): Promise<PhotoGateResult> {
  const R = PHOTO_GATE_RULES;
  try {
    // autoOrient so width/height match how the photo is actually viewed
    const img = sharp(bytes, { failOn: 'error' }).autoOrient();
    const meta = await img.metadata();
    const swap = (meta.orientation ?? 1) >= 5;
    const width = (swap ? meta.height : meta.width) ?? 0;
    const height = (swap ? meta.width : meta.height) ?? 0;

    const { data, info } = await img
      .grayscale()
      .resize(R.analysisLongSide, R.analysisLongSide, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const px = new Uint8Array(data.buffer, data.byteOffset, data.length);
    let dark = 0;
    let bright = 0;
    for (const v of px) {
      if (v <= R.darkLevel) dark++;
      else if (v >= R.brightLevel) bright++;
    }

    const measurements: PhotoGateMeasurements = {
      blurVariance: round(laplacianVariance(px, info.width, info.height)),
      darkClipPct: round((dark / px.length) * 100),
      brightClipPct: round((bright / px.length) * 100),
      width,
      height,
    };

    const failedChecks: PhotoGateCheck[] = [];
    if (measurements.blurVariance < R.minBlurVariance) failedChecks.push('blur');
    if (measurements.darkClipPct > R.maxDarkClipPct) failedChecks.push('dark');
    if (measurements.brightClipPct > R.maxBrightClipPct) failedChecks.push('bright');
    if (Math.min(width, height) < R.minShortSide) failedChecks.push('resolution');

    return { pass: failedChecks.length === 0, failedChecks, measurements, rulesVersion: R.version };
  } catch {
    // unreadable bytes are not evidence
    return {
      pass: false,
      failedChecks: ['decode'],
      measurements: { blurVariance: 0, darkClipPct: 0, brightClipPct: 0, width: 0, height: 0 },
      rulesVersion: R.version,
    };
  }
}
