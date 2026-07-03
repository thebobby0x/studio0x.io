import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVenueInfo } from "@/lib/venues";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Officials™ — referee profiles built ONLY from real WC 2026 data:
//   · assignments come from api-football's per-fixture referee field (Match.referee)
//   · fouls/cards aggregate from PlayerMatchStat for the matches each ref worked
// No invented history, no cross-tournament claims — our data, our metrics.
//
// Proprietary metrics (Studio0x™):
//   Whistle Index™   — fouls called per game (how tightly they call it)
//   Card Threshold™  — fouls allowed per card shown (high = "lets play flow…
//                      or lets danger build"; low = quick trigger)
//   Booking Rate™    — cards per game
//   Let It Flow™     — 0–100 permissiveness score blending the above
// ─────────────────────────────────────────────────────────────────────────────

export interface OfficialProfile {
  name: string;
  gamesWorked: number;
  upcoming: number;
  nextAssignment: { fixture: number; date: string; home: string; away: string; city: string } | null;
  lastCity: string | null;
  status: "in-transit" | "on-site" | "done";
  // Raw aggregates (only over matches with ingested stats)
  statsGames: number;
  fouls: number;
  yellows: number;
  reds: number;
  // Studio0x™ metrics (null until stats are ingested for their games)
  whistleIndex: number | null;   // fouls per game
  cardThreshold: number | null;  // fouls per card
  bookingRate: number | null;    // cards per game
  letItFlow: number | null;      // 0–100 permissiveness
}

export async function GET() {
  const matches = await prisma.match.findMany({
    where: { referee: { not: null } },
    include: {
      homeTeam: { select: { code: true } },
      awayTeam: { select: { code: true } },
      playerStats: { select: { foulsCommitted: true, yellowCards: true, redCards: true } },
    },
    orderBy: { date: "asc" },
  });

  const byRef = new Map<string, typeof matches>();
  for (const m of matches) {
    const ref = m.referee!;
    if (!byRef.has(ref)) byRef.set(ref, []);
    byRef.get(ref)!.push(m);
  }

  const now = Date.now();
  const officials: OfficialProfile[] = [];

  for (const [name, refMatches] of byRef.entries()) {
    const ft = refMatches.filter((m) => m.status === "FT");
    const ns = refMatches.filter((m) => m.status === "NS");
    const next = ns[0] ?? null;
    const last = ft[ft.length - 1] ?? null;

    // Aggregate discipline only over games that HAVE ingested stats
    let fouls = 0, yellows = 0, reds = 0, statsGames = 0;
    for (const m of ft) {
      if (m.playerStats.length === 0) continue;
      statsGames++;
      for (const s of m.playerStats) {
        fouls += s.foulsCommitted;
        yellows += s.yellowCards;
        reds += s.redCards;
      }
    }
    const cards = yellows + reds * 2; // red weighted double for threshold purposes

    const whistleIndex = statsGames > 0 ? +(fouls / statsGames).toFixed(1) : null;
    const cardThreshold = statsGames > 0 && cards > 0 ? +(fouls / cards).toFixed(1) : null;
    const bookingRate = statsGames > 0 ? +((yellows + reds) / statsGames).toFixed(1) : null;
    // Let It Flow™: permissive = many fouls tolerated per card, few cards/game.
    // Normalised against typical ranges (threshold ~2–8, bookings ~1–7/game).
    const letItFlow =
      cardThreshold !== null && bookingRate !== null
        ? Math.max(0, Math.min(100, Math.round(((cardThreshold - 2) / 6) * 60 + ((7 - bookingRate) / 6) * 40)))
        : null;

    // Travel status mirrors team logic: 48h post-match = in transit to next city
    let status: OfficialProfile["status"] = "done";
    if (next) {
      status = last && now - last.date.getTime() <= 48 * 3600_000 ? "in-transit" : "on-site";
    }

    officials.push({
      name,
      gamesWorked: ft.length,
      upcoming: ns.length,
      nextAssignment: next
        ? {
            fixture: next.fixture,
            date: next.date.toISOString(),
            home: next.homeTeam.code,
            away: next.awayTeam.code,
            city: next.city || getVenueInfo(next.venue)?.city || "",
          }
        : null,
      lastCity: last ? last.city || getVenueInfo(last.venue)?.city || null : null,
      status,
      statsGames,
      fouls,
      yellows,
      reds,
      whistleIndex,
      cardThreshold,
      bookingRate,
      letItFlow,
    });
  }

  // Busiest officials first
  officials.sort((a, b) => b.gamesWorked + b.upcoming - (a.gamesWorked + a.upcoming));

  return NextResponse.json(
    { officials, count: officials.length },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } }
  );
}
