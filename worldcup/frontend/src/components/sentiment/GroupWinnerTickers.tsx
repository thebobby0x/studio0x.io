"use client";

import { useEffect, useState, useCallback } from "react";
import { TrendingUp, Wifi } from "lucide-react";
import type { GroupWinnerMarket } from "@/lib/polymarket";
import type { RoundProbabilities } from "@/lib/probabilities";

interface EnrichedMarket extends GroupWinnerMarket {
  advanceProb?: number;
  path?: RoundProbabilities;
}

interface GroupData {
  group: string;
  markets: EnrichedMarket[];
  totalLiquidity: number;
  source: "live" | "cache";
}

function pct(n: number) { return `${Math.round(n * 100)}%`; }
function pctColor(n: number) {
  if (n >= 0.5) return "text-brand-green";
  if (n >= 0.25) return "text-amber-400";
  return "text-slate-500";
}

function TeamRow({
  market,
  highlighted,
  maxProb,
  showPath,
}: {
  market: EnrichedMarket;
  highlighted: boolean;
  maxProb: number;
  showPath: boolean;
}) {
  const barW = maxProb > 0 ? (market.probability / maxProb) * 100 : 0;
  const adv = market.advanceProb ?? 0;

  return (
    <div className={`flex items-center gap-3 py-2.5 px-4 transition-colors ${highlighted ? "bg-brand-green/8" : ""}`}>
      <div className="w-4 flex-shrink-0 flex items-center">
        {highlighted && <span className="w-1.5 h-1.5 rounded-full bg-brand-green" />}
      </div>

      {/* Team name */}
      <div className={`flex-1 min-w-0 text-sm font-semibold truncate ${highlighted ? "text-white" : "text-slate-400"}`}>
        {market.team}
      </div>

      {/* Probability bar + win group % */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden sm:block w-24">
          <div className="h-1.5 bg-brand-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${highlighted ? "bg-brand-green" : "bg-slate-600"}`}
              style={{ width: `${barW}%` }}
            />
          </div>
        </div>
        <span className={`w-10 text-right text-xs font-bold tabular-nums ${highlighted ? "text-white" : "text-slate-500"}`}>
          {pct(market.probability)}
        </span>
      </div>

      {/* Advance probability — the derived stat */}
      {adv > 0 && (
        <div className="hidden xs:flex flex-col items-end shrink-0 w-16">
          <span className={`text-[10px] font-bold tabular-nums ${pctColor(adv)}`}>{pct(adv)}</span>
          <span className="text-[9px] text-slate-600 uppercase tracking-wider">Advance</span>
        </div>
      )}

      {/* Tournament win path */}
      {showPath && market.path && (
        <div className="hidden md:flex flex-col items-end shrink-0 w-12">
          <span className="text-[10px] font-bold tabular-nums text-brand-gold">{pct(market.path.winTournament)}</span>
          <span className="text-[9px] text-slate-600 uppercase tracking-wider">Win</span>
        </div>
      )}
    </div>
  );
}

interface Props {
  group: string;
  highlightTeams?: string[];
  showTournamentOdds?: boolean;
}

export default function GroupWinnerTickers({ group, highlightTeams = [], showTournamentOdds = true }: Props) {
  const [data, setData] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(true);

  const normalizeTeam = (s: string) => s.toLowerCase().trim();
  const highlightSet = new Set(highlightTeams.map(normalizeTeam));

  const isHighlighted = useCallback(
    (teamName: string) => {
      const norm = normalizeTeam(teamName);
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
      const json = await res.json() as GroupData;
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
          <div key={i} className="h-10 rounded-lg bg-brand-border/40" />
        ))}
      </div>
    );
  }

  if (!data || data.markets.length === 0) return null;

  const maxProb = data.markets[0]?.probability ?? 1;
  const hasAdvance = data.markets.some(m => (m.advanceProb ?? 0) > 0);
  const hasPath = showTournamentOdds && data.markets.some(m => m.path);
  const totalVol = data.markets.reduce((s, m) => s + m.volume, 0);

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <TrendingUp size={13} className="text-brand-green" />
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Group {group} Prediction Markets
          </span>
        </div>
        <div className="flex items-center gap-3">
          {hasAdvance && (
            <span className="hidden sm:block text-[10px] text-slate-600 uppercase tracking-wider">
              Win Group · Advance · {hasPath ? "Win Cup" : ""}
            </span>
          )}
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400 font-semibold">
            <Wifi size={9} /> Polymarket
          </span>
        </div>
      </div>

      <div className="py-1">
        {data.markets.map((m) => (
          <TeamRow
            key={m.team}
            market={m}
            highlighted={isHighlighted(m.team)}
            maxProb={maxProb}
            showPath={hasPath}
          />
        ))}
      </div>

      <div className="px-4 py-2 border-t border-brand-border/50 text-[10px] text-slate-600 flex items-center gap-3">
        <span>${totalVol.toLocaleString(undefined, { maximumFractionDigits: 0 })} vol</span>
        {data.totalLiquidity > 0 && <span>${data.totalLiquidity.toLocaleString(undefined, { maximumFractionDigits: 0 })} liq</span>}
        <span className="text-slate-700">· Advance % + Win Cup path are Studio0x models derived from Polymarket prices · polymarket.com</span>
      </div>
    </div>
  );
}
