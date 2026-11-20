import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Judgment } from './score.ts';

// Decisions ledger — every judgment, both priors, per-question probs.
// This is the receipt's data source and the calibration corpus.
// Backends: SQLite (default) or SingleStore when SINGLESTORE_* is set —
// see lib/store/singlestore.ts. pickLedger() mirrors pickJudge().

export interface LedgerRow {
  listing_id: string;
  prior: string;
  stage: string; // 'filter' (jev stage 1) | 'eye' (vision stage 2)
  score: number;
  verdict: string;
  vetoed_by: string | null;
  probs: string; // JSON ProbMap
  judged_at: string;
}

export interface LedgerStore {
  record(listingId: string, j: Judgment, stage?: string): Promise<void>;
  forListing(listingId: string): Promise<LedgerRow[]>;
  counts(): Promise<Record<string, number>>;
  contested(): Promise<LedgerRow[]>;
  close(): Promise<void>;
}

export class SqliteLedger implements LedgerStore {
  private db: DatabaseSync;

  constructor(path = 'data/ledger.db') {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS judgments (
      listing_id TEXT, prior TEXT, stage TEXT DEFAULT 'filter',
      score REAL, verdict TEXT,
      vetoed_by TEXT, probs TEXT, judged_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (listing_id, prior, stage)
    )`);
  }

  async record(listingId: string, j: Judgment, stage = 'filter'): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO judgments
         (listing_id, prior, stage, score, verdict, vetoed_by, probs)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .run(listingId, j.prior, stage, j.score, j.verdict, j.vetoedBy ?? null, JSON.stringify(j.probs));
  }

  async forListing(listingId: string): Promise<LedgerRow[]> {
    return this.db
      .prepare('SELECT * FROM judgments WHERE listing_id = ?')
      .all(listingId) as unknown as LedgerRow[];
  }

  async counts(): Promise<Record<string, number>> {
    const rows = this.db
      .prepare("SELECT verdict, COUNT(*) c FROM judgments WHERE prior='strict' AND stage='filter' GROUP BY verdict")
      .all() as { verdict: string; c: number }[];
    return Object.fromEntries(rows.map((r) => [r.verdict, r.c]));
  }

  async contested(): Promise<LedgerRow[]> {
    return this.db
      .prepare(
        `SELECT a.* FROM judgments a JOIN judgments b
         ON a.listing_id=b.listing_id AND a.stage=b.stage
         AND a.prior='strict' AND b.prior='lenient'
         AND a.stage='filter'
         AND a.verdict != b.verdict ORDER BY a.score DESC`,
      )
      .all() as unknown as LedgerRow[];
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export const pickLedger = async (): Promise<LedgerStore> => {
  if (process.env.SINGLESTORE_HOST) {
    // lazy so singlestore-nodejs only loads when configured
    const { SingleStoreLedger } = await import('../store/singlestore.ts');
    return new SingleStoreLedger();
  }
  return new SqliteLedger();
};
