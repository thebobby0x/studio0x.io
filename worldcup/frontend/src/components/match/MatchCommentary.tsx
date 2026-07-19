"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Radio, RefreshCw, Play, Pause, Loader2, AlertCircle } from "lucide-react";
import ShareButton from "@/components/ui/ShareButton";

// ─────────────────────────────────────────────────────────────────────────────
// Live AI commentary. Two modes (owner 7/18 — fan/comedian replaced):
//  · Analyst — the professional single-voice feed (default studio voice)
//  · The Roundtable — Lorraine + Henry/Roberto/Ricky on ONE speaker-tagged
//    feed, each line playable in that panelist's own custom voice.
// Quiet periods: the client reports the event count it last saw; when nothing
// new arrives the server returns grounded BANTER (never invented action).
// ─────────────────────────────────────────────────────────────────────────────

type Persona = "analyst" | "roundtable";
type Speaker = "lorraine" | "henry" | "roberto" | "ricky" | "analyst";

interface CommentaryLine { speaker: Speaker; text: string }

interface CommentaryData {
  persona: Persona;
  score: string;
  status: string;
  elapsed: number;
  lines: CommentaryLine[];
  quiet?: boolean;
  eventCount: number;
  generatedAt: string;
}

interface CommentaryEntry extends CommentaryLine {
  generatedAt: string;
  elapsed: number | null;
}

interface CommentaryBatch {
  generatedAt: string;
  elapsed: number | null;
  quiet: boolean;
  entries: CommentaryEntry[];
}

const PERSONA_TABS: Record<Persona, { label: string; emoji: string }> = {
  analyst:    { label: "Analyst",        emoji: "📊" },
  roundtable: { label: "The Roundtable", emoji: "🎙️" },
};

// Speaker chips — Lorraine gold (host), panel slate, per color discipline.
const SPEAKERS: Record<Speaker, { name: string; short: string; accent: string }> = {
  analyst:  { name: "Analyst",        short: "AN", accent: "text-slate-300 border-slate-500/30 bg-white/5" },
  lorraine: { name: "Lorraine Footy", short: "LF", accent: "text-brand-gold border-brand-gold/40 bg-brand-gold/10" },
  henry:    { name: "Henry Futois",   short: "HF", accent: "text-slate-200 border-slate-500/40 bg-slate-500/10" },
  roberto:  { name: "Roberto Madrid", short: "RM", accent: "text-slate-200 border-slate-500/40 bg-slate-500/10" },
  ricky:    { name: "Ricky Riquelme", short: "RR", accent: "text-slate-200 border-slate-500/40 bg-slate-500/10" },
};

function detectEmoji(text: string): string {
  const t = text.toLowerCase();
  if (/\b(goal|scored?|scores?|back of the net|found? the net|into the net)\b/.test(t)) return "⚽";
  if (/\b(red card|sent off|dismissed|straight red|second yellow|sees red)\b/.test(t)) return "🟥";
  if (/\b(yellow card|caution|booked|booking)\b/.test(t)) return "🟨";
  if (/\b(penalt|spot kick|\bpk\b|from the spot)\b/.test(t)) return "⚡";
  if (/\b(save|saved|keeper|goalkeeper|stops|denied|fingertips|punch)\b/.test(t)) return "🧤";
  if (/\b(corner|corner kick)\b/.test(t)) return "🚩";
  if (/\b(substitut|sub |replaces|comes on|comes off|brought on)\b/.test(t)) return "🔄";
  if (/\b(var|video assistant|video review|checking)\b/.test(t)) return "📺";
  if (/\b(offside)\b/.test(t)) return "📍";
  if (/\b(half.?time|half time|\bht\b)\b/.test(t)) return "⏸️";
  if (/\b(full.?time|final whistle|full time|\bft\b)\b/.test(t)) return "🏁";
  if (/\b(foul|free.?kick|awarded)\b/.test(t)) return "🤕";
  if (/\b(shot|chance|attempt|effort|strike|header|volley)\b/.test(t)) return "🎯";
  return "";
}

function LineItem({ entry, matchId }: { entry: CommentaryEntry; matchId: string }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const sp = SPEAKERS[entry.speaker] ?? SPEAKERS.analyst;
  const isPanel = entry.speaker !== "analyst";
  const eventEmoji = detectEmoji(entry.text);
  // Unicode-safe base64 — commentary contains emoji, and bare btoa() throws on
  // any non-Latin-1 char (CLAUDE.md gotcha #1), which would crash this render.
  const storyId = `commentary-${matchId}-${btoa(unescape(encodeURIComponent(entry.text))).slice(0, 16)}`;

  async function handlePlay() {
    if (audioRef.current && audioUrl) {
      if (playing) { audioRef.current.pause(); setPlaying(false); }
      else { audioRef.current.play().catch(() => setPlaying(false)); setPlaying(true); }
      return;
    }
    setAudioLoading(true);
    setAudioError(false);
    try {
      const res = await fetch("/api/ai/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Panel lines carry the speaker persona → that panelist's own custom
        // voice (server-side mapping). Analyst keeps the default studio voice.
        body: JSON.stringify({ text: entry.text, storyId, ...(isPanel ? { persona: entry.speaker } : {}) }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!data.url) {
        console.error("[TTS] commentary playback failed:", data.error ?? "no url returned");
        setAudioError(true);
        setTimeout(() => setAudioError(false), 4000);
        return;
      }
      setAudioUrl(data.url);
      const audio = new Audio(data.url);
      audioRef.current = audio;
      audio.onended = () => setPlaying(false);
      await audio.play().catch(() => setPlaying(false));
      setPlaying(true);
    } catch (e) {
      console.error("[TTS] commentary request error:", e);
      setAudioError(true);
      setTimeout(() => setAudioError(false), 4000);
    } finally {
      setAudioLoading(false);
    }
  }

  return (
    <div className="flex items-start gap-2.5 group">
      <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${sp.accent}`} title={sp.name}>
          {eventEmoji || sp.short}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        {isPanel && (
          <span className={`text-[10px] font-black uppercase tracking-wider ${sp.accent.split(" ")[0]}`}>{sp.name}</span>
        )}
        <p className="text-sm text-slate-300 leading-relaxed">{entry.text}</p>
      </div>
      <div className="shrink-0 mt-0.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <ShareButton text={`${eventEmoji ? `${eventEmoji} ` : ""}${isPanel ? `${sp.name}: ` : ""}${entry.text} · Live AI commentary on studio0x.io`} />
        <button
          onClick={handlePlay}
          disabled={audioLoading}
          title={audioError ? "Audio unavailable" : `Listen${isPanel ? ` — ${sp.name}` : ""}`}
          className={`flex items-center justify-center w-6 h-6 rounded-full disabled:opacity-40 ${
            audioError ? "bg-red-500/10 text-red-400" : "bg-brand-gold/10 text-amber-400 hover:bg-brand-gold/20"
          }`}
        >
          {audioLoading ? <Loader2 size={10} className="animate-spin" /> : audioError ? <AlertCircle size={10} /> : playing ? <Pause size={10} /> : <Play size={10} />}
        </button>
      </div>
    </div>
  );
}

export default function MatchCommentary({ matchId }: { matchId: string }) {
  const [persona, setPersona] = useState<Persona>("roundtable");
  const [batches, setBatches] = useState<CommentaryBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  // Event count seen in the previous batch — lets the server detect quiet
  // periods and switch the panel to grounded banter.
  const lastEventsRef = useRef<number>(-1);

  const fetchCommentary = useCallback(async (p: Persona, reset = false) => {
    setLoading(true);
    setError(null);
    try {
      const since = reset ? -1 : lastEventsRef.current;
      const res = await fetch(`/api/matches/${matchId}/commentary?persona=${p}&limit=6${since >= 0 ? `&lastEvents=${since}` : ""}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as CommentaryData;
      setLiveStatus(data.status);
      lastEventsRef.current = data.eventCount;

      const newBatch: CommentaryBatch = {
        generatedAt: data.generatedAt,
        elapsed: data.elapsed ?? null,
        quiet: data.quiet ?? false,
        entries: data.lines.map(l => ({ ...l, generatedAt: data.generatedAt, elapsed: data.elapsed ?? null })),
      };

      setBatches(prev => {
        if (reset) return [newBatch];
        if (prev.some(b => b.generatedAt === newBatch.generatedAt)) return prev;
        return [newBatch, ...prev];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load commentary");
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  // Load on mount + persona change
  useEffect(() => { fetchCommentary(persona, true); }, [fetchCommentary, persona]);

  // Auto-refresh every 30s during live matches
  useEffect(() => {
    const id = setInterval(() => {
      if (liveStatus === "LIVE" || liveStatus === "HT") fetchCommentary(persona);
    }, 30_000);
    return () => clearInterval(id);
  }, [fetchCommentary, persona, liveStatus]);

  // Mobile browsers freeze timers while the page is backgrounded — the feed
  // looked dead after returning from another app (owner, mid-final 7/19).
  // Catch up the moment the page becomes visible again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && (liveStatus === "LIVE" || liveStatus === "HT")) {
        fetchCommentary(persona);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchCommentary, persona, liveStatus]);

  // Ticking freshness stamp so staleness is self-evident.
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);
  const newestAt = batches[0] ? new Date(batches[0].generatedAt).getTime() : null;
  const ageSec = newestAt ? Math.max(0, Math.round((nowTick - newestAt) / 1000)) : null;

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <Radio size={13} className="text-brand-gold" />
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">AI Commentary</span>
          <span className="text-[9px] text-slate-700 font-mono">claude-haiku</span>
          {liveStatus === "LIVE" && (
            <span className="flex items-center gap-1 text-[9px] text-red-400 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />LIVE
            </span>
          )}
          {ageSec !== null && (
            <span className={`text-[9px] font-mono ${ageSec > 90 ? "text-red-400" : "text-slate-600"}`} suppressHydrationWarning>
              updated {ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}m`} ago
            </span>
          )}
        </div>
        <button
          onClick={() => fetchCommentary(persona)}
          disabled={loading}
          className="text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
          title="Refresh commentary"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Mode switcher */}
      <div className="flex border-b border-brand-border">
        {(["roundtable", "analyst"] as Persona[]).map(p => {
          const m = PERSONA_TABS[p];
          const active = p === persona;
          return (
            <button
              key={p}
              onClick={() => setPersona(p)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${
                active ? "text-white bg-white/5 border-b-2 border-brand-gold" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <span>{m.emoji}</span>
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      <div className="px-4 py-4 min-h-[140px] space-y-5">
        {error && <div className="text-xs text-red-400 text-center py-4">{error}</div>}

        {loading && batches.length === 0 && (
          <div className="space-y-2.5">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-3 bg-slate-800 rounded animate-pulse" style={{ width: `${70 + i * 7}%` }} />
            ))}
          </div>
        )}

        {batches.map((batch, bi) => {
          const time = new Date(batch.generatedAt);
          const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          return (
            <div key={batch.generatedAt} className="space-y-3">
              {/* Timestamp divider */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-600">{timeStr}</span>
                {batch.elapsed ? (
                  <span className="text-[10px] text-slate-700">· {batch.elapsed}&apos;</span>
                ) : null}
                {batch.quiet && (
                  <span className="text-[9px] uppercase tracking-widest text-slate-600">· booth banter</span>
                )}
                {bi === 0 && loading && (
                  <Loader2 size={10} className="text-slate-600 animate-spin" />
                )}
                <div className="flex-1 h-px bg-brand-border" />
              </div>
              {/* Lines */}
              <div className="space-y-3">
                {batch.entries.map((entry, ei) => (
                  <LineItem key={ei} entry={entry} matchId={matchId} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {persona === "roundtable" && (
        <div className="px-4 py-2 border-t border-brand-border text-[9px] text-slate-700 font-mono">
          studio0x · fictional pundit characters · quiet-period banter is opinion grounded in real match data — never invented action
        </div>
      )}
    </div>
  );
}
