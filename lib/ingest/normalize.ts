import type { RawPost } from './adapter.ts';

export type Status = 'OFFER' | 'WANTED' | 'TAKEN' | 'OTHER';

export interface Listing {
  id: string; // `fc:${postId}` | `tn:${postId}`
  source: 'freecycle' | 'trashnothing';
  title: string;
  body: string;
  images: string[];
  hood: string;
  town: string;
  postedAt: string; // ISO
  status: Status;
  url: string;
}

function statusOf(p: RawPost): Status {
  switch (p.type?.name) {
    case 'OFFER':
      return 'OFFER';
    case 'WANTED':
      return 'WANTED';
    case 'TAKEN':
      return 'TAKEN';
    default:
      return 'OTHER';
  }
}

export function normalize(p: RawPost, town: string): Listing {
  return {
    id: `fc:${p.id}`,
    source: 'freecycle',
    title: (p.subject ?? '').trim(),
    body: (p.description ?? '').trim(),
    images: p.images?.length ? p.images : p.image ? [p.image] : [],
    hood: (p.location ?? '').trim(),
    town,
    postedAt: `${p.date}T${p.time}`, // PT naive — fine for recency sort
    status: statusOf(p),
    url: `https://www.freecycle.org/posts/${p.id}`,
  };
}
