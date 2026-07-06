"use client";

// Live prediction market panel — real Kalshi prices for THIS match.
// Shows the three-way market (home/draw/away) with live midpoints, bid/ask
// spread, per-outcome volume and tick direction since the last refresh.
// Honest by construction: renders only when a real market exists; there is
// no simulated fallback here.

import { useEffect, useRef, useState, useCallback } from "react";
import { TrendingUp, TrendingDown, Minus, Wifi } from "lucide-react";
import type { LiveData, KalshiLiveSnapshot, KalshiOutcomeDetail } from "@/lib/types";

type OutcomeKey = "home_win" | "draw" | "away_win";

function fmtCents(p: number): string {
  return `${Math.round(p * 100)}¢`;
}

function fmtVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return `${Math.round(v)}`;
}

function TickArrow({ delta }: { delta: number }) {
  if (delta > 0.004) return <TrendingUp size={11} className="text-brand-green" />;
  if (delta < -0.004) return <TrendingDown size={11} className="text-red-400" />;
  return <Minus size={11} className="text-slate-600" />;
}

function OutcomeTile({
  label, sub, price, detail, delta, highlight,
}: {
  label: string;
  sub: string;
  price: number;
  detail: KalshiOutcomeDetail;
  delta: number;
  highlight: "green" | "amber" | "sky";
}) {
  const color =
    highlight === "green" ? "text-brand-green" :
    highlight === "amber" ? "text-amber-400" : "text-sky-400";
  const spread = detail.bid !== null && detail.ask !== null
    ? `${fmtCents(detail.bid)}–${fmtCents(detail.ask)}`
    : null;

  return (
    <div className="bg-slate-900/50 rounded-xl px-3 py-3 text-center space-y-1">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{label}</div>
      <div className="flex items-center justify-center gap-1.5">
        <span className={`text-2xl font-black tabular-nums ${color}`}>{Math.round(price * 100)}%</span>
        <TickArrow delta={delta} />
      </div>
      <div className="text-[9px] text-slate-600 space-x-2">
        {spread && <span>bid/ask {spread}</span>}
        <span>vol {fmtVolume(detail.volume)}</span>
      </div>
      <div className="text-[9px] text-slate-700">{sub}</div>
    </div>
  );
}

export default function MatchMarkets({ matchId }: { matchId: string }) {
  const [snapshot, setSnapshot] = useState<KalshiLiveSnapshot | null>(null);
  const [status, setStatus] = useState("NS");
  const [homeTeam, setHomeTeam] = useState<{ name: string; code: string } | null>(null);
  const [awayTeam, setAwayTeam] = useState<{ name: string; code: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const prevRef = useRef<Record<OutcomeKey, number> | null>(null);
  const [deltas, setDeltas] = useState<Record<OutcomeKey, number>>({ home_win: 0, draw: 0, away_win: 0 });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/matches/${matchId}/live`);
      if (!res.ok) return;
      const data = await res.json() as LiveData;
      setStatus(data.match.status);
      setHomeTeam({ name: data.match.homeTeam.name, code: data.match.homeTeam.code });
      setAwayTeam({ name: data.match.awayTeam.name, code: data.match.awayTeam.code });
      const k = data.kalshiLive ?? null;
      if (k) {
        const prev = prevRef.current;
        if (prev) {
          setDeltas({
            home_win: k.home_win - prev.home_win,
            draw: k.draw - prev.draw,
            away_win: k.away_win - prev.away_win,
          });
        }
        prevRef.current = { home_win: k.home_win, draw: k.draw, away_win: k.away_win };
      }
      setSnapshot(k);
    } catch {
      // keep last snapshot — panel simply stops ticking on network errors
    } finally {
      setLoaded(true);
    }
  }, [matchId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  // No real market found (or still loading): render nothing rather than a
  // fabricated placeholder — this panel only ever shows live market data.
  if (!loaded || !snapshot || !homeTeam || !awayTeam) return null;

  const isLive = status === "LIVE" || status === "HT";
  const isDone = status === "FT";

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">
            {isDone ? "Match Market · Settled" : isLive ? "Live Match Market" : "Pre-Match Market"}
          </span>
          <span className="text-[9px] text-slate-700 font-mono">kalshi</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Wifi size={11} className={isDone ? "text-slate-600" : "text-brand-green"} />
          <span className={`text-[9px] font-semibold ${isDone ? "text-slate-600" : "text-brand-green"}`}>
            {isDone ? "final prices" : "live prices"}
          </span>
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="grid grid-cols-3 gap-2">
          <OutcomeTile
            label={homeTeam.name}
            sub={`${homeTeam.code} win`}
            price={snapshot.home_win}
            detail={snapshot.detail.home_win}
            delta={deltas.home_win}
            highlight="green"
          />
          <OutcomeTile
            label="Draw"
            sub="90-min draw"
            price={snapshot.draw}
            detail={snapshot.detail.draw}
            delta={deltas.draw}
            highlight="amber"
          />
          <OutcomeTile
            label={awayTeam.name}
            sub={`${awayTeam.code} win`}
            price={snapshot.away_win}
            detail={snapshot.detail.away_win}
            delta={deltas.away_win}
            highlight="sky"
          />
        </div>
      </div>

      <div className="border-t border-brand-border/50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[9px] text-slate-600">
        <span>
          Total volume <span className="text-slate-400 font-semibold">{fmtVolume(snapshot.volume)}</span> contracts
          {snapshot.tickers.home_win && (
            <span className="font-mono text-slate-700 ml-2 hidden sm:inline">{snapshot.tickers.home_win.split("-").slice(0, 2).join("-")}</span>
          )}
        </span>
        <span>Live Kalshi midpoints · market prices, not predictions</span>
      </div>
    </div>
  );
}
