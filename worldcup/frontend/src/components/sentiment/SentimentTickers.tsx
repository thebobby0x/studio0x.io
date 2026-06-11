"use client";

import { useEffect, useState, useCallback } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { KalshiMarket } from "@/lib/types";

const OUTCOME_LABELS: Record<string, string> = {
  home_win: "MEX Win",
  draw:     "Draw",
  away_win: "RSA Win",
};

const OUTCOME_COLORS: Record<string, string> = {
  home_win: "text-brand-green border-brand-green/30 bg-brand-green/5",
  draw:     "text-amber-400 border-amber-400/30 bg-amber-400/5",
  away_win: "text-sky-400 border-sky-400/30 bg-sky-400/5",
};

function ProbabilityBar({ price }: { price: number }) {
  return (
    <div className="relative w-full h-1.5 bg-brand-border rounded-full overflow-hidden mt-2">
      <div
        className="absolute h-full rounded-full bg-current opacity-70 transition-all duration-500"
        style={{ width: `${price * 100}%` }}
      />
    </div>
  );
}

function TickerCard({ market, prev }: { market: KalshiMarket; prev?: number }) {
  const pct = Math.round(market.price * 100);
  const delta = prev !== undefined ? market.price - prev : 0;
  const colorClass = OUTCOME_COLORS[market.outcome] ?? "text-slate-400 border-brand-border bg-brand-card";

  const Icon = delta > 0.005 ? TrendingUp : delta < -0.005 ? TrendingDown : Minus;
  const deltaColor = delta > 0.005 ? "text-green-400" : delta < -0.005 ? "text-red-400" : "text-slate-500";

  return (
    <div className={`rounded-xl border p-4 flex-1 min-w-[140px] ${colorClass}`}>
      <div className="text-xs font-medium uppercase tracking-widest opacity-70 mb-1">
        {OUTCOME_LABELS[market.outcome] ?? market.outcome}
      </div>
      <div className="flex items-end justify-between">
        <span className="text-3xl font-black tabular-nums">{pct}%</span>
        <span className={`flex items-center gap-0.5 text-xs font-semibold ${deltaColor}`}>
          <Icon size={12} />
          {Math.abs(delta * 100).toFixed(1)}
        </span>
      </div>
      <ProbabilityBar price={market.price} />
      <div className="mt-2 text-[10px] opacity-50">{market.volume.toLocaleString()} contracts · {market.contractSlug}</div>
    </div>
  );
}

export default function SentimentTickers({ matchId }: { matchId: string }) {
  const [markets, setMarkets] = useState<KalshiMarket[]>([]);
  const [prev, setPrev] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/matches/${matchId}/live`);
      const data = await res.json();
      const incoming: KalshiMarket[] = data.markets ?? [];
      setMarkets((current) => {
        const prevPrices: Record<string, number> = {};
        for (const m of current) prevPrices[m.outcome] = m.price;
        setPrev(prevPrices);
        return incoming;
      });
    } catch {}
  }, [matchId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (markets.length === 0) {
    return (
      <div className="flex gap-3">
        {[1, 2, 3].map((i) => <div key={i} className="flex-1 h-28 rounded-xl bg-brand-card border border-brand-border animate-pulse" />)}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Kalshi Prediction Markets</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-border text-slate-400">LIVE IMPLIED PROBABILITY</span>
      </div>
      <div className="flex gap-3 flex-wrap">
        {markets.map((m) => (
          <TickerCard key={m.outcome} market={m} prev={prev[m.outcome]} />
        ))}
      </div>
    </div>
  );
}
