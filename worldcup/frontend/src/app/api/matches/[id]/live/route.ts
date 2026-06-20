import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { simulateStats, simulateMarkets, elapsedFromDate, statusFromElapsed } from "@/lib/simulation";
import { getKalshiMarkets } from "@/lib/kalshi";
import { getFDLiveMatch } from "@/lib/footballData";
import { getTeamTournamentProb } from "@/lib/polymarket";
import { liveWinProbability, preMatchWinProbFromTournamentOdds } from "@/lib/probabilities";

const AF_BASE = "https://v3.football.api-sports.io";
const STATUS_MAP: Record<string, string> = {
  NS: "NS", "1H": "LIVE", HT: "HT", "2H": "LIVE",
  ET: "LIVE", BT: "HT", P: "LIVE",
  FT: "FT", AET: "FT", PEN: "FT",
  PST: "NS", CANC: "NS", AWD: "FT", WO: "FT",
};

// Per-fixture cache: 30s for live/HT, 5 min for NS/FT (no point polling finished games)
type AFResult = { homeScore: number | null; awayScore: number | null; status: string; elapsed: number };
const _afCache = new Map<number, { ts: number; ttl: number; data: AFResult }>();

async function getAFFixture(fixtureId: number): Promise<AFResult | null> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return null;
  const cached = _afCache.get(fixtureId);
  if (cached && Date.now() - cached.ts < cached.ttl) return cached.data;
  try {
    const res = await fetch(`${AF_BASE}/fixtures?id=${fixtureId}`, {
      headers: { "x-apisports-key": key },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const f = json.response?.[0];
    if (!f) return null;
    const data: AFResult = {
      homeScore: f.goals.home as number | null,
      awayScore: f.goals.away as number | null,
      status: (STATUS_MAP[f.fixture.status.short] ?? "NS") as string,
      elapsed: (f.fixture.status.elapsed ?? 0) as number,
    };
    const isLive = data.status === "LIVE" || data.status === "HT";
    _afCache.set(fixtureId, { ts: Date.now(), ttl: isLive ? 15_000 : 300_000, data });
    return data;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const match = await prisma.match.findUnique({
    where: { id },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const homeCode = match.homeTeam.code;
  const awayCode = match.awayTeam.code;

  // Fetch live data in parallel — api-football (primary) + fd.org + markets + odds
  const [afResult, fdResult, kalshiResult, homeTournamentProb, awayTournamentProb] = await Promise.allSettled([
    getAFFixture(match.fixture),
    getFDLiveMatch(homeCode, awayCode, match.date),
    getKalshiMarkets(homeCode, awayCode, new Date(match.date)),
    getTeamTournamentProb(homeCode),
    getTeamTournamentProb(awayCode),
  ]);

  // api-football is primary source for score/status; fall back to football-data.org then DB
  const afMatch  = afResult.status  === "fulfilled" ? afResult.value  : null;
  const fdMatch  = fdResult.status  === "fulfilled" ? fdResult.value  : null;
  const kalshi   = kalshiResult.status === "fulfilled" ? kalshiResult.value : null;
  const homeW    = homeTournamentProb.status === "fulfilled" ? homeTournamentProb.value : null;
  const awayW    = awayTournamentProb.status === "fulfilled" ? awayTournamentProb.value : null;

  // Match state — api-football > football-data.org > simulation
  const simElapsed = elapsedFromDate(match.date);
  const status = afMatch?.status ?? fdMatch?.status ?? statusFromElapsed(simElapsed);
  const elapsed = status === "HT" ? 45
    : (afMatch && afMatch.elapsed > 0) ? afMatch.elapsed
    : (fdMatch && fdMatch.elapsed > 0) ? fdMatch.elapsed
    : simElapsed;
  const homeScore = afMatch?.homeScore ?? fdMatch?.homeScore ?? match.homeScore;
  const awayScore = afMatch?.awayScore ?? fdMatch?.awayScore ?? match.awayScore;

  // Detailed stats — always simulated
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

  // Derived live win probabilities from Polymarket tournament odds + current score
  let liveProbs: { home: number; draw: number; away: number } | null = null;
  if (homeW !== null && awayW !== null) {
    const preMatchHomeWinProb = preMatchWinProbFromTournamentOdds(homeW ?? 0.02, awayW ?? 0.02);
    liveProbs = liveWinProbability(preMatchHomeWinProb, homeScore, awayScore, elapsed, status);
  }

  // Persist updated state non-blocking
  prisma.match.update({ where: { id }, data: { elapsed, status, homeScore, awayScore } }).catch(() => {});

  return NextResponse.json({
    match: { ...match, elapsed, status, homeScore, awayScore },
    metrics,
    markets: enrichedMarkets,
    kalshiTickers: kalshi ? kalshi.tickers : null,
    liveProbs,
    tournamentOdds: { home: homeW, away: awayW },
    dataSources: {
      match:   afMatch ? "api-football" : fdMatch ? fdMatch.source : "sim",
      markets: kalshi  ? kalshi.source  : "sim",
      stats:   "sim",
      probs:   (homeW !== null && awayW !== null) ? "polymarket" : "unavailable",
    },
  });
}
