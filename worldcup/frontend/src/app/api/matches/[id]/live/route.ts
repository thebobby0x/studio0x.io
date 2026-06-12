import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { simulateStats, simulateMarkets, elapsedFromDate, statusFromElapsed } from "@/lib/simulation";
import { getKalshiMarkets } from "@/lib/kalshi";
import { getFDLiveMatch } from "@/lib/footballData";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const match = await prisma.match.findUnique({
    where: { id },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const homeCode = match.homeTeam.code;
  const awayCode = match.awayTeam.code;

  // Fetch live data from both external sources in parallel
  const [fdResult, kalshiResult] = await Promise.allSettled([
    getFDLiveMatch(homeCode, awayCode, match.date),
    getKalshiMarkets(homeCode, awayCode),
  ]);

  const fdMatch  = fdResult.status  === "fulfilled" ? fdResult.value  : null;
  const kalshi   = kalshiResult.status === "fulfilled" ? kalshiResult.value : null;

  // Match state: real football-data.org > simulation
  const simElapsed = elapsedFromDate(match.date);
  const status     = fdMatch?.status ?? statusFromElapsed(simElapsed);
  // HT means minute is always 45; use API minute when non-zero, else simulation
  const elapsed    = status === "HT" ? 45
                   : (fdMatch && fdMatch.elapsed > 0) ? fdMatch.elapsed
                   : simElapsed;
  const homeScore  = fdMatch?.homeScore ?? match.homeScore;
  const awayScore  = fdMatch?.awayScore ?? match.awayScore;

  // Detailed stats — always simulated (no free live source exists)
  const metrics: Record<string, Record<string, number>> = {
    [homeCode]: simulateStats(homeCode, elapsed, match.fixture) as unknown as Record<string, number>,
    [awayCode]: simulateStats(awayCode, elapsed, match.fixture) as unknown as Record<string, number>,
  };

  // Market prices: real Kalshi > simulation
  const simPrices = simulateMarkets(elapsed, match.fixture);
  const priceMap = kalshi
    ? { home_win: kalshi.home_win, draw: kalshi.draw, away_win: kalshi.away_win }
    : simPrices;

  const dbMarkets = await prisma.kalshiMarket.findMany({ where: { matchId: id } });
  const enrichedMarkets = dbMarkets.map((m) => ({
    ...m,
    price: priceMap[m.outcome as keyof typeof priceMap] ?? m.price,
    contractSlug: kalshi?.tickers[m.outcome as keyof typeof kalshi.tickers] ?? m.contractSlug,
    volume: kalshi ? kalshi.volume / dbMarkets.length : m.volume,
  }));

  // Persist updated state non-blocking
  prisma.match.update({ where: { id }, data: { elapsed, status, homeScore, awayScore } }).catch(() => {});

  return NextResponse.json({
    match: { ...match, elapsed, status, homeScore, awayScore },
    metrics,
    markets: enrichedMarkets,
    dataSources: {
      match:   fdMatch  ? fdMatch.source  : "sim",
      markets: kalshi   ? kalshi.source   : "sim",
      stats:   "sim",
    },
  });
}
