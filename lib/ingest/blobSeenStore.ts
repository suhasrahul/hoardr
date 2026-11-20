import { list, put } from '@vercel/blob';

// Hosted dedupe — one tiny blob per judged listing id. Vercel's FS is
// read-only so SQLite can't persist there; this can. list() gives the
// whole seen set once per scan; put() marks each judged id.
export class BlobSeenStore {
  private prefix = 'seen/';

  async allIds(): Promise<Set<string>> {
    const ids = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: this.prefix, limit: 1000, cursor });
      for (const b of page.blobs) {
        ids.add(decodeURIComponent(b.pathname.slice(this.prefix.length)));
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return ids;
  }

  async mark(id: string): Promise<void> {
    await put(this.prefix + encodeURIComponent(id), '1', {
      access: 'private',
      allowOverwrite: true,
    });
  }
}
