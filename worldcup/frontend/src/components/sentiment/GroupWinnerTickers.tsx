"use client";

import { useEffect, useState, useCallback } from "react";
import { TrendingUp, Wifi, FlaskConical } from "lucide-react";
import type { GroupWinnerData, GroupWinnerMarket } from "@/lib/polymarket";

function TeamRow({
  market,
  highlighted,
  maxProb,
}: {
  market: GroupWinnerMarket;
  highlighted: boolean;
  maxProb: number;
}) {
  const pct = Math.round(market.probability * 100);
  const barW = maxProb > 0 ? (market.probability / maxProb) * 100 : 0;

  return (
    <div className={`flex items-center gap-3 py-2.5 px-4 rounded-lg transition-colors ${
      highlighted ? "bg-brand-green/8" : ""
    }`}>
      <div className="w-5 flex-shrink-0">
        {highlighted && (
          <span className="w-1.5 h-1.5 rounded-full bg-brand-green inline-block" />
        )}
      </div>
      <div className={`flex-1 min-w-0 text-sm font-semibold truncate ${
        highlighted ? "text-white" : "text-slate-400"
      }`}>
        {market.team}
      </div>
      <div className="w-32 flex-shrink-0">
        <div className="h-1.5 bg-brand-border rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              highlighted ? "bg-brand-green" : "bg-slate-600"
            }`}
            style={{ width: `${barW}%` }}
          />
        </div>
      </div>
      <div className={`w-12 text-right text-sm font-black tabular-nums ${
        highlighted ? "text-white" : "text-slate-500"
      }`}>
        {pct}%
      </div>
    </div>
  );
}

interface Props {
  group: string;
  highlightTeams?: string[];
}

export default function GroupWinnerTickers({ group, highlightTeams = [] }: Props) {
  const [data, setData] = useState<GroupWinnerData | null>(null);
  const [loading, setLoading] = useState(true);

  const normalizeTeam = (s: string) => s.toLowerCase().trim();
  const highlightSet = new Set(highlightTeams.map(normalizeTeam));

  const isHighlighted = useCallback(
    (teamName: string) => {
      const norm = normalizeTeam(teamName);
      // Exact match or substring match (handles "USA"/"United States" edge cases)
      if (highlightSet.has(norm)) return true;
      for (const h of highlightSet) {
        if (norm.includes(h) || h.includes(norm)) return true;
      }
      return false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [highlightTeams.join(",")]
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/group-markets/${encodeURIComponent(group)}`);
      if (!res.ok) { setLoading(false); return; }
      const json = (await res.json()) as GroupWinnerData;
      setData(json);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [group]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-brand-card border border-brand-border p-4 space-y-2 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-9 rounded-lg bg-brand-border/40" />
        ))}
      </div>
    );
  }

  if (!data || data.markets.length === 0) return null;

  const maxProb = data.markets[0]?.probability ?? 1;
  const totalVol = data.markets.reduce((s, m) => s + m.volume, 0);
  const isLive = data.source === "live" || data.source === "cache";

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <TrendingUp size={13} className="text-brand-green" />
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Group {group} Winner Odds
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isLive ? (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-semibold">
              <Wifi size={9} /> Polymarket
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-brand-border text-slate-500">
              <FlaskConical size={9} /> No data
            </span>
          )}
        </div>
      </div>

      <div className="py-1">
        {data.markets.map((m) => (
          <TeamRow
            key={m.team}
            market={m}
            highlighted={isHighlighted(m.team)}
            maxProb={maxProb}
          />
        ))}
      </div>

      <div className="px-4 py-2 border-t border-brand-border/50 text-[10px] text-slate-600">
        ${totalVol.toLocaleString(undefined, { maximumFractionDigits: 0 })} vol · {data.totalLiquidity > 0 ? `$${data.totalLiquidity.toLocaleString(undefined, { maximumFractionDigits: 0 })} liq · ` : ""}polymarket.com
      </div>
    </div>
  );
}
