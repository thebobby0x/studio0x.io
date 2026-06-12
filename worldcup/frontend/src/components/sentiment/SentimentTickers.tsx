"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { TrendingUp, TrendingDown, Minus, Wifi, FlaskConical, Radio } from "lucide-react";
import type { KalshiMarket, DataSources } from "@/lib/types";
import { KALSHI_WS_BASE } from "@/lib/kalshi";

function outcomeLabels(homeCode: string, awayCode: string): Record<string, string> {
  return {
    home_win: `${homeCode} Win`,
    draw:     "Draw",
    away_win: `${awayCode} Win`,
  };
}

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

function TickerCard({
  market,
  prev,
  labels,
  wsConnected,
}: {
  market: KalshiMarket;
  prev?: number;
  labels: Record<string, string>;
  wsConnected: boolean;
}) {
  const pct = Math.round(market.price * 100);
  const delta = prev !== undefined ? market.price - prev : 0;
  const colorClass = OUTCOME_COLORS[market.outcome] ?? "text-slate-400 border-brand-border bg-brand-card";

  const Icon = delta > 0.005 ? TrendingUp : delta < -0.005 ? TrendingDown : Minus;
  const deltaColor = delta > 0.005 ? "text-green-400" : delta < -0.005 ? "text-red-400" : "text-slate-500";

  return (
    <div className={`rounded-xl border p-4 flex-1 min-w-[140px] ${colorClass}`}>
      <div className="text-xs font-medium uppercase tracking-widest opacity-70 mb-1">
        {labels[market.outcome] ?? market.outcome}
      </div>
      <div className="flex items-end justify-between">
        <span
          className={`text-3xl font-black tabular-nums${wsConnected ? " animate-pulse" : ""}`}
          key={`${market.outcome}-${pct}`}
        >
          {pct}%
        </span>
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
  const [marketSource, setMarketSource] = useState<DataSources["markets"]>("sim");
  const [labels, setLabels] = useState<Record<string, string>>({ home_win: "Home Win", draw: "Draw", away_win: "Away Win" });
  const [wsConnected, setWsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const tickersRef = useRef<string[]>([]);
  const mountedRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT = 3;

  const connectWs = useCallback((tickers: string[]) => {
    // Skip if already open or connecting
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    // Skip if browser doesn't support WebSocket
    if (typeof WebSocket === "undefined") return;

    const ws = new WebSocket(KALSHI_WS_BASE);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      reconnectAttemptsRef.current = 0;
      ws.send(
        JSON.stringify({
          id: 1,
          cmd: "subscribe",
          params: { channels: ["ticker"], market_tickers: tickers },
        })
      );
      setWsConnected(true);
    };

    ws.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(event.data as string) as {
          type?: string;
          msg?: {
            market_ticker?: string;
            yes_bid?: number;
            yes_ask?: number;
            last_price?: number;
          };
        };

        if (msg.type === "ticker" && msg.msg?.market_ticker) {
          const { market_ticker, yes_bid, yes_ask, last_price } = msg.msg;

          // WS prices are integers 0–99 (cents); divide by 100
          let price: number;
          if (yes_bid !== undefined && yes_ask !== undefined) {
            price = (yes_bid + yes_ask) / 2 / 100;
          } else if (last_price !== undefined) {
            price = last_price / 100;
          } else {
            return;
          }

          setMarkets((current) => {
            const updated = current.map((m) => {
              if (m.contractSlug === market_ticker) {
                return { ...m, price };
              }
              return m;
            });
            return updated;
          });
          setMarketSource("live");
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setWsConnected(false);

      // Attempt reconnect up to MAX_RECONNECT times
      if (reconnectAttemptsRef.current < MAX_RECONNECT && tickersRef.current.length > 0) {
        reconnectAttemptsRef.current += 1;
        setTimeout(() => {
          if (mountedRef.current) {
            connectWs(tickersRef.current);
          }
        }, 3000);
      }
    };
  }, []); // no deps — uses refs only

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/matches/${matchId}/live`);
      const data = await res.json();
      const incoming: KalshiMarket[] = data.markets ?? [];
      setMarketSource(data.dataSources?.markets ?? "sim");
      if (data.match?.homeTeam?.code && data.match?.awayTeam?.code) {
        setLabels(outcomeLabels(data.match.homeTeam.code, data.match.awayTeam.code));
      }
      setMarkets((current) => {
        const prevPrices: Record<string, number> = {};
        for (const m of current) prevPrices[m.outcome] = m.price;
        setPrev(prevPrices);
        return incoming;
      });

      // Extract real Kalshi tickers from the response
      if (data.kalshiTickers) {
        const kt = data.kalshiTickers as { home_win: string; draw: string; away_win: string };
        const realTickers = [kt.home_win, kt.draw, kt.away_win].filter(
          (t) => typeof t === "string" && t.startsWith("KX")
        );
        if (realTickers.length > 0) {
          tickersRef.current = realTickers;
          // Only attempt WS connection if not already connected
          if (
            !wsRef.current ||
            (wsRef.current.readyState !== WebSocket.OPEN &&
              wsRef.current.readyState !== WebSocket.CONNECTING)
          ) {
            connectWs(realTickers);
          }
        }
      }
    } catch {
      // Ignore fetch errors
    }
  }, [matchId, connectWs]);

  useEffect(() => {
    mountedRef.current = true;
    load();

    // Poll more slowly when WS is connected; faster when not
    const getInterval = () => (wsConnected ? 60_000 : 5_000);

    let intervalId: ReturnType<typeof setInterval>;

    const scheduleNext = () => {
      intervalId = setInterval(() => {
        load();
      }, getInterval());
    };

    scheduleNext();

    return () => {
      clearInterval(intervalId);
    };
  }, [matchId, wsConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup WebSocket on unmount or matchId change
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
        wsRef.current = null;
      }
      tickersRef.current = [];
      reconnectAttemptsRef.current = 0;
    };
  }, [matchId]);

  if (markets.length === 0) {
    return (
      <div className="flex gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex-1 h-28 rounded-xl bg-brand-card border border-brand-border animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Kalshi Prediction Markets</span>
        {wsConnected ? (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 font-semibold">
            <Radio size={9} className="animate-pulse" /> Kalshi Live
          </span>
        ) : marketSource === "live" || marketSource === "cache" ? (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-semibold">
            <Wifi size={9} /> Kalshi
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-brand-border text-slate-500">
            <FlaskConical size={9} /> Simulated
          </span>
        )}
      </div>
      <div className="flex gap-3 flex-wrap">
        {markets.map((m) => (
          <TickerCard key={m.outcome} market={m} prev={prev[m.outcome]} labels={labels} wsConnected={wsConnected} />
        ))}
      </div>
    </div>
  );
}
