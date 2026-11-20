import { createHook, getWritable, getWorkflowMetadata, RetryableError, sleep } from "workflow";
import { readdirSync, readFileSync } from "node:fs";
import { runBattery, buildPrompt } from "../lib/judge/battery.ts";
import { capUnconfirmed, pickJudge, pickEye } from "../lib/judge/model.ts";
import { PRIORS, priorAt } from "../lib/judge/priors.ts";
import { judge } from "../lib/judge/score.ts";
import { pickLedger, type LedgerStore } from "../lib/judge/ledger.ts";
import { SeenStore } from "../lib/ingest/seenStore.ts";
import { BlobSeenStore } from "../lib/ingest/blobSeenStore.ts";
import { loadTaste, tasteScore, type TasteCtx } from "../lib/memory/taste.ts";
import { fetchTnPosts } from "../lib/ingest/trashnothing.ts";
import type { Listing } from "../lib/ingest/normalize.ts";

// Scan workflow — one durable run = the agent's shift.
// Every step is a recorded tool call (visible in `npx workflow web`);
// every stream write is a live event on the dashboard's scan lane.

type W = WritableStreamDefaultWriter<Uint8Array>;
const enc = new TextEncoder();
const emit = (w: W, ev: object) =>
  w.write(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));

// Dedupe: SQLite locally, Vercel Blob when the FS is read-only (the
// store is linked → BLOB_READ_WRITE_TOKEN is set up there). With
// neither, a random window gives repeat scans variety instead.
interface SeenSource {
  name: "sqlite" | "blob";
  allIds(): Promise<Set<string>>;
  mark(id: string): Promise<void>;
}

let seenSingleton: SeenSource | null | undefined;
function getSeen(): SeenSource | null {
  if (seenSingleton !== undefined) return seenSingleton;
  const blob = () => {
    const b = new BlobSeenStore();
    return { name: "blob" as const, allIds: () => b.allIds(), mark: (id: string) => b.mark(id) };
  };
  // On Vercel a traced data/seen.db opens but marks die with the
  // instance — blob must win there. Locally sqlite wins (dev runs may
  // not have BLOB_READ_WRITE_TOKEN at all).
  if (process.env.VERCEL) {
    seenSingleton = process.env.BLOB_READ_WRITE_TOKEN ? blob() : null;
    return seenSingleton;
  }
  try {
    const db = new SeenStore();
    seenSingleton = {
      name: "sqlite",
      allIds: async () => db.allIds(),
      mark: async (id) => db.mark(id),
    };
  } catch {
    seenSingleton = process.env.BLOB_READ_WRITE_TOKEN ? blob() : null;
  }
  return seenSingleton;
}

interface Pool {
  pool: Listing[];
  total: number;
  skipped: number;
  dedupe: boolean;
  source: string;
  feed: "corpus" | "live";
}

async function pickPool(dir: string, limit: number, live: boolean): Promise<Pool> {
  "use step";
  let feed: Pool["feed"] = "corpus";
  let items: Listing[] = [];
  if (live) {
    items = await fetchTnPosts(100).catch((e) => {
      console.error("trashnothing fetch failed:", e);
      return [];
    });
    if (items.length) feed = "live";
  }
  if (!items.length) {
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    items = files.flatMap((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")));
  }
  items.sort((a, b) => b.postedAt.localeCompare(a.postedAt));
  const seen = getSeen();
  const seenIds = seen ? await seen.allIds().catch((e) => {
    console.error(`seen allIds (${seen.name}) failed:`, e);
    return null;
  }) : null;
  const source = seenIds ? seen!.name : seen ? `${seen.name}_error` : "none";
  if (seenIds) {
    const fresh = items.filter((l) => !seenIds.has(l.id));
    if (fresh.length) {
      return { pool: fresh.slice(0, limit), total: items.length, skipped: items.length - fresh.length, dedupe: true, source, feed };
    }
  }
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  return { pool: shuffled.slice(0, limit), total: items.length, skipped: 0, dedupe: seenIds !== null, source, feed };
}

interface JudgeOut {
  verdict: string;
  flipped: boolean;
  score: number;
  vetoedBy?: string | null;
  probs: Record<string, number>;
  batteryMs: number; // 0 for stage-0 kills — no model call spent
  eyeMs: number;
  inputTokens: number; // battery + eye input tokens, 0 for stage-0 kills
  identity: string | null;
  value: string | null;
  price: { product: string; amount: number; sourceUrl: string } | null;
}

async function judgeListing(l: Listing, useEye: boolean, level: number, taste: TasteCtx): Promise<JudgeOut> {
  "use step";
  const w = getWritable<Uint8Array>().getWriter();
  const m = pickJudge();
  const mine = priorAt(level); // the user's bar — decision prior
  try {
    await emit(w, { type: "seen", id: l.id, title: l.title, hood: l.hood, status: l.status, images: l.images.slice(0, 4) });

    // Stage 0 — noise dies free, no model call. WANTED/TAKEN/no-photo
    // can never be treasure; the lane still gets the verdict theatrics.
    const kill = l.status === "WANTED" ? "wanted" : l.status === "TAKEN" ? "taken" : l.images.length === 0 ? "nopics" : null;
    if (kill) {
      try {
        await getSeen()?.mark(l.id);
      } catch (err) {
        console.error(`seen mark failed (${getSeen()?.name}):`, err);
      }
      const verdict = kill === "taken" ? "CLAIMED" : "REJECT";
      await emit(w, {
        type: "verdict", id: l.id, title: l.title, hood: l.hood, verdict, score: 0,
        probs: {}, vetoedBy: kill, bar: mine.pushAt, level, identity: null, flipped: false,
        images: [], url: l.url,
      });
      console.log(`[timing] ${l.id} stage0_kill=${kill} batteryMs=0`);
      return { verdict, flipped: false, score: 0, vetoedBy: kill, probs: {}, batteryMs: 0, eyeMs: 0, inputTokens: 0, identity: null, value: null, price: null };
    }

    const t0 = Date.now();
    const { probs, confs, inputTokens, value: textValue } = await runBattery(l, m);
    const batteryMs = Date.now() - t0;
    probs.T11 = tasteScore(l, taste);
    const strict = judge(l, probs, PRIORS[0]);
    const lenient = judge(l, probs, PRIORS[1]);
    const me = judge(l, probs, mine); // verdict that actually ships
    try {
      await getSeen()?.mark(l.id); // judged — skip on future scans
    } catch (err) {
      console.error(`seen mark failed (${getSeen()?.name}):`, err);
    }
    await emit(w, { type: "battery", id: l.id, probs, confs, inputTokens, strict: strict.verdict, lenient: lenient.verdict, mine: me.verdict, score: me.score, batteryMs });

    let ledger: LedgerStore | null = null;
    try {
      ledger = await pickLedger();
      await ledger.record(l.id, me);
      await ledger.record(l.id, strict);
      await ledger.record(l.id, lenient);
    } catch {
      ledger = null; // read-only FS / store down — skip persistence
    } finally {
      await ledger?.close();
    }

    let final = me;
    let flipped = false;
    let identity: string | null = null;
    let value: string | null = textValue ?? null; // text-pass estimate; the eye overrides it
    const price = null; // Jev T2p band is the estimate; no price lookup
    let eyeMs = 0;
    let eyeTokens = 0;
    // Eye triggers on provisional PUSH, on promise (a find or strong
    // brand signal worth verifying), or when Jev's own confidence on the
    // core treasure question (T3 condition) is spread thin. Bare near-bar
    // scores no longer qualify — verified on live data: every nearBar-only
    // eye call ended DIGEST anyway (~22% of eye spend saved, zero flips lost).
    const promise = (probs.T13 ?? 0) >= 0.5 || (probs.T6 ?? 0) >= 0.6;
    const lowConf = confs.T3 !== undefined && confs.T3 < 0.5;
    if (useEye && l.images.length && (me.verdict === "PUSH" || promise || lowConf)) {
      await emit(w, { type: "eye_start", id: l.id, images: l.images.slice(0, 4) });
      let r: Awaited<ReturnType<NonNullable<ReturnType<typeof pickEye>>>> | null = null;
      const t1 = Date.now();
      try {
        r = await pickEye()!({ prompt: buildPrompt(l), images: l.images, text: `${l.title}\n${l.body}`, baseProbs: probs });
      } catch (err) {
        // Docs: RetryableError honors retryAfter for 429/transients;
        // permanent errors (400 bad image etc.) degrade, don't kill the run.
        const status = (err as { statusCode?: number })?.statusCode ?? 0;
        const retryable = (err as { isRetryable?: boolean })?.isRetryable === true || status === 429 || status >= 500;
        if (retryable) {
          throw new RetryableError("eye call retryable failure", { retryAfter: "15s" });
        }
        await emit(w, { type: "eye_error", id: l.id, error: String(err).slice(0, 160) });
      }
      eyeMs = Date.now() - t1;
      if (r === null) {
        // Vision unverified — a provisional PUSH cannot alert.
        if (me.verdict === "PUSH") {
          me.verdict = "DIGEST";
          me.vetoedBy = "eye_failed";
        }
      } else {
      r.probs.T11 = probs.T11;
      const eMine = judge(l, r.probs, mine);
      const eStrict = judge(l, r.probs, PRIORS[0]);
      const eLenient = judge(l, r.probs, PRIORS[1]);
      if (r.probs.T2v !== undefined && r.probs.T2v <= 0.1) {
        eMine.verdict = "REJECT";
        eMine.vetoedBy = "T2v";
        eStrict.verdict = "REJECT";
        eStrict.vetoedBy = "T2v";
        eLenient.verdict = "REJECT";
        eLenient.vetoedBy = "T2v";
      }
      // insufficient photo evidence blocks push on every judgment
      capUnconfirmed(eMine, r.probs.T2v);
      capUnconfirmed(eStrict, r.probs.T2v);
      capUnconfirmed(eLenient, r.probs.T2v);
      let ledger2: LedgerStore | null = null;
      try {
        ledger2 = await pickLedger();
        await ledger2.record(l.id, eMine, "eye");
        await ledger2.record(l.id, eStrict, "eye");
        await ledger2.record(l.id, eLenient, "eye");
      } catch {
        ledger2 = null;
      } finally {
        await ledger2?.close();
      }
      flipped = eMine.verdict !== me.verdict;
      identity = r.identity;
      value = r.value ?? value; // photo-based estimate wins when the eye answered
      eyeTokens = r.inputTokens ?? 0;
      final = eMine;
      await emit(w, {
        type: "eye_result",
        id: l.id,
        verdict: eMine.verdict,
        identity,
        value,
        eyeMs,
        t2v: r.probs.T2v,
        confs: r.confs,
        inputTokens: r.inputTokens,
        flipped,
        images: l.images.slice(0, 4),
        gate: r.gate,
        gateSkipped: r.skipped,
      });
      }
    }

    await emit(w, {
      type: "verdict",
      id: l.id,
      title: l.title,
      hood: l.hood,
      verdict: final.verdict,
      score: final.score,
      probs: final.probs,
      vetoedBy: final.vetoedBy ?? null,
      bar: mine.pushAt,
      level,
      identity,
      value,
      price,
      flipped,
      batteryMs,
      eyeMs,
      images: l.images.slice(0, 4),
      url: l.url,
    });
    const totalTokens = (inputTokens ?? 0) + eyeTokens;
    console.log(`[timing] ${l.id} batteryMs=${batteryMs} eyeMs=${eyeMs} inputTokens=${totalTokens} verdict=${final.verdict} score=${final.score.toFixed(2)}`);
    return { verdict: final.verdict, flipped, score: final.score, vetoedBy: final.vetoedBy ?? null, probs: final.probs, batteryMs, eyeMs, inputTokens: totalTokens, identity, value, price };
  } finally {
    w.releaseLock();
  }
}

// Stream writes must happen inside steps — getWritable().getWriter() is
// ENOTSUP in the deterministic workflow VM.
async function emitEvent(ev: object): Promise<void> {
  "use step";
  const w = getWritable<Uint8Array>().getWriter();
  await emit(w, ev);
  w.releaseLock();
}

// ---------- round-2 chat: one durable conversation over the whole run ----------

interface RunStats {
  feed: "corpus" | "live";
  total: number;
  scanned: number;
  pushed: number;
  skipped: number;
  dedupe: boolean;
  source: string;
  useEye: boolean;
  level: number;
  bar: number;
  modelCalls: number;
  batteryCalls: number;
  stage0Kills: number;
  eyeCalls: number;
  flips: number;
  totalInputTokens: number;
  avgBatteryMs: number;
  avgEyeMs: number;
}

interface CardCtx {
  id: string;
  title: string;
  hood: string;
  status: string | null;
  url: string;
  verdict: string;
  score: number;
  vetoedBy: string | null;
  flipped: boolean;
  identity: string | null;
  value: string | null;
  price: { product: string; amount: number; sourceUrl: string } | null;
  probs: Record<string, number>;
  batteryMs: number;
  eyeMs: number;
  inputTokens: number;
  body: string;
  images: string[];
}

interface RunCtx {
  run: RunStats;
  cards: CardCtx[];
}

// Deeply frozen args are stored by reference across steps (~80 bytes per
// step input instead of the full blob — see foundations/serialization).
// buildRunContext must stay a step: a value frozen in workflow code but
// sharing nothing with a step output is written in full to each input.
const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
};

async function buildRunContext(entries: { l: Listing; r: JudgeOut }[], run: RunStats): Promise<RunCtx> {
  "use step";
  return deepFreeze({
    run,
    cards: entries.map(({ l, r }) => ({
      id: l.id,
      title: l.title,
      hood: l.hood,
      status: l.status,
      url: l.url,
      verdict: r.verdict,
      score: r.score,
      vetoedBy: r.vetoedBy ?? null,
      flipped: r.flipped,
      identity: r.identity,
      value: r.value,
      price: r.price,
      probs: r.probs,
      batteryMs: r.batteryMs,
      eyeMs: r.eyeMs,
      inputTokens: r.inputTokens,
      body: l.body.slice(0, 2000),
      images: l.images.slice(0, 4),
    })),
  });
}

const probStr = (probs: Record<string, number>) =>
  Object.entries(probs)
    .map(([k, v]) => `${k}=${v.toFixed(2)}`)
    .join(" ");

const receiptOf = (c: CardCtx) => ({
  id: c.id,
  title: c.title,
  hood: c.hood,
  status: c.status,
  url: c.url,
  verdict: c.verdict,
  score: c.score,
  vetoedBy: c.vetoedBy,
  flipped: c.flipped,
  identity: c.identity,
  value: c.value,
  price: c.price,
  probs: c.probs,
  timing: { batteryMs: c.batteryMs, eyeMs: c.eyeMs, inputTokens: c.inputTokens },
});

const digestLine = (c: CardCtx) =>
  `- ${c.id} "${c.title.slice(0, 60)}" [${c.hood}] → ${c.verdict} ${c.score.toFixed(2)}` +
  `${c.vetoedBy ? ` (veto: ${c.vetoedBy})` : ""}${c.flipped ? " (flipped by photos)" : ""}` +
  `${c.identity ? ` (eye: ${c.identity}${c.value ? `, ${c.value}` : ""})` : ""}`;

const offlineReceipt = (ctx: RunCtx, focus?: CardCtx) =>
  `offline receipt: judged ${ctx.run.scanned} of ${ctx.run.total} (${ctx.run.feed}), ` +
  `${ctx.run.pushed} kept, ${ctx.run.eyeCalls} photo checks, ${ctx.run.flips} flips` +
  (focus ? ` | "${focus.title}" verdict=${focus.verdict} score=${focus.score.toFixed(2)} ${probStr(focus.probs)}` : "");

// One turn of the raccoon chat: the whole run's context is the step
// argument; streamed deltas ride the same SSE lane as scan events.
async function runTurn(
  ctx: RunCtx,
  messages: import("ai").ModelMessage[],
  focusId: string | null,
): Promise<{ messages: import("ai").ModelMessage[]; text: string }> {
  "use step";
  const focus = focusId ? ctx.cards.find((c) => c.id === focusId) : undefined;
  if (!process.env.AI_GATEWAY_API_KEY) {
    const text = offlineReceipt(ctx, focus);
    return { messages: [{ role: "assistant", content: text }], text };
  }
  const { streamText, gateway, tool, stepCountIs } = await import("ai");
  const { z } = await import("zod");
  const w = getWritable<Uint8Array>().getWriter();
  try {
    // Model matches cards by id or a distinctive title fragment.
    const byId = (id: string) =>
      ctx.cards.find((c) => c.id === id) ??
      ctx.cards.find((c) => c.title.toLowerCase().includes(id.toLowerCase())) ??
      ctx.cards.find((c) => c.id.toLowerCase().includes(id.toLowerCase()));
    const idArg = z.string().describe("card id, or a distinctive fragment of its title");
    const tools = {
      getReceipt: tool({
        description: "Dig up the full judging receipt for one card: every battery probability, the verdict at the user's bar, vetoes, vision-stage identity/value, timings.",
        inputSchema: z.object({ id: idArg }),
        execute: async ({ id }) => {
          const c = byId(id);
          return c ? receiptOf(c) : { error: `no card matches "${id}"` };
        },
      }),
      getListingText: tool({
        description: "Re-read a card's full listing text — longer than the digest line.",
        inputSchema: z.object({ id: idArg }),
        execute: async ({ id }) => {
          const c = byId(id);
          return c ? { title: c.title, hood: c.hood, status: c.status, url: c.url, body: c.body } : { error: `no card matches "${id}"` };
        },
      }),
      compareCards: tool({
        description: "Two cards' receipts side by side — for 'why this one and not that one' questions.",
        inputSchema: z.object({ a: idArg, b: idArg }),
        execute: async ({ a, b }) => {
          const ca = byId(a);
          const cb = byId(b);
          return {
            a: ca ? receiptOf(ca) : { error: `no card matches "${a}"` },
            b: cb ? receiptOf(cb) : { error: `no card matches "${b}"` },
          };
        },
      }),
      lookAtPhotos: tool({
        description: "Squint at a card's actual photos. Use when the user asks about visible damage, stains, what's in the picture.",
        inputSchema: z.object({ id: idArg }),
        // Single-shape output — a union breaks tool() overload inference.
        execute: async ({ id }): Promise<{ title: string | null; photos: { mediaType: string; bytes: Uint8Array }[]; error: string | null }> => {
          const c = byId(id);
          if (!c) return { title: null, photos: [], error: `no card matches "${id}"` };
          if (!c.images.length) return { title: c.title, photos: [], error: `"${c.title}" has no photos` };
          const photos: { mediaType: string; bytes: Uint8Array }[] = [];
          for (const url of c.images.slice(0, 4)) {
            try {
              const res = await fetch(url);
              if (!res.ok) continue;
              photos.push({ mediaType: res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg", bytes: new Uint8Array(await res.arrayBuffer()) });
            } catch { /* one bad photo shouldn't sink the tool */ }
          }
          return { title: c.title, photos, error: photos.length ? null : `photos for "${c.title}" wouldn't load` };
        },
        toModelOutput: ({ output }) =>
          output.error
            ? { type: "text" as const, value: output.error }
            : {
                type: "content" as const,
                value: [
                  { type: "text" as const, text: `${output.photos.length} photo(s) of "${output.title}"` },
                  ...output.photos.map((p) => ({ type: "file" as const, mediaType: p.mediaType, data: { type: "data" as const, data: p.bytes } })),
                ],
              },
      }),
    };
    const r = ctx.run;
    const result = streamText({
      model: gateway(process.env.CHAT_MODEL ?? "openai/gpt-4o-mini"),
      system:
        "You are HOARDR — a raccoon who sorts strangers' free stuff all day so the user doesn't have to. Voice: scrappy, playful, a little feral. You dig, sniff, and hoard; junk \"smells off\", keepers are \"shiny\", near-misses \"almost came home\". Short punchy sentences, ~4 max unless the user asks for detail. Never sappy, never corporate. Examples of your register: \"Ooh — keeper!\", \"Smelled off, so I tossed it.\", \"Trust the nose — but it only reads receipts.\"\n" +
        "Ground every claim in the run data below or in tool results. If the receipts don't say, admit it in-character — never invent damage, brands, or giver intent.\n\n" +
        `THE RUN: judged ${r.scanned} of ${r.total} listings (feed: ${r.feed}, dedupe: ${r.dedupe ? r.source : "off"}, ${r.skipped} already-seen skipped). ` +
        `${r.pushed} kept (PUSH) at the user's bar ${r.bar.toFixed(2)} (level ${r.level}). ` +
        `Model calls: ${r.batteryCalls} battery + ${r.eyeCalls} photo-eye, ${r.stage0Kills} stage-0 kills, ${r.flips} verdict flips, ~${r.totalInputTokens} input tokens, avg ${r.avgBatteryMs}ms battery / ${r.avgEyeMs}ms eye.\n\n` +
        "CARDS (digest — call tools for the full receipt):\n" +
        ctx.cards.map(digestLine).join("\n") +
        (focus
          ? `\n\nFOCUS CARD (pinned to the hot seat — weight answers toward it unless asked otherwise):\n${JSON.stringify(receiptOf(focus))}\nListing body: ${focus.body}`
          : "\n\nNo card is pinned — the user is asking about the pile generally.") +
        "\n\nProb key: T1 real-offer, T2 scam, T3 condition, T5 desirability, T6 brand/resale, T7 pickup-effort, T8 urgency, T9 giver-honesty, T10 portability, T11 taste-match, T12 hidden-hassle, T13 find-factor, T2v photos-confirm (eye stage only; absent = never photographed).",
      messages,
      tools,
      stopWhen: stepCountIs(6),
    });
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") await emit(w, { type: "chat_delta", text: part.text });
      else if (part.type === "tool-call") await emit(w, { type: "chat_tool", name: part.toolName, id: (part.input as { id?: string }).id });
    }
    const response = await result.response;
    return { messages: response.messages, text: await result.text };
  } finally {
    w.releaseLock();
  }
}

// Tool messages can carry photo bytes (lookAtPhotos) — strip file parts
// before they land in durable history, else arg size balloons per turn.
const slimMessages = (msgs: import("ai").ModelMessage[]): import("ai").ModelMessage[] =>
  msgs.map((m) => {
    if (m.role !== "tool") return m;
    return {
      ...m,
      content: m.content.map((p) =>
        p.type === "tool-result" && p.output.type === "content"
          ? {
              ...p,
              output: {
                ...p.output,
                value: p.output.value.map((v) => (v.type === "file" ? { type: "text" as const, text: `[${v.mediaType} — viewed]` } : v)),
              },
            }
          : p,
      ),
    };
  });

const HISTORY_MAX = 20;
const hist = (base: import("ai").ModelMessage[], adds: import("ai").ModelMessage[]): import("ai").ModelMessage[] =>
  deepFreeze([...base, ...slimMessages(adds)].slice(-HISTORY_MAX));

// level is the run's internal bar (0 = lenient = widest capture). The
// user-facing picky dial is a UI filter applied after the run, so the
// baseline stays lenient: capture wide, let the slider narrow it.
export async function scanWorkflow(dir = "data/corpus", paceMs = 1500, limit = 40, live = false, runToken = "", level = 0) {
  "use workflow";
  const { workflowRunId } = getWorkflowMetadata();
  const { pool, total, skipped, dedupe, source, feed } = await pickPool(dir, limit, live);
  await emitEvent({ type: "pool", runId: workflowRunId, total, judging: pool.length, skipped, dedupe, source, feed });
  const useEye = await detectEye();
  const taste = await loadTasteStep(); // once per run — not per listing
  let scanned = 0;
  let pushed = 0;
  const judged = new Map<string, { l: Listing; r: JudgeOut }>();
  for (const l of pool) {
    const r = await judgeListing(l, useEye, level, taste);
    judged.set(l.id, { l, r });
    scanned++;
    if (r.verdict === "PUSH") pushed++;
    await emitEvent({ type: "counter", scanned, pushed, total: pool.length });
    if (paceMs > 0) await sleep(`${paceMs}ms`);
  }

  // Round 2 — no selection gate: the chat hook arms as soon as the
  // sort finishes, and the run suspends there for the whole
  // conversation. Clicking a glowing card sends {pin:id} on the same
  // hook to pin it (re-pinnable mid-chat); the raccoon knows every
  // judged card plus the run stats either way.
  const timings = [...judged.values()].map(({ r }) => r);
  const judgedCalls = timings.filter((t) => t.batteryMs > 0);
  const eyeCalls = timings.filter((t) => t.eyeMs > 0);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const stats: RunStats = {
    feed, total, scanned, pushed, skipped, dedupe, source, useEye, level,
    bar: priorAt(level).pushAt,
    modelCalls: judgedCalls.length + eyeCalls.length,
    batteryCalls: judgedCalls.length,
    stage0Kills: timings.length - judgedCalls.length,
    eyeCalls: eyeCalls.length,
    flips: timings.filter((t) => t.flipped).length,
    totalInputTokens: timings.reduce((a, t) => a + t.inputTokens, 0),
    avgBatteryMs: avg(judgedCalls.map((t) => t.batteryMs)),
    avgEyeMs: avg(eyeCalls.map((t) => t.eyeMs)),
  };
  await emitEvent({
    type: "round_done",
    scanned, pushed,
    run: stats,
    timing: {
      modelCalls: stats.modelCalls,
      batteryCalls: stats.batteryCalls,
      stage0Kills: stats.stage0Kills,
      eyeCalls: stats.eyeCalls,
      totalInputTokens: stats.totalInputTokens,
      avgBatteryMs: stats.avgBatteryMs,
      avgEyeMs: stats.avgEyeMs,
    },
    candidates: [...judged.entries()]
      .filter(([, { r }]) => r.verdict !== "REJECT" || r.score > 0)
      .map(([id, { l, r }]) => ({ id, title: l.title, hood: l.hood, verdict: r.verdict, score: r.score })),
  });

  // One chat hook for the whole conversation — the client keeps a
  // single token and the input arms once. `for await` drains resumes
  // until {done:true} or the turn cap. {pin:id} re-pins the focus card.
  const ctx = await buildRunContext([...judged.values()], stats);
  const chatHook = createHook<{ q?: string; done?: boolean; pin?: string }>({ token: `${runToken}:chat` });
  await emitEvent({ type: "chat_ready", token: `${runToken}:chat`, focusId: null });
  let allMessages: import("ai").ModelMessage[] = [];
  let focusId: string | null = null;
  let turn = 0;
  for await (const msg of chatHook) {
    if (msg.done) break;
    if (msg.pin) {
      const p = judged.get(msg.pin);
      if (p) {
        focusId = p.l.id;
        await emitEvent({ type: "selected", id: p.l.id, title: p.l.title });
      }
      continue;
    }
    const q = msg.q?.trim();
    if (!q) continue;
    if (turn >= 24) {
      await emitEvent({ type: "chat_error", error: "the raccoon is all talked out — run's done" });
      break;
    }
    allMessages = hist(allMessages, [{ role: "user", content: q }]);
    try {
      const { messages, text } = await runTurn(ctx, allMessages, focusId);
      allMessages = hist(allMessages, messages);
      await emitEvent({ type: "chat", q, a: text, turn });
    } catch (e) {
      // The turn died — report it and keep the hook resumable.
      await emitEvent({ type: "chat_error", q, error: String(e).slice(0, 200) });
    }
    turn++;
  }
  await emitEvent({ type: "done", scanned, pushed });
  return { scanned, pushed };
}

async function detectEye(): Promise<boolean> {
  "use step";
  return !!pickEye();
}

// Taste is a step, not workflow-VM code — loadWants reads fs and
// Cognee recall is a network call; neither is allowed in the VM.
async function loadTasteStep(): Promise<TasteCtx> {
  "use step";
  return loadTaste();
}
