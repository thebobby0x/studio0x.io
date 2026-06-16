/**
 * Derived probability calculations for WC 2026.
 * These create "new stats from other stats" by combining Polymarket market prices
 * with mathematical models to produce unique metrics.
 */

/**
 * Harville's formula: P(team i finishes in top-k of n teams)
 * given each team's win probability.
 *
 * P(team i is 1st or 2nd) = p_i + sum_{j≠i} [ p_j * p_i / (1 - p_j) ]
 *
 * This is the standard way to compute "top-2 selection probability" from
 * individual win probabilities without needing full bracket simulation.
 */
export function harvilleAdvanceProbability(
  teamWinProb: number,
  allWinProbs: number[]
): number {
  const total = allWinProbs.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;

  // Normalize so probabilities sum to 1
  const p = allWinProbs.map(x => x / total);
  const pi = teamWinProb / total;

  // P(i comes 1st) = pi
  // P(j comes 1st, i comes 2nd) = pj * pi / (1 - pj)
  let advanceProb = pi;
  for (const pj of p) {
    if (Math.abs(pj - pi) < 1e-9) continue; // skip self
    if (pj >= 1) continue;
    advanceProb += pj * pi / (1 - pj);
  }

  return Math.min(0.99, Math.max(0.01, advanceProb));
}

export interface RoundProbabilities {
  advanceGroup: number;
  reachR16: number;
  reachQF: number;
  reachSF: number;
  reachFinal: number;
  winTournament: number;
}

/**
 * Given P(advance from group) and P(win tournament) from Polymarket,
 * compute the full chain of round probabilities.
 *
 * Model: P(win) = P(advance) × r^5  (5 knockout rounds in WC 2026)
 * Solve for r, then fill each stage as P(advance) × r^k.
 *
 * WC 2026 knockout path: R32 → R16 → QF → SF → Final → Win
 * (5 knockout wins needed after advancing from group)
 */
export function tournamentPathProbabilities(
  winTournamentProb: number,
  advanceGroupProb: number
): RoundProbabilities {
  const W = Math.max(0.001, winTournamentProb);
  const A = Math.max(W + 0.001, advanceGroupProb); // advance must be >= win

  // Solve for r: W = A × r^5
  const r = Math.pow(W / A, 1 / 5);

  return {
    advanceGroup: round2(A),
    reachR16:     round2(A * r),
    reachQF:      round2(A * r * r),
    reachSF:      round2(A * r * r * r),
    reachFinal:   round2(A * r * r * r * r),
    winTournament: round2(W),
  };
}

function round2(n: number): number {
  return Math.min(0.99, Math.max(0.01, Math.round(n * 1000) / 1000));
}

/**
 * Live in-game win probability.
 * Blends pre-match probability (from tournament odds ratio) with
 * a score+time model that weights the current result more as
 * the game progresses.
 *
 * At 0': pure pre-match odds
 * At 90': almost entirely determined by the current score
 */
export interface LiveMatchProbs {
  home: number;
  draw: number;
  away: number;
}

export function liveWinProbability(
  preMatchHomeWinProb: number,
  homeScore: number,
  awayScore: number,
  elapsed: number,
  status: string
): LiveMatchProbs {
  if (status === "FT") {
    const diff = homeScore - awayScore;
    return {
      home: diff > 0 ? 1 : 0,
      draw: diff === 0 ? 1 : 0,
      away: diff < 0 ? 1 : 0,
    };
  }

  const effectiveElapsed = status === "HT" ? 45 : Math.max(0, Math.min(90, elapsed));
  const timeProgress = effectiveElapsed / 90;
  const scoreDiff = homeScore - awayScore;

  // Score-based probability using a logistic model calibrated to football:
  // At 1-0 with 10 minutes left, P(home win) ≈ 0.88
  // At 0-0 with 10 minutes left, P(home win) ≈ pre-match adjusted
  const scoreSignal = 1 / (1 + Math.exp(-1.5 * scoreDiff - 0.4 * (timeProgress - 0.5)));

  // Weight: score signal matters more as game progresses
  const scoreWeight = Math.pow(timeProgress, 0.7) * 0.9;

  // Blended home win probability
  let homeWin = (1 - scoreWeight) * preMatchHomeWinProb + scoreWeight * scoreSignal;

  // Draw probability: peaks at ~28% pre-match, fades late in game unless it's 0-0
  const baseDraw = 0.28 - 0.08 * timeProgress;
  const drawFadeOnScore = Math.exp(-2.5 * Math.abs(scoreDiff) * timeProgress);
  let drawProb = baseDraw * drawFadeOnScore;

  // Ensure coherence
  drawProb = Math.max(0.01, Math.min(0.4, drawProb));
  homeWin = Math.max(0.02, Math.min(0.96, homeWin));
  const awayWin = Math.max(0.02, Math.min(0.96, 1 - homeWin - drawProb));

  // Re-normalize to sum to 1
  const total = homeWin + drawProb + awayWin;
  return {
    home: Math.round((homeWin / total) * 1000) / 1000,
    draw: Math.round((drawProb / total) * 1000) / 1000,
    away: Math.round((awayWin / total) * 1000) / 1000,
  };
}

/**
 * Derive pre-match home win probability from tournament winner odds.
 * P(home wins match) ≈ W_home / (W_home + W_away) with slight home advantage.
 */
export function preMatchWinProbFromTournamentOdds(
  homeWinTournament: number,
  awayWinTournament: number
): number {
  const h = Math.max(0.001, homeWinTournament);
  const a = Math.max(0.001, awayWinTournament);
  // Slight home advantage (+3%)
  const raw = h / (h + a);
  return Math.max(0.1, Math.min(0.9, raw * 0.97 + 0.03));
}
