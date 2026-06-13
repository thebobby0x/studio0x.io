import { NextResponse } from "next/server";
import { getGroupWinnerMarkets } from "@/lib/polymarket";
import { harvilleAdvanceProbability, tournamentPathProbabilities } from "@/lib/probabilities";
import { getTeamTournamentProb } from "@/lib/polymarket";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ group: string }> }
) {
  const { group } = await params;
  const data = await getGroupWinnerMarkets(group);
  if (!data) return NextResponse.json({ error: "No markets found" }, { status: 404 });

  const allWinProbs = data.markets.map(m => m.probability);

  // Enrich each market with derived advance probability and tournament path
  const enriched = await Promise.all(
    data.markets.map(async (m) => {
      const advanceProb = harvilleAdvanceProbability(m.probability, allWinProbs);
      const winTournamentProb = m.tla ? (await getTeamTournamentProb(m.tla)) ?? 0.01 : 0.01;
      const path = tournamentPathProbabilities(winTournamentProb, advanceProb);
      return { ...m, advanceProb, path };
    })
  );

  return NextResponse.json({ ...data, markets: enriched });
}
