// ─────────────────────────────────────────────────────────────────────────────
// Border Clash Index™ — live wiring into the generic LiveMetric store (no schema
// change). The Stage-1 formula in leaguesCup.ts scores a FINISHED cross-border
// result; this is its LIVE counterpart, computing a running MLS-vs-LigaMX
// dominance reading from the current score so the meter moves during the match.
// Every Leagues Cup group game is cross-league, so this is always meaningful.
//
// Persisted as a LiveMetric row (matchId, teamCode = favored league's team code,
// metricType "borderClash", value 0–100). Generic + append-only (a live sample),
// exactly the shape LiveMetric already models.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";

export type League = "MLS" | "LigaMX";

export interface LiveBorderClashInput {
  homeLeague: League;
  awayLeague: League;
  homeGoals: number;
  awayGoals: number;
  homeCode: string;
  awayCode: string;
}

const GOAL_STEP = 12;
const RESULT_BASE = 20;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/** Running dominance 0–100 for the favored league (50 = dead even). Returns null
 *  for same-league matchups (not a cross-border clash). */
export function computeLiveBorderClash(
  m: LiveBorderClashInput,
): { value: number; favorsLeague: League; favorsCode: string } | null {
  if (m.homeLeague === m.awayLeague) return null;
  const margin = m.homeGoals - m.awayGoals; // + → home league ahead
  if (margin === 0) return { value: 50, favorsLeague: m.homeLeague, favorsCode: "" };
  const favorsHome = margin > 0;
  const value = clamp(50 + Math.abs(margin) * GOAL_STEP + RESULT_BASE);
  return {
    value,
    favorsLeague: favorsHome ? m.homeLeague : m.awayLeague,
    favorsCode: favorsHome ? m.homeCode : m.awayCode,
  };
}

/** Compute + persist a live Border Clash sample. No-op for same-league games. */
export async function recordBorderClash(matchId: string, input: LiveBorderClashInput): Promise<number | null> {
  const r = computeLiveBorderClash(input);
  if (!r) return null;
  await prisma.liveMetric.create({
    data: { matchId, teamCode: r.favorsCode || "NEUTRAL", metricType: "borderClash", value: r.value },
  });
  return r.value;
}

/** Read the latest Border Clash sample for a match. */
export async function readBorderClash(matchId: string): Promise<{ value: number; favorsCode: string } | null> {
  const row = await prisma.liveMetric.findFirst({
    where: { matchId, metricType: "borderClash" },
    orderBy: { recordedAt: "desc" },
  });
  return row ? { value: row.value, favorsCode: row.teamCode } : null;
}
