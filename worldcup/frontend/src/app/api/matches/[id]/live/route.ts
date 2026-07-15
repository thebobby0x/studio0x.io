import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { simulateStats, simulateMarkets, elapsedFromDate, statusFromElapsed } from "@/lib/simulation";
import { getKalshiMarkets } from "@/lib/kalshi";
import { getFixtureStatistics } from "@/lib/liveStats";
import { getFDLiveMatch } from "@/lib/footballData";
import { getTeamTournamentProb } from "@/lib/polymarket";
import { liveWinProbability, preMatchWinProbFromTournamentOdds } from "@/lib/probabilities";

const AF_BASE = "https://v3.football.api-sports.io";

// Flatten TeamLiveStats into the LiveMetrics record shape the UI reads.
// Null (unreported) stats are omitted rather than zeroed — a 0 is a claim.
function toMetricMap(s: import("@/lib/liveStats").TeamLiveStats): Record<string, number> {
  const pairs: [string, number | null][] = [
    ["possession", s.possession],
    ["shots_on", s.shotsOn],
    ["shots_off", s.shotsOff],
    ["total_shots", s.totalShots],
    ["blocked_shots", s.blockedShots],
    ["corners", s.corners],
    ["fouls", s.fouls],
    ["offsides", s.offsides],
    ["yellow_cards", s.yellowCards],
    ["red_cards", s.redCards],
    ["saves", s.saves],
    ["passes", s.passes],
    ["pass_accuracy", s.passAccuracy],
    ["xg", s.xg],
  ];
  return Object.fromEntries(pairs.filter(([, v]) => v !== null)) as Record<string, number>;
}
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
    _afCache.set(fixtureId, { ts: Date.now(), ttl: isLive ? 8_000 : 300_000, data });
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

  // Detailed team stats — REAL api-football /fixtures/statistics when the feed
  // has them (live + finished games), otherwise the sim placeholder which the
  // UI hides (dataSources.stats === "sim" gates every stats surface).
  const liveStats = (status !== "NS")
    ? await getFixtureStatistics(match.fixture, match.homeTeam.name, status === "LIVE" || status === "HT")
    : null;

  const metrics: Record<string, Record<string, number>> = liveStats
    ? {
        [homeCode]: toMetricMap(liveStats.home),
        [awayCode]: toMetricMap(liveStats.away),
      }
    : {
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

  // Persist updated state non-blocking — but ONLY when it came from a real feed.
  // When both feeds fail, status/elapsed above are clock-simulated and scores are
  // the (possibly stale) DB row; writing that back would stamp fabricated state
  // into the DB, which the schedule route and LiveMatchBanner then serve as truth.
  if (afMatch || fdMatch) {
    prisma.match.update({ where: { id }, data: { elapsed, status, homeScore, awayScore } }).catch(() => {});
  }

  const isMatchLive = status === "LIVE" || status === "HT";
  return NextResponse.json({
    match: { ...match, elapsed, status, homeScore, awayScore },
    metrics,
    markets: enrichedMarkets,
    kalshiTickers: kalshi ? kalshi.tickers : null,
    kalshiLive: kalshi, // full live market snapshot (prices, per-outcome bid/ask, volume) — null when no market found
    liveProbs,
    tournamentOdds: { home: homeW, away: awayW },
    dataSources: {
      match:   afMatch ? "api-football" : fdMatch ? fdMatch.source : "sim",
      markets: kalshi  ? kalshi.source  : "sim",
      stats:   liveStats ? "api-football" : "sim",
      probs:   (homeW !== null && awayW !== null) ? "polymarket" : "unavailable",
    },
  }, {
    headers: {
      "Cache-Control": isMatchLive
        ? "no-store, no-cache, must-revalidate"
        : "public, max-age=60, s-maxage=60",
    },
  });
}
