import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Listing } from '../ingest/normalize.ts';
import { recallTaste } from './cognee.ts';

// Taste profile — Cognee (COGNEE_* env) is the durable "your eye" from
// swipe history; wants.json is the local fallback that always works.

export interface Wants {
  wants: string[];
  vetoes: string[];
  maxPickupMiles: number;
  swipes: { id: string; liked: boolean }[];
}

export function loadWants(path = join(process.cwd(), 'data', 'wants.json')): Wants {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Record a user tap — keeps wants.json honest even before Cognee is
// configured. Read-only FS (Vercel) tolerated: swipes just don't persist.
export function appendSwipe(
  s: { id: string; signal: string; title: string },
  path = join(process.cwd(), 'data', 'wants.json'),
): void {
  try {
    const w = loadWants(path);
    w.swipes = [...(w.swipes ?? []), { id: s.id, liked: s.signal !== 'inspect' }].slice(-200);
    writeFileSync(path, JSON.stringify(w, null, 2));
  } catch {
    /* read-only FS — swipe not persisted, scan unaffected */
  }
}

// Per-run taste context — loaded ONCE per scan/pipeline run so Cognee
// recall isn't a per-listing network call.
export interface TasteCtx {
  wants: Wants;
  themes: string[] | null; // cognee-recalled taste themes, null = local only
}

export async function loadTaste(): Promise<TasteCtx> {
  const wants = loadWants();
  const themes = await recallTaste(); // null when COGNEE_* unset/fails/no graph
  return { wants, themes };
}

// T11 stand-in: keyword overlap of wants/vetoes vs listing text.
// Returns 0..1 — real matching replaces this later.
export function tasteMatch(l: Listing, w: Wants): number {
  const text = `${l.title} ${l.body}`.toLowerCase();
  if (w.vetoes.some((v) => text.includes(v))) return 0;
  const hits = w.wants.filter((want) =>
    want.toLowerCase().split(/\s+/).some((word) => word.length > 3 && text.includes(word)),
  ).length;
  return Math.min(0.3 + hits * 0.25, 1);
}

// T11 with Cognee: keyword wants + recalled themes. Themes vote like
// extra wants (same word-overlap rule); vetoes stay local and absolute —
// memory informs taste, it can never veto.
export function tasteScore(l: Listing, ctx: TasteCtx): number {
  const base = tasteMatch(l, ctx.wants);
  if (!ctx.themes?.length) return base;
  const text = `${l.title} ${l.body}`.toLowerCase();
  const hits = ctx.themes.filter((t) =>
    t.split(/\s+/).some((word) => word.length > 3 && text.includes(word)),
  ).length;
  return Math.min(base + hits * 0.15, 1);
}
