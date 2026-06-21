"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Radio, RefreshCw, Play, Pause, Loader2 } from "lucide-react";

type Persona = "analyst" | "fan" | "comedian";

interface CommentaryData {
  persona: Persona;
  score: string;
  status: string;
  elapsed: number;
  lines: string[];
  eventCount: number;
  generatedAt: string;
}

interface CommentaryEntry {
  text: string;
  generatedAt: string;
  elapsed: number | null;
}

interface CommentaryBatch {
  generatedAt: string;
  elapsed: number | null;
  entries: CommentaryEntry[];
}

const PERSONA_LABELS: Record<Persona, { label: string; emoji: string; color: string }> = {
  analyst:  { label: "Analyst",  emoji: "📊", color: "text-sky-400 border-sky-500/30 bg-sky-500/10" },
  fan:      { label: "Fan",      emoji: "📣", color: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
  comedian: { label: "Comedian", emoji: "🎭", color: "text-purple-400 border-purple-500/30 bg-purple-500/10" },
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

function LineItem({
  entry,
  matchId,
  personaEmoji,
  personaColor,
}: {
  entry: CommentaryEntry;
  matchId: string;
  personaEmoji: string;
  personaColor: string;
}) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const eventEmoji = detectEmoji(entry.text);
  const storyId = `commentary-${matchId}-${btoa(entry.text).slice(0, 16)}`;

  async function handlePlay() {
    if (audioRef.current && audioUrl) {
      if (playing) { audioRef.current.pause(); setPlaying(false); }
      else { audioRef.current.play(); setPlaying(true); }
      return;
    }
    setAudioLoading(true);
    try {
      const res = await fetch("/api/ai/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: entry.text, storyId }),
      });
      const data = await res.json() as { url?: string };
      if (!data.url) return;
      setAudioUrl(data.url);
      const audio = new Audio(data.url);
      audioRef.current = audio;
      audio.onended = () => setPlaying(false);
      audio.play();
      setPlaying(true);
    } finally {
      setAudioLoading(false);
    }
  }

  return (
    <div className="flex items-start gap-2.5 group">
      <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${personaColor}`}>
          {eventEmoji || personaEmoji}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-300 leading-relaxed">{entry.text}</p>
      </div>
      <button
        onClick={handlePlay}
        disabled={audioLoading}
        title="Listen"
        className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex items-center justify-center w-6 h-6 rounded-full bg-brand-gold/10 text-amber-400 hover:bg-brand-gold/20 disabled:opacity-40"
      >
        {audioLoading ? <Loader2 size={10} className="animate-spin" /> : playing ? <Pause size={10} /> : <Play size={10} />}
      </button>
    </div>
  );
}

export default function MatchCommentary({ matchId }: { matchId: string }) {
  const [persona, setPersona] = useState<Persona>("analyst");
  const [batches, setBatches] = useState<CommentaryBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);

  const fetchCommentary = useCallback(async (p: Persona, reset = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/commentary?persona=${p}&limit=6`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as CommentaryData;
      setLiveStatus(data.status);

      const newBatch: CommentaryBatch = {
        generatedAt: data.generatedAt,
        elapsed: data.elapsed ?? null,
        entries: data.lines.map(text => ({ text, generatedAt: data.generatedAt, elapsed: data.elapsed ?? null })),
      };

      setBatches(prev => {
        if (reset) return [newBatch];
        // Avoid duplicates: skip if same generatedAt already exists
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

  // Auto-refresh every 45s during live matches
  useEffect(() => {
    const id = setInterval(() => {
      if (liveStatus === "LIVE" || liveStatus === "HT") fetchCommentary(persona);
    }, 45_000);
    return () => clearInterval(id);
  }, [fetchCommentary, persona, liveStatus]);

  const meta = PERSONA_LABELS[persona];

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

      {/* Persona switcher */}
      <div className="flex border-b border-brand-border">
        {(["analyst", "fan", "comedian"] as Persona[]).map(p => {
          const m = PERSONA_LABELS[p];
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
                  <span className="text-[10px] text-slate-700">· {batch.elapsed}'</span>
                ) : null}
                {bi === 0 && loading && (
                  <Loader2 size={10} className="text-slate-600 animate-spin" />
                )}
                <div className="flex-1 h-px bg-brand-border" />
              </div>
              {/* Lines */}
              <div className="space-y-3">
                {batch.entries.map((entry, ei) => (
                  <LineItem
                    key={ei}
                    entry={entry}
                    matchId={matchId}
                    personaEmoji={meta.emoji}
                    personaColor={meta.color}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
