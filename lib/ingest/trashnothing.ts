import type { Listing, Status } from './normalize.ts';

// Trash Nothing live source — official REST API (api_key query param).
// Spec: trashnothing.com/api/v1.4/trashnothing-openapi.yaml
// Key auth requires latitude/longitude/radius; defaults center Oakland.
// Env: TRASHNOTHING_API_KEY (+ optional TN_LAT/TN_LNG/TN_RADIUS_M).

interface TnPhoto {
  url?: string;
  images?: { url: string; width: number; height: number }[];
}

interface TnPost {
  post_id: string | number;
  title?: string;
  content?: string;
  date?: string; // UTC ISO
  type?: string; // offer | wanted | admin
  outcome?: string | null; // satisfied | withdrawn | null
  url?: string;
  photos?: TnPhoto[] | null;
}

const toStatus = (p: TnPost): Status => {
  if (p.outcome === 'satisfied' || p.outcome === 'withdrawn') return 'TAKEN';
  if (p.type === 'offer') return 'OFFER';
  if (p.type === 'wanted') return 'WANTED';
  return 'OTHER';
};

// TN titles carry the area in parens: "Microwave Oven (Greenfield)"
const hoodOf = (title: string): string => {
  const m = title.match(/\(([^)]+)\)\s*$/);
  return m ? m[1].trim() : '';
};

function toListing(p: TnPost): Listing {
  const title = (p.title ?? '').trim();
  const images = (p.photos ?? [])
    .map((ph) => ph.images?.at(-1)?.url ?? ph.url)
    .filter((u): u is string => !!u);
  return {
    id: `tn:${p.post_id}`,
    source: 'trashnothing',
    title,
    body: (p.content ?? '').trim(),
    images,
    hood: hoodOf(title),
    town: 'live',
    postedAt: p.date ?? '',
    status: toStatus(p),
    url: p.url ?? `https://trashnothing.com/post/${p.post_id}`,
  };
}

export async function fetchTnPosts(limit = 60): Promise<Listing[]> {
  const key = process.env.TRASHNOTHING_API_KEY;
  if (!key) return [];
  const u = new URL('https://trashnothing.com/api/v1.4/posts');
  u.search = new URLSearchParams({
    api_key: key,
    types: 'offer',
    sources: 'trashnothing,open_archive_groups',
    latitude: process.env.TN_LAT ?? '37.8044',
    longitude: process.env.TN_LNG ?? '-122.2711',
    radius: process.env.TN_RADIUS_M ?? '30000',
    per_page: String(Math.min(limit, 100)),
    sort_by: 'date',
    device_pixel_ratio: '2',
  }).toString();
  const res = await fetch(u, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`trashnothing /posts: HTTP ${res.status}`);
  const data = (await res.json()) as { posts?: TnPost[] };
  return (data.posts ?? []).map(toListing);
}
