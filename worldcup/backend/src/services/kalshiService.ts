import { prisma } from "../lib/prisma";

const OUTCOMES = ["home_win", "draw", "away_win"] as const;

// Contract slugs mirroring real Kalshi format
const SLUGS: Record<string, string> = {
  home_win: "FIFAWC26-MEX-WIN",
  draw:     "FIFAWC26-DRAW",
  away_win: "FIFAWC26-RSA-WIN",
};

// Initial market state
const state: Record<string, number> = {
  home_win: 0.51,
  draw:     0.24,
  away_win: 0.25,
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// Random-walk the markets, keeping sum ≈ 1
function walkMarkets(): void {
  const delta = (Math.random() * 0.04 - 0.02);
  state.home_win = clamp(state.home_win + delta, 0.01, 0.98);
  const remain = 1 - state.home_win;
  state.draw = clamp(state.draw + (Math.random() * 0.02 - 0.01), 0.01, remain - 0.01);
  state.away_win = clamp(remain - state.draw, 0.01, 0.97);
}

export async function tickKalshi(matchId: string): Promise<void> {
  walkMarkets();
  for (const outcome of OUTCOMES) {
    await prisma.kalshiMarket.upsert({
      where: { matchId_outcome: { matchId, outcome } } as never,
      update: {
        price: Math.round(state[outcome] * 100) / 100,
        volume: { increment: Math.floor(Math.random() * 500 + 100) },
        lastTick: new Date(),
      },
      create: {
        matchId,
        contractSlug: SLUGS[outcome],
        outcome,
        price: Math.round(state[outcome] * 100) / 100,
        volume: Math.floor(Math.random() * 5000 + 1000),
      },
    });
  }
}

export async function getMarkets(matchId: string) {
  return prisma.kalshiMarket.findMany({
    where: { matchId },
    orderBy: { outcome: "asc" },
  });
}
