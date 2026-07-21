// ─────────────────────────────────────────────────────────────────────────────
// Real-club-data guard (audit H-2, 7/20 night).
//
// The "Seed Clubs (Live API)" route queried api-football with league=1 — which
// IS the World Cup — so it wrote each player's NATIONAL-TEAM entry: club = the
// nation, league = "World Cup". Rendered raw, the Leagues page then claimed
// "47 clubs from 1 leagues" and "World Cup sends the most players — the clearest
// argument for global supremacy", which is nonsense (the World Cup is not a
// domestic league). Until the seed is fixed to pull DOMESTIC clubs, treat any
// row whose league is the "World Cup" placeholder (or empty) as UNVERIFIED and
// exclude it from club/league surfaces — never present it as fact.
//
// Fix-at-source (tomorrow): rewrite seedFromApi to fetch each player's club
// league (e.g. /players?id=X&season=2025, pick the club team, not the national
// team), then re-run. This guard then simply passes real data through.
// ─────────────────────────────────────────────────────────────────────────────

// Placeholder league values that mean "no real domestic club data".
export const PLACEHOLDER_LEAGUES = ["World Cup", ""];

// Prisma where-fragment: only players with real domestic club + league.
export const REAL_CLUB_WHERE = {
  club: { not: "" },
  league: { notIn: PLACEHOLDER_LEAGUES },
} as const;

// Predicate for in-memory filtering (same rule as REAL_CLUB_WHERE).
export function hasRealClubData(p: { club: string | null; league: string | null }): boolean {
  return !!p.club && !!p.league && !PLACEHOLDER_LEAGUES.includes(p.league);
}
