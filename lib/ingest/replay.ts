import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Listing } from './normalize.ts';

// Streams a saved corpus through the pipeline at demo pace (~2-3s/item).
// Swap `onItem` for the real judge → score → UI path once wired.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function* streamCorpus(
  dir = 'data/corpus',
  delayMs = 2500,
): AsyncGenerator<Listing> {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const items: Listing[] = files.flatMap((f) =>
    JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')),
  );
  // newest-first, like the real feed
  items.sort((a, b) => b.postedAt.localeCompare(a.postedAt));
  for (const item of items) {
    await sleep(delayMs);
    yield item;
  }
}

const isMain =
  !!process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  let n = 0;
  for await (const l of streamCorpus(process.argv[2] ?? 'data/corpus', 1500)) {
    n++;
    console.log(`[${n}] ${l.status.padEnd(6)} ${l.title} — ${l.hood}`);
  }
}
