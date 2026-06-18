"use client";

import { useEffect, useState, useCallback } from "react";
import { Radio, RefreshCw } from "lucide-react";

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

const PERSONA_LABELS: Record<Persona, { label: string; emoji: string; color: string }> = {
  analyst:  { label: "Analyst",  emoji: "📊", color: "text-sky-400 border-sky-500/30 bg-sky-500/10" },
  fan:      { label: "Fan",      emoji: "📣", color: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
  comedian: { label: "Comedian", emoji: "🎭", color: "text-purple-400 border-purple-500/30 bg-purple-500/10" },
};

export default function MatchCommentary({ matchId }: { matchId: string }) {
  const [persona, setPersona] = useState<Persona>("analyst");
  const [data, setData] = useState<CommentaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetch_ = useCallback(async (p: Persona) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/commentary?persona=${p}&limit=6`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setData(await res.json());
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load commentary");
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  // Initial load
  useEffect(() => { fetch_(persona); }, [fetch_, persona]);

  // Auto-refresh every 45s when live
  useEffect(() => {
    const id = setInterval(() => { if (data?.status === "LIVE" || data?.status === "HT") fetch_(persona); }, 45_000);
    return () => clearInterval(id);
  }, [fetch_, persona, data?.status]);

  const meta = PERSONA_LABELS[persona];

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <Radio size={13} className="text-brand-gold" />
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">AI Commentary</span>
          <span className="text-[9px] text-slate-700 font-mono">claude-haiku</span>
        </div>
        <button
          onClick={() => fetch_(persona)}
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

      {/* Commentary lines */}
      <div className="px-4 py-4 min-h-[140px]">
        {error ? (
          <div className="text-xs text-red-400 text-center py-4">{error}</div>
        ) : loading && !data ? (
          <div className="space-y-2.5">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-3 bg-slate-800 rounded animate-pulse" style={{ width: `${70 + i * 7}%` }} />
            ))}
          </div>
        ) : data ? (
          <div className="space-y-3">
            {data.lines.map((line, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${meta.color}`}>
                  {meta.emoji}
                </span>
                <p className="text-sm text-slate-300 leading-relaxed">{line}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Footer */}
      {data && (
        <div className="px-4 pb-3 flex items-center justify-between text-[10px] text-slate-700">
          <span>{data.eventCount} match event{data.eventCount !== 1 ? "s" : ""} analysed</span>
          {lastRefresh && (
            <span>Updated {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          )}
        </div>
      )}
    </div>
  );
}
