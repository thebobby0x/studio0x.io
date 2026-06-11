import { prisma } from "../lib/prisma";

// Simulates a live API-Football style telemetry loop for MEX vs RSA
let tick = 0;

const BASE_METRICS: Record<string, Record<string, number>> = {
  MEX: { possession: 52, shots_on: 4, shots_off: 3, corners: 3, fouls: 8, yellow_cards: 1, red_cards: 0 },
  RSA: { possession: 48, shots_on: 2, shots_off: 5, corners: 2, fouls: 10, yellow_cards: 2, red_cards: 0 },
};

function drift(base: number, variance: number): number {
  return Math.max(0, base + (Math.random() * 2 - 1) * variance);
}

export async function tickMatchFeed(matchId: string): Promise<void> {
  tick += 1;
  const elapsed = Math.min(90, tick * 3);

  // Update elapsed & status
  const status = elapsed >= 45 && elapsed < 46 ? "HT" : elapsed >= 90 ? "FT" : "LIVE";

  // Probabilistic goal
  let homeScore: number | undefined;
  let awayScore: number | undefined;

  if (Math.random() < 0.04) {
    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (match) {
      if (Math.random() < 0.55) homeScore = match.homeScore + 1;
      else awayScore = match.awayScore + 1;
    }
  }

  await prisma.match.update({
    where: { id: matchId },
    data: {
      elapsed,
      status,
      ...(homeScore !== undefined && { homeScore }),
      ...(awayScore !== undefined && { awayScore }),
    },
  });

  // Write live metric snapshots
  const records = [];
  for (const teamCode of ["MEX", "RSA"]) {
    const base = BASE_METRICS[teamCode];
    for (const [metricType, baseVal] of Object.entries(base)) {
      records.push({ matchId, teamCode, metricType, value: drift(baseVal + tick * 0.1, 1.5) });
    }
  }

  await prisma.liveMetric.createMany({ data: records });
}

export async function getLatestMetrics(matchId: string) {
  const raw = await prisma.liveMetric.findMany({
    where: { matchId },
    orderBy: { recordedAt: "desc" },
    take: 14, // 7 metrics * 2 teams
  });

  const grouped: Record<string, Record<string, number>> = {};
  for (const m of raw) {
    if (!grouped[m.teamCode]) grouped[m.teamCode] = {};
    if (!grouped[m.teamCode][m.metricType]) {
      grouped[m.teamCode][m.metricType] = Math.round(m.value * 10) / 10;
    }
  }
  return grouped;
}
