import singlestore from 'singlestore-nodejs/promise';
import type { LedgerRow, LedgerStore } from '../judge/ledger.ts';
import type { Judgment } from '../judge/score.ts';

// SingleStore backend — ledger + price_reference. Shared lazy connection
// per process; if the env creds are wrong the store marks itself dead
// and calls become logged no-ops (same tolerance as the Vercel
// read-only-FS path — a store outage must never stall the scan lane).

type Conn = Awaited<ReturnType<typeof singlestore.createConnection>>;

let connPromise: Promise<Conn> | null = null;
let dead = false;

async function getConn(): Promise<Conn | null> {
  if (dead) return null;
  connPromise ??= singlestore
    .createConnection({
      host: process.env.SINGLESTORE_HOST,
      port: Number(process.env.SINGLESTORE_PORT ?? 3306),
      user: process.env.SINGLESTORE_USER,
      password: process.env.SINGLESTORE_PASSWORD,
      database: process.env.SINGLESTORE_DB,
      ssl: {},
    })
    .then(async (c) => {
      // ROWSTORE: tiny tables (receipts + a 15-row price lookup) — no
      // need for columnstore; keeps plain PRIMARY KEYs valid on VARCHARs.
      await c.execute(`CREATE ROWSTORE TABLE IF NOT EXISTS judgments (
        listing_id VARCHAR(96), \`prior\` VARCHAR(16), stage VARCHAR(16) DEFAULT 'filter',
        score DOUBLE, verdict VARCHAR(16),
        vetoed_by VARCHAR(32), probs TEXT, judged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (listing_id, \`prior\`, stage)
      )`);
      await c.execute(`CREATE ROWSTORE TABLE IF NOT EXISTS price_reference (
        brand VARCHAR(64), product VARCHAR(64), model VARCHAR(64),
        typical_new_price DOUBLE, source_url TEXT, checked_date VARCHAR(24),
        PRIMARY KEY (brand, product)
      )`);
      return c;
    })
    .catch((e) => {
      dead = true;
      console.error('singlestore connect failed — store disabled:', (e as Error).message);
      throw e;
    });
  return connPromise.catch(() => null);
}

export class SingleStoreLedger implements LedgerStore {
  async record(listingId: string, j: Judgment, stage = 'filter'): Promise<void> {
    const c = await getConn();
    if (!c) return;
    await c.execute(
      `INSERT INTO judgments
       (listing_id, \`prior\`, stage, score, verdict, vetoed_by, probs)
       VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
       score=VALUES(score), verdict=VALUES(verdict),
       vetoed_by=VALUES(vetoed_by), probs=VALUES(probs)`,
      [listingId, j.prior, stage, j.score, j.verdict, j.vetoedBy ?? null, JSON.stringify(j.probs)],
    );
  }

  async forListing(listingId: string): Promise<LedgerRow[]> {
    const c = await getConn();
    if (!c) return [];
    const [rows] = await c.execute('SELECT * FROM judgments WHERE listing_id = ?', [listingId]);
    return rows as LedgerRow[];
  }

  async counts(): Promise<Record<string, number>> {
    const c = await getConn();
    if (!c) return {};
    const [rows] = await c.execute(
      "SELECT verdict, COUNT(*) c FROM judgments WHERE `prior`='strict' AND stage='filter' GROUP BY verdict",
    );
    return Object.fromEntries(
      (rows as { verdict: string; c: number }[]).map((r) => [r.verdict, r.c]),
    );
  }

  async contested(): Promise<LedgerRow[]> {
    const c = await getConn();
    if (!c) return [];
    const [rows] = await c.execute(
      `SELECT a.* FROM judgments a JOIN judgments b
       ON a.listing_id=b.listing_id AND a.stage=b.stage
       AND a.\`prior\`='strict' AND b.\`prior\`='lenient'
       AND a.stage='filter'
       AND a.verdict != b.verdict ORDER BY a.score DESC`,
    );
    return rows as LedgerRow[];
  }

  // Shared connection stays open for the process — closing per ledger
  // instance would kill the pool every other listing uses.
  async close(): Promise<void> {}
}

export interface PriceRef {
  product: string;
  brand: string;
  typical_new_price: number;
  source_url: string;
}

// "usually ~$X new" — keyword-match seeded brands/products against the
// listing text (identity is a class, not a name — decide can't emit
// free text, so we match what we seeded).
let priceRows: PriceRef[] | null = null; // tiny table — cache per process

export async function lookupPrice(text: string): Promise<PriceRef | null> {
  const c = await getConn();
  if (!c) return null;
  if (!priceRows) {
    const [rows] = await c.execute(
      'SELECT product, brand, typical_new_price, source_url FROM price_reference',
    );
    priceRows = rows as PriceRef[];
  }
  const hay = text.toLowerCase();
  // A product row only scores when its product string hits (brand adds a
  // bonus — "KitchenAid BBQ" is not a $449 stand mixer). Product-less
  // rows match on brand alone ("IKEA" → the generic IKEA row). Ties
  // resolve cheaper — "usually ~$X new" stays conservative.
  let best: (PriceRef & { _s: number }) | null = null;
  for (const r of priceRows) {
    const s = !r.product
      ? r.brand && hay.includes(r.brand.toLowerCase()) ? 1 : 0
      : hay.includes(r.product.toLowerCase())
        ? 2 + (r.brand && hay.includes(r.brand.toLowerCase()) ? 1 : 0)
        : 0;
    if (!s) continue;
    if (!best || s > best._s || (s === best._s && r.typical_new_price < best.typical_new_price))
      best = { ...r, _s: s };
  }
  return best
    ? { product: best.product, brand: best.brand, typical_new_price: best.typical_new_price, source_url: best.source_url }
    : null;
}

// End the shared conn — CLI runs (pipeline) must exit; Next.js steps can
// leave it open since the process outlives the run.
export async function closeS2(): Promise<void> {
  if (!connPromise) return;
  const c = await connPromise.catch(() => null);
  connPromise = null;
  if (c) await c.end();
}
