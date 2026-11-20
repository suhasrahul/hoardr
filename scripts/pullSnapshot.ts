import { writeFileSync, mkdirSync } from 'node:fs';
import { fetchTownPosts } from '../lib/ingest/adapter.ts';
import { normalize } from '../lib/ingest/normalize.ts';

// Pull a real listing corpus from Freecycle towns → data/corpus/{town}.json
// This is the stage fallback: the counter number stays real if Wi-Fi dies.

const TOWNS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'SanFrancisco',
      'OaklandCA',
      'BerkeleyCA',
      'AlamedaCA',
      'RichmondCA',
      'SanRafaelCA',
      'EmeryvilleCA',
      'SanBrunoCA',
      'SouthBaySF',
    ];

mkdirSync('data/corpus', { recursive: true });

let total = 0;
for (const town of TOWNS) {
  try {
    const posts = await fetchTownPosts(town);
    const listings = posts.map((p) => normalize(p, town));
    writeFileSync(`data/corpus/${town}.json`, JSON.stringify(listings, null, 2));
    total += listings.length;
    console.log(`${town}: ${listings.length} posts`);
  } catch (e) {
    console.warn(`${town}: FAILED — ${(e as Error).message}`);
  }
}
console.log(`total: ${total} posts in data/corpus/`);
