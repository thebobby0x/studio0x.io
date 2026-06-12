// Deterministic, serverless-compatible match simulation.
// No background process needed — state is computed from elapsed time + seeded RNG.

function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export interface SimStats {
  possession:   number
  shots_on:     number
  shots_off:    number
  corners:      number
  fouls:        number
  yellow_cards: number
  red_cards:    number
}

const BASE: Record<string, SimStats> = {
  MEX: { possession: 52, shots_on: 4,  shots_off: 3, corners: 3, fouls: 8,  yellow_cards: 1, red_cards: 0 },
  RSA: { possession: 48, shots_on: 2,  shots_off: 5, corners: 2, fouls: 10, yellow_cards: 2, red_cards: 0 },
};

export function simulateStats(teamCode: string, elapsed: number, fixtureSeed: number): SimStats {
  const rand = seededRand(fixtureSeed + elapsed * 31 + teamCode.charCodeAt(0));
  const base = BASE[teamCode] ?? BASE.MEX;
  const drift = (v: number, variance: number) => Math.max(0, Math.round((v + elapsed * 0.08 + (rand() * 2 - 1) * variance) * 10) / 10);
  return {
    possession:   Math.round(50 + (teamCode === "MEX" ? 1 : -1) * (rand() * 4 + 1)),
    shots_on:     drift(base.shots_on,     1.2),
    shots_off:    drift(base.shots_off,    1.5),
    corners:      drift(base.corners,      1.0),
    fouls:        drift(base.fouls,        2.0),
    yellow_cards: drift(base.yellow_cards, 0.8),
    red_cards:    Math.random() < 0.03 ? 1 : 0,
  };
}

export function simulateMarkets(elapsed: number, fixtureSeed: number) {
  const rand = seededRand(fixtureSeed + elapsed * 97);
  const homeWin = Math.min(0.97, Math.max(0.03, 0.51 + (rand() * 0.12 - 0.06)));
  const draw    = Math.min(homeWin - 0.02, Math.max(0.02, 0.24 + (rand() * 0.06 - 0.03)));
  const awayWin = Math.round((1 - homeWin - draw) * 100) / 100;
  return { home_win: Math.round(homeWin * 100) / 100, draw: Math.round(draw * 100) / 100, away_win: awayWin };
}

// Returns the approximate match minute, accounting for halftime.
// Assumes kickoff + ~45 min first half + ~17 min halftime break + second half.
export function elapsedFromDate(matchDate: Date): number {
  const ms = Date.now() - matchDate.getTime();
  if (ms <= 0) return 0;
  const wall = Math.floor(ms / 60000);
  if (wall <= 45) return wall;               // first half
  if (wall <= 62) return 45;                 // halftime break (~17 min)
  return Math.min(wall - 17, 90);            // second half
}

export function statusFromElapsed(elapsed: number): string {
  if (elapsed === 0)  return "NS";
  if (elapsed >= 90)  return "FT";
  if (elapsed === 45) return "HT";
  return "LIVE";
}
