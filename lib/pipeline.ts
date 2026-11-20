import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { streamCorpus } from './ingest/replay.ts';
import { buildPrompt, runBattery } from './judge/battery.ts';
import { capUnconfirmed, mockJudge, pickEye, type JudgeModel, type PhotoGateEntry } from './judge/model.ts';
import { PRIORS } from './judge/priors.ts';
import { judge } from './judge/score.ts';
import { pickLedger } from './judge/ledger.ts';
import { ListingStore } from './ingest/seenStore.ts';
import { loadTaste, tasteScore } from './memory/taste.ts';
import type { Listing } from './ingest/normalize.ts';

// Full pipeline: corpus → battery → both priors → ledger.
// `onResult` is the UI hook (live lane narration, find cards).

export interface Result {
  listing: Listing;
  strict: ReturnType<typeof judge>;
  lenient: ReturnType<typeof judge>;
  eye?: {
    strict: ReturnType<typeof judge>;
    lenient: ReturnType<typeof judge>;
    identity: string | null;
    gate: PhotoGateEntry[];
  };
}

export async function run(
  model: JudgeModel = mockJudge,
  onResult?: (r: Result) => void,
  dir = 'data/corpus',
  delayMs = 0,
): Promise<{ scanned: number; pushed: number }> {
  const ledger = await pickLedger();
  const listings = new ListingStore();
  const taste = await loadTaste(); // once per run — not per listing
  const eye = pickEye(); // stage 2 — only exists when AI_GATEWAY_API_KEY set
  let scanned = 0;
  let pushed = 0;
  try {
    for await (const listing of streamCorpus(dir, delayMs)) {
      scanned++;
      listings.save(listing);
      const { probs } = await runBattery(listing, model);
      probs.T11 = tasteScore(listing, taste); // taste is ours, not the model's
      const strict = judge(listing, probs, PRIORS[0]);
      const lenient = judge(listing, probs, PRIORS[1]);
      await ledger.record(listing.id, strict);
      await ledger.record(listing.id, lenient);

      // stage 2 — Jev vision re-judge. Only photo-bearing listings that
      // either push or split the priors; photo contradiction hard-blocks.
      let eyeOut: Result['eye'];
      if (
        eye &&
        listing.images.length &&
        (strict.verdict === 'PUSH' || strict.verdict !== lenient.verdict)
      ) {
        try {
          const r = await eye({
            prompt: buildPrompt(listing),
            images: listing.images,
            text: `${listing.title}\n${listing.body}`,
            baseProbs: probs,
          });
          r.probs.T11 = probs.T11; // local taste carries over — same rules
          const eStrict = judge(listing, r.probs, PRIORS[0]);
          const eLenient = judge(listing, r.probs, PRIORS[1]);
          if (r.probs.T2v !== undefined && r.probs.T2v <= 0.1) {
            eStrict.verdict = 'REJECT';
            eStrict.vetoedBy = 'T2v';
            eLenient.verdict = 'REJECT';
            eLenient.vetoedBy = 'T2v';
          }
          capUnconfirmed(eStrict, r.probs.T2v);
          capUnconfirmed(eLenient, r.probs.T2v);
          await ledger.record(listing.id, eStrict, 'eye');
          await ledger.record(listing.id, eLenient, 'eye');
          eyeOut = { strict: eStrict, lenient: eLenient, identity: r.identity, gate: r.gate };
        } catch (err) {
          console.error(`eye failed for ${listing.id}:`, (err as Error).message);
          // failed photo check = unverified, never a push
          if (strict.verdict === 'PUSH') strict.verdict = 'DIGEST';
        }
      }

      if ((eyeOut?.strict ?? strict).verdict === 'PUSH') pushed++;
      onResult?.({ listing, strict, lenient, eye: eyeOut });
    }
    const counts = await ledger.counts();
    console.log('\nledger:', counts, `| contested: ${(await ledger.contested()).length}`);
    return { scanned, pushed };
  } finally {
    await ledger.close();
    listings.close();
    if (process.env.SINGLESTORE_HOST) {
      const { closeS2 } = await import('./store/singlestore.ts');
      await closeS2(); // CLI must exit — shared conn stays open otherwise
    }
  }
}

const isMain =
  !!process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const limit = Number(process.argv[2] ?? 765);
  let n = 0;
  await run(mockJudge, (r) => {
    if (++n > limit) return;
    const fin = r.eye?.strict ?? r.strict;
    const mark =
      fin.verdict === 'PUSH'
        ? 'KEEPER'
        : r.eye && r.eye.strict.verdict !== r.strict.verdict
          ? 'EYE↯'
          : r.strict.verdict !== r.lenient.verdict
            ? 'DEBATE?'
            : fin.verdict;
    console.log(
      `${mark.padEnd(7)} [${fin.score}] ${r.listing.title.slice(0, 55)} — ${r.listing.hood}`,
    );
  });
}
