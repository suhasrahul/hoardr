"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { motion, MotionConfig, type Transition } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import css from "./hoardr.module.css";

type Eye = "idle" | "running" | "done" | "error";
type Fly = "inToss" | "inFlick" | "inGlide" | "inTuck";
type Zone = "junk" | "keeps" | "maybe";

interface Card {
  id: string;
  title: string;
  hood: string;
  status?: string;
  images: string[];
  verdict?: string;
  score?: number;
  url?: string;
  vetoedBy?: string | null;
  eye?: Eye;
  flipped?: boolean;
  identity?: string | null;
  value?: string | null;
  price?: { product: string; amount: number; sourceUrl: string } | null;
  t2v?: number;
  probs?: Record<string, number>;
  lean?: string;
  tilt: number;
  fly: Fly;
  zone?: Zone;
}

interface Find {
  id: string;
  title: string;
  hood: string;
  images: string[];
  score: number;
  probs: Record<string, number>;
  identity?: string | null;
  value?: string | null;
  price?: { product: string; amount: number; sourceUrl: string } | null;
  flipped?: boolean;
  url?: string;
  claim?: "idle" | "drafted" | "pending" | "sent";
}

interface Chat {
  focusId: string | null;
  title: string | null;
  token: string | null;
  log: { q: string; a: string }[];
  draft: string;
  tool: string | null;
  over: boolean;
}

const TOOL_LINE: Record<string, string> = {
  getReceipt: "digging up the receipt",
  getListingText: "re-reading the listing",
  compareCards: "lining them up side by side",
  lookAtPhotos: "squinting at the photos",
  thinking: "sniffing around",
};

const IDENTITY_TAG: Record<string, string> = {
  confirmed_model: "✓ model id",
  brand_only: "🏷 brand",
  contradicts_listing: "⚠ contradicts",
};

// T2p resale band → display label (mirrors VALUE_LABEL in lib/judge/battery).
const VALUE_TAG: Record<string, string> = {
  under_10: "≈ <$10",
  "10_25": "≈ $10–25",
  "25_50": "≈ $25–50",
  "50_100": "≈ $50–100",
  "100_250": "≈ $100–250",
  "250_500": "≈ $250–500",
  "500_1000": "≈ $500–1k",
  over_1000: "≈ $1k+",
};

const KILL: Record<string, string> = {
  T12: "☣ HAZARD",
  T2: "SCAM",
  T2v: "CONTRADICTED",
  nopics: "NOPE · no photo",
  wanted: "NOPE · wanted",
  status: "NOPE · wanted",
  taken: "GONE",
  eye_failed: "UNVERIFIED",
  findGate: "NOT A FIND",
};

// Stage-0 kills: no model call, so the card gets the cheap fast flick.
const STAGE0 = new Set(["wanted", "taken", "nopics", "status"]);
const RED_KILL = new Set(["T2", "T12", "T2v"]);

const tilt = (id: string) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (Math.abs(h) % 15) - 7;
};

const SPRING_POP: Transition = { type: "spring", stiffness: 320, damping: 20 };
const SPRING_SLAM: Transition = { type: "spring", stiffness: 560, damping: 22, delay: 0.3 };

// Flight personality per throw — the card spins/overshoots into the pile.
// r = spin offset added on top of the card's resting tilt during flight.
const FLIGHT: Record<Fly, { r: number; s: number; t: Transition }> = {
  inToss: { r: -38, s: 1.1, t: { type: "spring", stiffness: 340, damping: 21 } },
  inGlide: { r: 10, s: 1.05, t: { type: "spring", stiffness: 200, damping: 26 } },
  inFlick: { r: 55, s: 0.8, t: { type: "spring", stiffness: 520, damping: 28 } },
  inTuck: { r: 0, s: 1, t: { type: "spring", stiffness: 260, damping: 26 } },
};

const WHY_VETO: Record<string, string> = {
  wanted: "It's a wanted post — someone's asking, not giving.",
  status: "It's a wanted post — someone's asking, not giving.",
  taken: "Already claimed — it's gone.",
  nopics: "No photos — can't verify it's real or worth it.",
  T2: "Flags as a scam — money, shipping, gift cards, or personal info.",
  T12: "Hazard risk — pests, mold, or broken beyond saving.",
  T2v: "The photos contradict what the listing claims.",
  eye_failed: "Couldn't verify the photos — a keeper needs proof.",
  findGate: "Pristine but trivial — clean isn't the same as a find.",
};

const Q_LABEL: Record<string, string> = {
  T3: "condition",
  T5: "desirability",
  T6: "resale signal",
  T9: "honesty",
  T11: "your wants",
};

// Keeper receipt helpers — display only, no judging happens here.
const T2V_LINE = (t2v?: number) =>
  t2v === undefined ? "no photo check ran"
  : t2v >= 1 ? "✓ photos confirm the listing"
  : t2v <= 0.1 ? "✗ photos contradict the listing"
  : "? photos inconclusive";

const IDENTITY_LINE: Record<string, string> = {
  confirmed_model: "brand + model identified",
  brand_only: "brand identified, model unclear",
  generic_or_unknown: "no brand or model identified",
  contradicts_listing: "photos show a different brand/model",
};

// Mirrors draftClaim() in workflows/claim.ts so the preview shows the exact text.
const draftFor = (title: string) => `Hi! Saw your ${title} — is it still available? I can pick up today. Thanks!`;

const LEGEND: { seg: string; label: string }[] = [
  { seg: "segMint", label: "kept" },
  { seg: "segGrape", label: "maybe" },
  { seg: "segMuted", label: "tossed" },
  { seg: "segCoral", label: "scam / hazard / photo mismatch" },
  { seg: "segBanana", label: "photos unverified" },
];

// Price-estimate chip (Jev T2p band) — shown wherever a card appears.
const priceChip = (value?: string | null) =>
  value && VALUE_TAG[value] ? <span className={css.priceChip} title="Jev resale estimate from the photos">{VALUE_TAG[value]}</span> : null;

const drags = (c: Card) => {
  if (!c.probs) return "";
  return Object.entries(Q_LABEL)
    .filter(([k]) => (c.probs![k] ?? 1) < 0.5)
    .sort((a, b) => (c.probs![a[0]] ?? 1) - (c.probs![b[0]] ?? 1))
    .map(([, v]) => v)
    .slice(0, 2)
    .join(" + ");
};

const whyText = (c: Card) => {
  if (c.vetoedBy && WHY_VETO[c.vetoedBy]) return WHY_VETO[c.vetoedBy];
  const d = drags(c);
  const s = c.score?.toFixed(2) ?? "—";
  if (c.verdict === "PUSH") return `Scored ${s} — the final verdict was keep${d ? `, despite weak ${d}` : ""}.`;
  if (c.verdict === "DIGEST") return `Scored ${s} — borderline, filed for later${d ? `; weak on ${d}` : ""}.`;
  return `Scored ${s} — not enough to keep${d ? `; dragged down by ${d}` : ""}.`;
};

// Corpus/feed titles arrive with HTML entities — decode for display.
const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const dec = (s: string) =>
  s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === "#") {
      const n = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return NAMED_ENTITIES[e.toLowerCase()] ?? m;
  });

const normTitle = (s: string) => dec(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
// The corpus has same-title dupes — hide repeats (dedupe misses them).
const uniqByTitle = <T extends { title: string }>(arr: T[]) => {
  const seen = new Set<string>();
  return arr.filter((x) => {
    const k = normTitle(x.title);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

const segOf = (c: Card) =>
  c.vetoedBy && RED_KILL.has(c.vetoedBy)
    ? "segCoral"
    : c.vetoedBy === "eye_failed"
      ? "segBanana"
      : c.verdict === "PUSH"
        ? "segMint"
        : c.verdict === "DIGEST"
          ? "segGrape"
          : "segMuted";

const stampOf = (c: Card) => {
  if (c.vetoedBy && KILL[c.vetoedBy]) return KILL[c.vetoedBy];
  if (c.verdict === "PUSH") return "KEEPER";
  if (c.verdict === "DIGEST") return "MAYBE";
  if (c.verdict === "CLAIMED") return "GONE";
  if (c.verdict === "REJECT") return "PASS";
  return c.verdict ?? null;
};

function BrowseDialog({ className, titleId, onDismiss, children }: {
  className: string;
  titleId: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={className}
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onDismiss(); }}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) onDismiss();
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const { left, right, top, bottom } = e.currentTarget.getBoundingClientRect();
        if (e.clientX < left || e.clientX > right || e.clientY < top || e.clientY > bottom) onDismiss();
      }}
    >
      {children}
    </dialog>
  );
}

export default function Dashboard() {
  const [deck, setDeck] = useState(0);
  const [hot, setHot] = useState<Card | null>(null);
  const [junk, setJunk] = useState<Card[]>([]);
  const [keeps, setKeeps] = useState<Card[]>([]);
  const [maybe, setMaybe] = useState<Card[]>([]);
  const [strip, setStrip] = useState<{ seg: string; card: Card }[]>([]);
  const [spread, setSpread] = useState<Zone | null>(null);
  const [finds, setFinds] = useState<Find[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [running, setRunning] = useState(false);
  const [roundComplete, setRoundComplete] = useState(false);
  const live = true; // always scan the live Trash Nothing feed (server falls back to saved listings if it fails)
  const [meta, setMeta] = useState<string | null>(null);
  const [feed, setFeed] = useState<"live" | "replay" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [scanned, setScanned] = useState(0);
  const [total, setTotal] = useState(0);
  const [cands, setCands] = useState<{ id: string; title: string }[]>([]);
  const [chat, setChat] = useState<Chat | null>(null);
  const chatDisclosure = useRef<HTMLDetailsElement>(null);
  const [inspect, setInspect] = useState<Card | null>(null);
  const [question, setQuestion] = useState("");
  const [confetti, setConfetti] = useState<string | null>(null);
  const [flash, setFlash] = useState<"keep" | "kill" | "toss" | "tuck" | null>(null);
  const hotRef = useRef<Card | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const allRef = useRef<Map<string, Card>>(new Map());
  const runIdRef = useRef<string | null>(null);
  const idxRef = useRef(0);
  const retriesRef = useRef(0);
  const doneRef = useRef(false);

  const setHotCard = (c: Card | null) => {
    hotRef.current = c;
    setHot(c);
  };

  const patchHot = (id: string, patch: Partial<Card>) => {
    if (hotRef.current?.id === id) setHotCard({ ...hotRef.current, ...patch });
  };

  const throwCard = (c: Card) => {
    const stage0 = STAGE0.has(c.vetoedBy ?? "");
    c.fly = stage0 ? "inFlick" : c.verdict === "PUSH" ? "inGlide" : c.verdict === "DIGEST" ? "inTuck" : "inToss";
    c.zone = c.verdict === "PUSH" ? "keeps" : c.verdict === "DIGEST" ? "maybe" : "junk";
    allRef.current.set(c.id, c);
    if (c.zone === "keeps") setKeeps((k) => [...k, c]);
    else if (c.zone === "maybe") setMaybe((m) => [...m, c]);
    else setJunk((j) => [...j, c]);
    setStrip((s) => [...s, { seg: segOf(c), card: c }]);
    const kind = c.verdict === "PUSH" ? "keep" : c.vetoedBy && RED_KILL.has(c.vetoedBy) ? "kill" : c.verdict === "DIGEST" ? "tuck" : "toss";
    setFlash(kind);
    setTimeout(() => setFlash(null), kind === "keep" ? 1000 : 550);
    if (c.verdict === "PUSH" && c.score !== undefined) {
      const { id, title, hood, images, score, probs, identity, value, price, flipped, url } = c;
      setFinds((f) => [...f, { id, title, hood, images, score, probs: probs ?? {}, identity, value, price, flipped, url, claim: "idle" }]);
    }
  };

  const startScan = () => {
    esRef.current?.close();
    setHotCard(null);
    setJunk([]);
    setKeeps([]);
    setMaybe([]);
    setStrip([]);
    setFinds([]);
    setDeck(0);
    setScanned(0);
    setTotal(0);
    setMeta(null);
    setFeed(null);
    setPreview(null);
    setNote(null);
    setCands([]);
    setChat(null);
    allRef.current.clear();
    setInspect(null);
    setReview(false);
    setOpen(null);
    setSpread(null);
    setRoundComplete(false);
    setRunning(true);
    runIdRef.current = null;
    idxRef.current = 0;
    retriesRef.current = 0;
    doneRef.current = false;
    openStream(`/api/scan?limit=50&pace=400${live ? "&live=1" : ""}`);
  };

  // One event = one durable stream chunk, so the received count IS the
  // resume index. Dropped connection → /api/scan/stream replays from it.
  const openStream = (url: string) => {
    const es = new EventSource(url);
    esRef.current = es;
    es.onmessage = (e) => {
      idxRef.current++;
      handleEvent(JSON.parse(e.data));
    };
    es.onerror = () => {
      es.close();
      if (doneRef.current || !runIdRef.current || retriesRef.current >= 3) {
        setRunning(false);
        setNote("connection lost — the run may still be going (npx workflow inspect)");
        return;
      }
      retriesRef.current++;
      setNote("connection dropped — reconnecting…");
      setTimeout(() => openStream(`/api/scan/stream?runId=${runIdRef.current}&from=${idxRef.current}`), 1500);
    };
  };

  const handleEvent = (ev: ReturnType<typeof JSON.parse>) => {
      if (ev.type === "pool") {
        runIdRef.current = ev.runId ?? null;
        setDeck(ev.judging);
        setTotal(ev.judging);
        setFeed(ev.feed === "live" ? "live" : "replay");
        const feed = ev.feed === "live" ? "live · trash nothing" : "replay · corpus";
        const pool = ev.dedupe && ev.skipped > 0
          ? `${ev.judging} new · ${ev.skipped} already judged · ${ev.total} in pile`
          : `${ev.judging} of ${ev.total} sampled`;
        setMeta(`${pool} — ${feed}${ev.source && ev.source !== "none" ? ` · dedupe: ${ev.source}` : ""}`);
      } else if (ev.type === "seen") {
        setDeck((d) => Math.max(0, d - 1));
        setHotCard({ id: ev.id, title: dec(ev.title ?? ""), hood: ev.hood, status: ev.status, images: ev.images ?? [], eye: "idle", tilt: tilt(ev.id), fly: "inToss" });
      } else if (ev.type === "battery") {
        patchHot(ev.id, { lean: ev.mine, score: ev.score, probs: ev.probs });
      } else if (ev.type === "eye_start") {
        patchHot(ev.id, { eye: "running", images: ev.images?.length ? ev.images : undefined });
      } else if (ev.type === "eye_result") {
        patchHot(ev.id, { eye: "done", flipped: ev.flipped, identity: ev.identity, value: ev.value, t2v: ev.t2v, images: ev.images?.length ? ev.images : undefined });
      } else if (ev.type === "eye_error") {
        patchHot(ev.id, { eye: "error" });
      } else if (ev.type === "verdict") {
        const cur = hotRef.current;
        const base: Card =
          cur && cur.id === ev.id
            ? cur
            : { id: ev.id, title: dec(ev.title ?? ""), hood: ev.hood, images: [], eye: "idle", tilt: tilt(ev.id), fly: "inToss" };
        const c: Card = {
          ...base,
          title: dec(ev.title ?? ""),
          hood: ev.hood,
          verdict: ev.verdict,
          score: ev.score,
          probs: ev.probs,
          url: ev.url,
          vetoedBy: ev.vetoedBy,
          identity: ev.identity,
          value: ev.value,
          price: ev.price ?? null,
          flipped: ev.flipped,
          images: ev.images?.length ? ev.images : base.images,
        };
        setHotCard(null);
        throwCard(c);
      } else if (ev.type === "counter") {
        setScanned(ev.scanned);
        setTotal(ev.total);
      } else if (ev.type === "round_done") {
        setCands(uniqByTitle((ev.candidates ?? []).map((c: { id: string; title: string }) => ({ ...c, title: dec(c.title ?? "") }))));
        if (typeof ev.scanned === "number") setScanned(ev.scanned);
        setRoundComplete(true);
        setRunning(false);
      } else if (ev.type === "selected") {
        // A {pin} on the chat hook landed — the card stays pinned, and
        // re-pinning mid-chat keeps the transcript.
        const title = ev.title ? dec(ev.title) : allRef.current.get(ev.id)?.title ?? null;
        setChat((c) => (c ? { ...c, focusId: ev.id, title } : c));
      } else if (ev.type === "chat_ready") {
        // Arms right after round_done — no selection required.
        setChat((c) => ({
          focusId: ev.focusId ?? c?.focusId ?? null,
          title: c?.title ?? null,
          token: ev.token,
          log: c?.log ?? [],
          draft: "",
          tool: null,
          over: false,
        }));
      } else if (ev.type === "chat_delta") {
        setChat((c) => (c ? { ...c, draft: c.draft + ev.text, tool: null } : c));
      } else if (ev.type === "chat_tool") {
        setChat((c) => (c ? { ...c, tool: ev.name } : c));
      } else if (ev.type === "chat") {
        setChat((c) => (c ? { ...c, log: [...c.log, { q: ev.q, a: ev.a }], draft: "", tool: null } : c));
      } else if (ev.type === "chat_error") {
        setChat((c) => (c ? { ...c, draft: "", tool: null } : c));
        setNote(`the raccoon choked: ${ev.error}`);
      } else if (ev.type === "done") {
        doneRef.current = true;
        setRunning(false);
        setChat((c) => (c ? { ...c, token: null, tool: null, over: true } : c));
        esRef.current?.close();
      }
  };

  // taste tap → /api/taste (local swipes + Cognee when configured)
  const tap = (c: { id: string; title: string }, signal: string) =>
    fetch("/api/taste", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listingId: c.id, title: c.title, signal }),
    }).catch(() => {});
  const inspectCard = (c: Card) => {
    tap(c, "inspect");
    setInspect(c);
  };

  const claim = async (f: Find) => {
    setPreview(f.id);
    tap(f, "claim");
    setFinds((fs) => fs.map((x) => (x.id === f.id ? { ...x, claim: "drafted" } : x)));
    await fetch(`/api/claim/${f.id}`, { method: "POST", body: JSON.stringify({ title: f.title }) });
    setFinds((fs) => fs.map((x) => (x.id === f.id ? { ...x, claim: "pending" } : x)));
  };

  const approve = async (f: Find) => {
    tap(f, "approve");
    await fetch(`/api/claim/${f.id}`, { method: "POST", body: JSON.stringify({ action: "approve" }) });
    setFinds((fs) => fs.map((x) => (x.id === f.id ? { ...x, claim: "sent" } : x)));
    setPreview(null);
    setConfetti(f.id);
    setTimeout(() => setConfetti(null), 900);
  };

  const interact = (token: string, payload: object) =>
    fetch("/api/scan/interact", { method: "POST", body: JSON.stringify({ token, payload }) });
  // Pinning is a message on the chat hook — works any time it's armed.
  const pin = (id: string) => chat?.token && interact(chat.token, { pin: id });
  const askAbout = (id: string) => {
    setInspect(null);
    if (chatDisclosure.current) chatDisclosure.current.open = true;
    pin(id);
    requestAnimationFrame(() => chatDisclosure.current?.querySelector("input")?.focus());
  };
  const ask = () => {
    if (!chat?.token || !question.trim()) return;
    interact(chat.token, { q: question });
    setQuestion("");
    setChat((c) => (c ? { ...c, tool: "thinking" } : c));
  };
  const endChat = () => chat?.token && interact(chat.token, { done: true });

  const candIds = new Set(cands.map((c) => c.id));
  const sorted = !running && strip.length > 0;
  const spreadCards = spread === "junk" ? junk : spread === "maybe" ? maybe : keeps;
  const spreadLabel = spread === "junk" ? "Tossed" : spread === "maybe" ? "Maybe" : "Kept";
  const junkStack = junk.slice(-7);
  const noListings = feed !== null && total === 0;

  // goblin mood — flash wins, then eye > sniff > dig > done > idle
  const mood =
    flash === "keep" ? "celebrate"
    : flash === "kill" || flash === "toss" || flash === "tuck" ? "toss"
    : hot?.eye === "running" ? "look"
    : hot ? "sniff"
    : running ? "dig"
    : scanned > 0 ? "done"
    : "idle";

  const pileCard = (c: Card, i: number, mode: "stack" | "fan" = "stack", muted = false) => {
    const zoneCls = c.zone === "keeps" ? css.keepsCard : c.zone === "maybe" ? css.maybeCard : `${css.junkCard} ${c.vetoedBy && RED_KILL.has(c.vetoedBy) ? css.killCard : ""}`;
    const f = FLIGHT[c.fly];
    return (
      <motion.div
        key={c.id}
        layoutId={`card-${c.id}`}
        initial={{ rotate: c.tilt + f.r, scale: f.s }}
        animate={{ rotate: c.tilt, scale: 1 }}
        transition={f.t}
        whileTap={{ scale: 0.94 }}
        className={`${css.mini} ${zoneCls}`}
        style={{ bottom: mode === "stack" ? i * 26 : "auto", zIndex: i + 1 } as CSSProperties}
        onClick={() => inspectCard(c)}
        title="why?"
      >
        {c.images[0] ? <img src={c.images[0]} alt="" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} /> : <div className={css.miniImgPh} aria-hidden />}
        <div className={css.miniTitle}>{c.title}</div>
        {priceChip(c.value)}
        {stampOf(c) && !muted && (
          <motion.div
            className={css.miniStamp}
            initial={{ scale: 2.6, opacity: 0, rotate: -22 }}
            animate={{ scale: 1, opacity: 1, rotate: -8 }}
            transition={SPRING_SLAM}
          >
            {stampOf(c)}
          </motion.div>
        )}
      </motion.div>
    );
  };

  const browseCards = (cards: Card[]) => (
    <div className={css.spreadGrid}>
      {[...cards].reverse().map((c) => (
        <button key={c.id} type="button" className={css.browseCard} onClick={() => inspectCard(c)}>
          {c.images[0] && <img src={c.images[0]} alt="" loading="lazy" onError={(e) => { e.currentTarget.hidden = true; }} />}
          <span className={css.browseCardBody}>
            <span className={css.miniTitle}>{c.title}</span>
            {priceChip(c.value)}
            <span className={`${css.browseVerdict} ${c.vetoedBy && RED_KILL.has(c.vetoedBy) ? css.tagCoral : ""}`}>
              {stampOf(c) || (c.zone === "maybe" ? "Maybe" : "Kept")}
            </span>
          </span>
        </button>
      ))}
    </div>
  );

  const scanButton = (
    <motion.button
      type="button"
      className={`${css.btn} ${css.cta} ${chat ? css.ctaDim : ""} ${!feed && !running ? css.breathe : ""}`}
      onClick={startScan}
      disabled={running}
      whileTap={{ scale: 0.93, y: 3 }}
    >
      {running ? "DIGGING…" : feed ? "Scan again" : "GO FIND TREASURE"}
    </motion.button>
  );

  // Blinking LIVE badge. If the live fetch failed and the server fell back
  // to saved listings, say so instead of claiming LIVE.
  const modeBadge = feed === "replay" ? (
    <span className={css.mode} title="Live feed unavailable — using saved listings">SAVED LISTINGS</span>
  ) : (
    <span className={`${css.mode} ${css.modeLive}`} title="Real free listings from Trash Nothing, fetched at scan time">
      <span className={css.liveDot} aria-hidden />LIVE
    </span>
  );

  const progress = strip.length > 0 && (
    <div className={css.stripWrap}>
      {!roundComplete && <div className={`${css.goblin} ${css[`g_${mood}`]}`} aria-hidden>
        <motion.span key={mood} initial={{ scale: 0.5, y: 8 }} animate={{ scale: 1, y: 0 }} transition={SPRING_POP} style={{ display: "inline-block" }}>
          <img className={css.goblinImg} src="/raccoon.svg" alt="" />
        </motion.span>
        {mood === "look" && <span className={css.mag}>🔍</span>}
        {mood === "celebrate" && <span className={css.mag}>🎉</span>}
      </div>}
      <div className={css.strip} role="group" aria-label={`${strip.length} of ${total} sorted, ${keeps.length} kept`}>
        {strip.map((s, i) => (
          <motion.button
            type="button"
            key={i}
            className={`${css.seg} ${css[s.seg]} ${css.segBtn}`}
            initial={roundComplete ? false : { scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={SPRING_POP}
            style={{ transformOrigin: "bottom" }}
            onClick={() => inspectCard(s.card)}
            title={s.card.title}
            aria-label={`${s.card.title}: ${stampOf(s.card)}`}
          />
        ))}
      </div>
      {roundComplete && (
        <div className={css.legend} aria-label="progress bar colors">
          {LEGEND.map((l) => (
            <span key={l.seg} className={css.legendItem}>
              <span className={`${css.legendSwatch} ${css[l.seg]}`} />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <MotionConfig reducedMotion="user">
    <main className={css.main}>
      <header className={css.header}>
        <div className={css.headerRow}>
          <div className={css.logo}>
            HOARDR<span className={css.mascot}><img src="/raccoon.svg" alt="" /></span>
          </div>
          {modeBadge}
          {feed && <div className={css.scanControls}>{scanButton}</div>}
        </div>
        {feed && (
          <>
            <h1 className={css.headline} aria-live="polite">
              {roundComplete && noListings ? "No new listings to sort"
                : roundComplete && !keeps.length ? "No keepers this round"
                : roundComplete ? `${keeps.length} ${keeps.length === 1 ? "keeper" : "keepers"} from ${scanned} ${scanned === 1 ? "listing" : "listings"}`
                : noListings ? "Checking the pile…"
                : <><b>{scanned} / {total}</b> scanned · <b className={css.headlineKept}>{keeps.length}</b> kept</>}
            </h1>
          </>
        )}
      </header>

      {note && <div className={`${css.banner} ${css.bannerInfo}`} role="status">{note}</div>}

      {!feed && (
        <section className={css.welcome}>
          <h1>I find free stuff you didn&apos;t know you absolutely needed.</h1>
          {scanButton}
          {running && <p className={css.source} role="status">Getting the live listings…</p>}
        </section>
      )}

      {roundComplete && (
        <p className={css.summary}>
          {noListings
            ? "Nothing new landed in the pile — try the live feed or scan again later."
            : `I looked at ${scanned} ${scanned === 1 ? "thing" : "things"} so you didn't have to — ${keeps.length} kept, ${maybe.length} maybe, ${junk.length} tossed.`}
        </p>
      )}

      {feed && !noListings && !roundComplete && (
      <div className={`${css.stage} ${flash === "kill" ? css.stageShake : ""}`}>
        <section className={`${css.pile} ${css.pileJunk}`} aria-label={`junk pile, ${junk.length} tossed`}>
          <button type="button" className={`${css.chip} ${css.pileChip} ${css.chipBtn}`} onClick={() => setSpread("junk")} disabled={!junk.length}>
            {junk.length} tossed
          </button>
          {sorted ? (
            <div className={css.fan}>
              {junk.slice(-9).map((c, i) => pileCard(c, i, "fan"))}
              {junk.length > 9 && <button className={css.seeAll} onClick={() => setSpread("junk")}>all {junk.length} →</button>}
            </div>
          ) : junk.length === 0 ? (
            <div className={css.pileGhost}>tossed cards pile up here 🗑</div>
          ) : (
            junkStack.map((c, i) => pileCard(c, i, "stack", i < junkStack.length - 3))
          )}
        </section>

        <section className={css.center}>
          {deck > 0 && (
            <div className={css.deck} key={deck}>
              <div className={css.deckCard} style={{ bottom: 10 }} />
              <div className={css.deckCard} style={{ bottom: 5 }} />
              <div className={css.deckCard} />
              <div className={`${css.chip} ${css.deckCount}`}>{deck} left</div>
            </div>
          )}

          {hot ? (
            <motion.div
              className={css.hot}
              layoutId={`card-${hot.id}`}
              initial={{ scale: 0.5, opacity: 0, rotate: -10, y: -60 }}
              animate={{ scale: 1, opacity: 1, rotate: -1, y: 0 }}
              transition={SPRING_POP}
            >
              {hot.images[0] ? <img className={css.hotImg} src={hot.images[0]} alt="" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} /> : <div className={`${css.hotImg} ${css.imgSlot}`} aria-hidden />}
              <div className={css.thumbs}>
                {hot.images.slice(1).map((src, i) => (
                  <img key={i} src={src} alt="" className={hot.eye === "running" ? css.thumbEye : undefined} />
                ))}
              </div>
              <div className={css.cTitle}>
                {hot.url ? <a href={hot.url} target="_blank" rel="noreferrer">{hot.title}</a> : hot.title}
              </div>
              <div className={css.cMeta}>{hot.hood}</div>
              <div className={css.tags}>
                {hot.status && hot.status !== "OFFER" && <span className={`${css.tag} ${css.tagMuted}`}>{hot.status}</span>}
                {hot.eye === "running" && <span className={`${css.tag} ${css.tagBanana}`}>👁 checking photos…</span>}
                {hot.eye === "done" && <span className={`${css.tag} ${css.tagBanana}`}>👁 looked</span>}
                {hot.eye === "error" && <span className={`${css.tag} ${css.tagMuted}`}>couldn&apos;t see it</span>}
                {hot.identity && IDENTITY_TAG[hot.identity] && <span className={`${css.tag} ${css.tagBanana}`}>🔍 {IDENTITY_TAG[hot.identity]}</span>}
                {hot.value && VALUE_TAG[hot.value] && <span className={`${css.tag} ${css.tagMint}`}>{VALUE_TAG[hot.value]}</span>}
                {hot.flipped && <span className={`${css.tag} ${css.tagGrape}`}>👁 eye-flipped</span>}
              </div>
              {hot.lean && <div className={css.hint}>leaning {hot.lean}…</div>}
              <div className={`${css.shimmer} ${hot.eye === "running" ? css.eyeing : ""}`} />
            </motion.div>
          ) : (
            <div className={css.empty}>
              {running ? "shuffling the pile…" : "Scan paused."}
            </div>
          )}

          <div className={css.tray} aria-label={`maybe tray, ${maybe.length}`}>
            <button type="button" className={`${css.trayLabel} ${css.chipBtn}`} disabled={!maybe.length} onClick={() => setSpread("maybe")}>
              {maybe.length} maybe {maybe.length > 0 && "↗"}
            </button>
            {maybe.slice(-3).map((c) => (
              <motion.button
                type="button"
                key={c.id}
                initial={{ scale: 0.5, opacity: 0, y: -18 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={SPRING_POP}
                className={css.trayCard}
                onClick={() => inspectCard(c)}
              >
                <span className={css.miniTitle}>{c.title}</span>
                {priceChip(c.value)}
              </motion.button>
            ))}
          </div>
        </section>

        <section className={`${css.pile} ${css.pileKeeps}`} aria-label={`keeps pile, ${keeps.length}`}>
          <button
            type="button"
            className={`${css.chip} ${css.pileChip} ${css.chipBtn}`}
            onClick={() => setReview((v) => !v)}
            aria-expanded={review}
            disabled={!keeps.length}
          >
            {keeps.length} kept
          </button>
          {flash === "keep" && (
            <motion.div className={css.keeperToast} initial={{ y: 14, opacity: 0, scale: 0.6 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={SPRING_POP}>
              Ooh — keeper!
            </motion.div>
          )}
          {sorted ? (
            <div className={css.fan}>
              {keeps.slice(-9).map((c, i) => pileCard(c, i, "fan"))}
              {keeps.length > 9 && <button className={css.seeAll} onClick={() => setReview(true)}>all {keeps.length} →</button>}
            </div>
          ) : keeps.length === 0 ? (
            <div className={css.pileGhost}>keeps land here ⭐</div>
          ) : (
            keeps.slice(-7).map((c, i) => pileCard(c, i))
          )}
        </section>
      </div>
      )}

      {progress}
      {spread && (
        <BrowseDialog className={css.spreadPanel} titleId="pile-browser-title" onDismiss={() => setSpread(null)}>
          <div className={css.browserHeader}>
            <div>
              <h2 id="pile-browser-title">{spreadLabel} <span className={css.browserCount}>{spreadCards.length}</span></h2>
              <p>Select a listing to see why.</p>
            </div>
            <button type="button" className={css.closeDialog} onClick={() => setSpread(null)}>✕ Close</button>
          </div>
          {browseCards(spreadCards)}
        </BrowseDialog>
      )}

      {inspect && (
        <BrowseDialog className={`${css.findCard} ${css.whyCard}`} titleId="listing-inspect-title" onDismiss={() => setInspect(null)}>
            <div className={`${css.browserHeader} ${css.inspectHeader}`}>
              <span className={css.browseVerdict}>{stampOf(inspect) ?? inspect.verdict}</span>
              <button type="button" className={css.closeDialog} onClick={() => setInspect(null)}>✕ Close</button>
            </div>
            {inspect.images[0] && <img className={css.hotImg} src={inspect.images[0]} alt="" />}
            <h2 id="listing-inspect-title" className={css.cTitle} style={{ marginTop: 10 }}>
              {inspect.url ? <a href={inspect.url} target="_blank" rel="noreferrer">{inspect.title}</a> : inspect.title}
            </h2>
            <div className={css.cMeta}>{inspect.hood} · score {inspect.score?.toFixed(2) ?? "—"}</div>
            {(inspect.price || (inspect.value && VALUE_TAG[inspect.value])) && (
              <div className={css.tags} style={{ marginTop: 8 }}>
                {inspect.price ? (
                  <a className={`${css.tag} ${css.tagMint}`} href={inspect.price.sourceUrl} target="_blank" rel="noreferrer" title={inspect.price.product}>
                    ≈ ${Math.round(inspect.price.amount)} new
                  </a>
                ) : (
                  inspect.value && VALUE_TAG[inspect.value] && <span className={`${css.tag} ${css.tagMint}`}>{VALUE_TAG[inspect.value]}</span>
                )}
              </div>
            )}
            <div className={css.a} style={{ marginTop: 10 }}>{whyText(inspect)}</div>
            {chat?.token && candIds.has(inspect.id) && (
              <button type="button" className={`${css.btn} ${css.btnSm} ${css.askAbout}`} onClick={() => askAbout(inspect.id)}>
                Ask about this listing
              </button>
            )}
            {inspect.probs && Object.keys(inspect.probs).length > 0 && (
              <div className={css.receipt}>
                {Object.entries(inspect.probs).map(([k, v]) => (
                  <div key={k} className={css.barRow}>
                    <span className={css.barLabel}>{k}</span>
                    <div className={css.barTrack}>
                      <div className={css.barFill} style={{ width: `${Math.round(v * 100)}%` }} />
                    </div>
                    <span className={css.barVal}>{v.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
        </BrowseDialog>
      )}

      {(roundComplete || review) && finds.length > 0 && (
        <section className={css.review} aria-label="Keeper listings">
          {finds.map((f) => (
              <motion.div
                key={f.id}
                className={css.findCard}
                initial={{ scale: 0.6, opacity: 0, rotate: -5, y: 20 }}
                animate={{ scale: 1, opacity: 1, rotate: 0, y: 0 }}
                transition={SPRING_POP}
              >
                <div className={css.badge}>{f.score.toFixed(2)}</div>
                {f.images.length > 0 && (
                  <div className={css.fImgs}>
                    {f.images.map((src, i) => (
                      <img key={i} src={src} alt="" />
                    ))}
                  </div>
                )}
                <div className={css.cTitle}>
                  {f.url ? <a href={f.url} target="_blank" rel="noreferrer">{f.title}</a> : f.title}
                </div>
                <div className={css.cMeta}>{f.hood}</div>
                <div className={css.tags}>
                  {f.identity && IDENTITY_TAG[f.identity] && <span className={`${css.tag} ${css.tagBanana}`}>🔍 {IDENTITY_TAG[f.identity]}</span>}
                  {f.value && VALUE_TAG[f.value] && <span className={`${css.tag} ${css.tagMint}`}>{VALUE_TAG[f.value]}</span>}
                  {f.price && <a className={`${css.tag} ${css.tagMint}`} href={f.price.sourceUrl} target="_blank" rel="noreferrer" title={f.price.product}>≈ ${Math.round(f.price.amount)} new</a>}
                  {f.flipped && <span className={`${css.tag} ${css.tagGrape}`}>👁 eye-flipped</span>}
                  {f.probs.T8 !== undefined && f.probs.T8 > 0.7 && <span className={`${css.tag} ${css.tagBanana}`}>going fast</span>}
                  {f.probs.T10 !== undefined && f.probs.T10 < 0.4 && <span className={`${css.tag} ${css.tagMuted}`}>needs truck</span>}
                  {f.probs.T7 !== undefined && f.probs.T7 > 0.7 && <span className={`${css.tag} ${css.tagMuted}`}>scheduling-heavy</span>}
                </div>
                <div className={css.actions}>
                  <button className={`${css.btn} ${css.btnSm}`} onClick={() => setOpen(open === f.id ? null : f.id)} aria-expanded={open === f.id}>
                    Why it&apos;s a keeper
                  </button>
                  {(f.claim === "idle" || f.claim === "pending") && preview !== f.id && (
                    <motion.button whileTap={{ scale: 0.9 }} className={`${css.btn} ${css.btnSm} ${css.btnCoral}`} onClick={() => (f.claim === "idle" ? claim(f) : setPreview(f.id))}>
                      Claim it →
                    </motion.button>
                  )}
                  {f.claim === "sent" && <span className={css.sent}>✓ Simulated claim recorded <small>(nothing was sent to the giver)</small></span>}
                </div>
                {preview === f.id && f.claim !== "sent" && (
                  <div className={css.preview} role="dialog" aria-label="claim message preview">
                    <div className={css.previewHead}>Draft message to the giver · <b>simulated</b></div>
                    <div className={css.previewBody}>{draftFor(f.title)}</div>
                    <div className={css.actions}>
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        className={`${css.btn} ${css.btnSm} ${css.btnBanana}`}
                        onClick={() => approve(f)}
                        disabled={f.claim !== "pending"}
                      >
                        {f.claim === "pending" ? "Approve" : "drafting…"}
                      </motion.button>
                      <button className={`${css.btn} ${css.btnSm}`} onClick={() => setPreview(null)}>Cancel</button>
                    </div>
                  </div>
                )}
                {open === f.id && (
                  <div className={css.why}>
                    {Object.entries(Q_LABEL).filter(([k]) => f.probs[k] !== undefined).map(([k, label]) => (
                      <div key={k} className={css.barRow}>
                        <span className={css.whyLabel}>{label}</span>
                        <div className={css.barTrack}>
                          <div className={css.barFill} style={{ width: `${Math.round(f.probs[k] * 100)}%` }} />
                        </div>
                        <span className={css.barVal}>{f.probs[k].toFixed(2)}</span>
                      </div>
                    ))}
                    <div className={css.whyRow}>
                      <span className={css.whyKey}>photo vs text</span>
                      <span>{T2V_LINE(f.probs.T2v)}{f.flipped ? " · photos changed the verdict" : ""}</span>
                    </div>
                    <div className={css.whyRow}>
                      <span className={css.whyKey}>brand / model</span>
                      <span>{f.identity ? IDENTITY_LINE[f.identity] ?? f.identity : "not checked"}</span>
                    </div>
                    {chat?.token && candIds.has(f.id) && (
                      <button type="button" className={`${css.btn} ${css.btnSm} ${css.askAbout}`} onClick={() => askAbout(f.id)}>
                        Ask about this listing
                      </button>
                    )}
                  </div>
                )}
                {confetti === f.id && (
                  <div className={css.confetti}>
                    {["🎉", "✨", "🎉", "⭐", "🎉", "✨", "🎉"].map((e, i) => (
                      <span key={i} style={{ "--dx": `${(i - 3) * 22}px`, animationDelay: `${i * 40}ms` } as CSSProperties}>{e}</span>
                    ))}
                  </div>
                )}
              </motion.div>
          ))}
        </section>
      )}
      {roundComplete && (
        <div className={css.resultExtras}>
          {(maybe.length > 0 || junk.length > 0) && (
            <div className={css.pileNav}>
              {maybe.length > 0 && (
                <button type="button" className={`${css.chip} ${css.chipBtn} ${css.navChip} ${keeps.length ? "" : css.navChipGrape}`} onClick={() => setSpread("maybe")}>
                  {maybe.length} maybe{keeps.length ? "" : " — worth a peek"} →
                </button>
              )}
              {junk.length > 0 && (
                <button type="button" className={`${css.chip} ${css.chipBtn} ${css.navChip}`} onClick={() => setSpread("junk")}>
                  {junk.length} tossed →
                </button>
              )}
            </div>
          )}
          {chat && (
            <details ref={chatDisclosure} className={css.disclosure}>
              <summary>Ask the raccoon</summary>
              <div className={css.dlg}>
                <div className={css.dlgSide}>
                  <img className={css.dlgImg} src="/raccoon.svg" alt="" />
                  <div className={css.dlgName}>HOARDR</div>
                </div>
                <div className={css.dlgBody}>
                  <div className={css.dlgLog} role="log">
                    {chat.title && <p className={css.hint}>Talking about: {chat.title}</p>}
                    {chat.log.map((m, i) => (
                      <div key={i}>
                        <div className={css.q}>&gt; {m.q}</div>
                        <div className={css.a}>{m.a}</div>
                      </div>
                    ))}
                    {chat.draft && <div className={css.a}>{chat.draft}<span className={css.caret}>▌</span></div>}
                    {chat.tool && <div className={css.dlgTool}>…{TOOL_LINE[chat.tool] ?? chat.tool}…</div>}
                    {!chat.log.length && !chat.draft && !chat.tool && <p className={css.hint}>Ask me anything about the pile.</p>}
                  </div>
                  {chat.token ? (
                    <form className={css.chatInput} onSubmit={(e) => { e.preventDefault(); ask(); }}>
                      <input className={css.input} aria-label="Question for the raccoon" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about this scan…" />
                      <button type="submit" className={`${css.btn} ${css.btnSm} ${css.btnCoral}`}>Ask</button>
                      <button type="button" className={`${css.btn} ${css.skip}`} onClick={endChat}>End chat</button>
                    </form>
                  ) : (
                    <p className={css.hint}>{chat.over ? "The raccoon clocked out. 🦝" : "The raccoon is waking up…"}</p>
                  )}
                </div>
              </div>
            </details>
          )}
          {meta && <p className={css.hud}>{meta}</p>}
        </div>
      )}
      <div className={css.credit}>raccoon art: OpenMoji · CC BY-SA</div>
    </main>
    </MotionConfig>
  );
}
