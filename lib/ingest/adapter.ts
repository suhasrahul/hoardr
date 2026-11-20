// Freecycle adapter — fetches /town/{name} and extracts the fc-data blob.
// fc-data is an undocumented contract; parseFcData throws on drift (schema canary).

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

export interface RawPost {
  id: number;
  userId?: number;
  subject: string;
  description?: string;
  location?: string;
  date: string;
  time: string;
  type: { typeId: number; const: string; name: string };
  image?: string;
  images?: string[];
  thumbs?: string[];
  isApproved?: boolean;
}

export function parseFcData(html: string): RawPost[] {
  const m = html.match(/<fc-data :data="([^"]+)"/);
  if (!m) throw new Error('schema canary: fc-data blob not found in page');
  const json = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  const d = JSON.parse(json);
  if (!Array.isArray(d.posts))
    throw new Error('schema canary: fc-data.posts missing or not an array');
  return d.posts;
}

export async function fetchTownPosts(town: string): Promise<RawPost[]> {
  const res = await fetch(`https://www.freecycle.org/town/${town}`, {
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`freecycle /town/${town}: HTTP ${res.status}`);
  return parseFcData(await res.text());
}
