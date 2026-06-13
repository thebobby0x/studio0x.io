"use client";

import { useEffect, useState, useCallback } from "react";
import { Trophy, Wifi } from "lucide-react";
import { getFlag } from "@/lib/flags";
import type { TournamentWinnerMarket } from "@/lib/polymarket";

interface TournamentData {
  markets: TournamentWinnerMarket[];
  totalLiquidity: number;
  source: "live" | "cache";
}

function ProbBar({ prob, max }: { prob: number; max: number }) {
  const w = max > 0 ? (prob / max) * 100 : 0;
  return (
    <div className="h-1 bg-brand-border rounded-full overflow-hidden flex-1">
      <div className="h-full rounded-full bg-brand-gold/70 transition-all duration-500" style={{ width: `${w}%` }} />
    </div>
  );
}

interface Props {
  highlightTlas?: string[];
  limit?: number;
}

export default function TournamentOddsPanel({ highlightTlas = [], limit = 16 }: Props) {
  const [data, setData] = useState<TournamentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tournament-odds");
      if (!res.ok) { setLoading(false); return; }
      setData(await res.json() as TournamentData);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 300_000); // 5 min — these move slowly
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-brand-card border border-brand-border p-4 space-y-2 animate-pulse">
        {[1,2,3,4,5,6].map(i => (
          <div key={i} className="h-8 rounded-lg bg-brand-border/40" />
        ))}
      </div>
    );
  }

  if (!data || data.markets.length === 0) return null;

  const displayCount = expanded ? data.markets.length : limit;
  const visible = data.markets.slice(0, displayCount);
  const maxProb = data.markets[0]?.probability ?? 1;
  const highlightSet = new Set(highlightTlas.map(t => t.toUpperCase()));

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <Trophy size={13} className="text-brand-gold" />
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            World Cup Winner Odds
          </span>
        </div>
        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-semibold">
          <Wifi size={9} /> Polymarket
        </span>
      </div>

      <div className="divide-y divide-brand-border/30">
        {visible.map((m, i) => {
          const isHighlighted = m.tla ? highlightSet.has(m.tla.toUpperCase()) : false;
          const flag = m.tla ? getFlag(m.tla) : "🏳";
          return (
            <div
              key={m.team}
              className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${isHighlighted ? "bg-brand-gold/5" : ""}`}
            >
              <span className="text-slate-600 text-xs w-5 text-right tabular-nums">{i + 1}</span>
              <span className="text-base w-6 text-center">{flag}</span>
              <span className={`flex-1 text-sm font-semibold truncate ${isHighlighted ? "text-white" : "text-slate-300"}`}>
                {m.team}
              </span>
              <ProbBar prob={m.probability} max={maxProb} />
              <span className={`w-12 text-right text-sm font-black tabular-nums ${isHighlighted ? "text-brand-gold" : "text-slate-400"}`}>
                {Math.round(m.probability * 100)}%
              </span>
            </div>
          );
        })}
      </div>

      {data.markets.length > limit && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full px-4 py-2.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors border-t border-brand-border/50 text-center"
        >
          {expanded ? `Show fewer` : `Show all ${data.markets.length} teams ↓`}
        </button>
      )}

      <div className="px-4 py-2 border-t border-brand-border/50 text-[10px] text-slate-600">
        {data.markets.length} teams · polymarket.com · updates every 5 min
      </div>
    </div>
  );
}
