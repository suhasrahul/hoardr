// Cognee Cloud REST client — taste memory. Plain fetch, no SDK (native
// bindings wouldn't deploy to Vercel cleanly). Endpoints verified
// against docs.cognee.ai/cognee-cloud/http-api.md — all under /api/v1,
// auth = X-Api-Key + X-Tenant-Id. Every call has a timeout and callers
// treat failure as "no memory" — Cognee must never stall the scan lane.

export const cogneeOn = (): boolean =>
  !!(process.env.COGNEE_URL && process.env.COGNEE_TENANT_ID && process.env.COGNEE_API_KEY);

const headers = () => ({
  'X-Api-Key': process.env.COGNEE_API_KEY!,
  'X-Tenant-Id': process.env.COGNEE_TENANT_ID!,
});

const DATASET = 'hoardr_taste';
const TIMEOUT_MS = 5000;

// Ingest + graph-build in one call (multipart: datasetName + a .txt file
// in the `data` field — raw_data is accepted but doesn't land in the
// dataset; verified live). The graph build is async ("status":"running"),
// so a search right after remember can legitimately come back empty.
// Text describes one swipe/tap so the graph learns positive AND
// negative taste, e.g. "user INSPECTED but passed on: rusty patio set".
export async function remember(text: string): Promise<boolean> {
  if (!cogneeOn()) return false;
  try {
    const fd = new FormData();
    fd.append('datasetName', DATASET);
    fd.append('data', new Blob([text], { type: 'text/plain' }), `tap-${Date.now()}.txt`);
    const res = await fetch(`${process.env.COGNEE_URL}/api/v1/remember`, {
      method: 'POST',
      headers: headers(), // no content-type — fetch sets the multipart boundary
      body: fd,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) console.error(`cognee remember ${res.status}: ${(await res.text()).slice(0, 160)}`);
    return res.ok;
  } catch (e) {
    console.error('cognee remember failed:', (e as Error).message);
    return false;
  }
}

// Recall the learned taste profile. The endpoint's personalized ranking
// already steers toward what the user rated well. We ask for a
// comma-separated themes list and split it locally.
export async function recallTaste(): Promise<string[] | null> {
  if (!cogneeOn()) return null;
  try {
    // /api/v1/search (not /recall — recall only queries default_dataset;
    // search takes an explicit datasets list). Verified live.
    const res = await fetch(`${process.env.COGNEE_URL}/api/v1/search`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query:
          'List the item categories, styles, brands, and materials this user keeps or inspects on a free-stuff app, comma-separated. If you do not know yet, say UNKNOWN.',
        search_type: 'GRAPH_COMPLETION',
        datasets: [DATASET],
      }),
      signal: AbortSignal.timeout(15000), // once per run — graph + LLM latency is OK here
    });
    if (!res.ok) {
      // 404/422 = no searchable memory yet (graph still building or empty)
      if (res.status !== 404 && res.status !== 422)
        console.error(`cognee search ${res.status}`);
      return null;
    }
    // Real response shape (verified live): an ARRAY of per-dataset
    // results, each {dataset_id, dataset_name, search_result: string[]}.
    // Flatten search_result; treat "no answer" replies as no-memory.
    const data = (await res.json()) as unknown;
    const texts = Array.isArray(data)
      ? data.flatMap((d) => (Array.isArray(d?.search_result) ? d.search_result : []))
      : [((data as { answer?: unknown })?.answer as string) ?? null].filter(Boolean);
    const answer = (texts as string[]).join(', ');
    if (!answer || /could not find|do not know|UNKNOWN/i.test(answer)) return null;
    const themes = answer
      .split(/[,;\n]/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 2 && t.length < 60);
    return themes.length ? themes.slice(0, 12) : null;
  } catch (e) {
    console.error('cognee recall failed:', (e as Error).message);
    return null;
  }
}
