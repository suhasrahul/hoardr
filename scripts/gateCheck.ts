// Calibration helper: run the photo gate on every image in a folder.
// Usage: node scripts/gateCheck.ts <folder>

import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { PHOTO_GATE_RULES, photoGate } from '../lib/judge/photoGate.ts';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/gateCheck.ts <folder>');
  process.exit(1);
}

const EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif', '.gif', '.tif', '.tiff']);
const files = readdirSync(dir)
  .filter((f) => EXTS.has(extname(f).toLowerCase()))
  .sort();

if (!files.length) {
  console.error(`no images found in ${dir}`);
  process.exit(1);
}

const R = PHOTO_GATE_RULES;
console.log(
  `${R.version} · blur ≥ ${R.minBlurVariance} · dark ≤ ${R.maxDarkClipPct}% · ` +
    `bright ≤ ${R.maxBrightClipPct}% · short side ≥ ${R.minShortSide}px\n`,
);

const rows = [];
for (const f of files) {
  const r = await photoGate(readFileSync(join(dir, f)));
  const m = r.measurements;
  rows.push({
    file: f,
    size: `${m.width}×${m.height}`,
    blurVar: m.blurVariance,
    'dark%': m.darkClipPct,
    'bright%': m.brightClipPct,
    result: r.pass ? 'PASS' : 'FAIL',
    failed: r.failedChecks.join(','),
  });
}
console.table(rows);
const passed = rows.filter((r) => r.result === 'PASS').length;
console.log(`${passed}/${rows.length} passed`);
