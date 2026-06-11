import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { simulateStats, simulateMarkets, elapsedFromDate, statusFromElapsed } from "@/lib/simulation";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const match = await prisma.match.findUnique({
    where: { id },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const elapsed  = elapsedFromDate(match.date);
  const status   = statusFromElapsed(elapsed);
  const fixture  = match.fixture;

  // Compute live stats deterministically
  const metrics: Record<string, Record<string, number>> = {
    [match.homeTeam.code]: simulateStats(match.homeTeam.code, elapsed, fixture) as unknown as Record<string, number>,
    [match.awayTeam.code]: simulateStats(match.awayTeam.code, elapsed, fixture) as unknown as Record<string, number>,
  };

  // Compute market prices
  const prices = simulateMarkets(elapsed, fixture);
  const markets = await prisma.kalshiMarket.findMany({ where: { matchId: id } });
  const enrichedMarkets = markets.map((m: { outcome: string; price: number; [key: string]: unknown }) => ({
    ...m,
    price: prices[m.outcome as keyof typeof prices] ?? m.price,
  }));

  // Update match elapsed + status (fire-and-forget, non-blocking)
  prisma.match.update({ where: { id }, data: { elapsed, status } }).catch(() => {});

  return NextResponse.json({ match: { ...match, elapsed, status }, metrics, markets: enrichedMarkets });
}
