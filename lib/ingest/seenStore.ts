import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Listing } from './normalize.ts';

// Dedupe store — tracks listing ids already pushed through the pipeline.
export class SeenStore {
  private db: DatabaseSync;

  constructor(path = 'data/seen.db') {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS seen (id TEXT PRIMARY KEY, first_seen TEXT DEFAULT CURRENT_TIMESTAMP)',
    );
  }

  allIds(): Set<string> {
    const rows = this.db.prepare('SELECT id FROM seen').all() as { id: string }[];
    return new Set(rows.map((r) => r.id));
  }

  isNew(id: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM seen WHERE id = ?')
      .get(id);
    return row === undefined;
  }

  mark(id: string): void {
    this.db.prepare('INSERT OR IGNORE INTO seen (id) VALUES (?)').run(id);
  }

  filterNew<T extends { id: string }>(listings: T[]): T[] {
    const fresh = listings.filter((l) => this.isNew(l.id));
    for (const l of fresh) this.mark(l.id);
    return fresh;
  }

  close(): void {
    this.db.close();
  }
}

// Listing content store — receipts and stage-2 re-judges read
// title/body/images by id without re-fetching the source.
export class ListingStore {
  private db: DatabaseSync;

  constructor(path = 'data/seen.db') {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY, source TEXT, title TEXT, body TEXT,
      images TEXT, hood TEXT, town TEXT, posted_at TEXT,
      status TEXT, url TEXT
    )`);
  }

  save(l: Listing): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO listings
         (id, source, title, body, images, hood, town, posted_at, status, url)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(l.id, l.source, l.title, l.body, JSON.stringify(l.images),
        l.hood, l.town, l.postedAt, l.status, l.url);
  }

  get(id: string): Listing | null {
    const r = this.db
      .prepare('SELECT * FROM listings WHERE id = ?')
      .get(id) as Record<string, string> | undefined;
    if (!r) return null;
    return {
      id: r.id,
      source: r.source as Listing['source'],
      title: r.title,
      body: r.body,
      images: JSON.parse(r.images ?? '[]'),
      hood: r.hood,
      town: r.town,
      postedAt: r.posted_at,
      status: r.status as Listing['status'],
      url: r.url,
    };
  }

  close(): void {
    this.db.close();
  }
}
