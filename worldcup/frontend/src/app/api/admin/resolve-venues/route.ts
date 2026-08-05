import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed } from "@/lib/adminAuth";
import { AF_LEAGUE } from "@/lib/sportConfig";
import { backfillMatchCities } from "@/lib/venueGeo";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ─────────────────────────────────────────────────────────────────────────────
// Resolve venue city + coordinates — the prerequisite for weather ingest.
//
// Weather was reporting `skippedNoVenue` for every match: it located a venue via
// the curated lib/venues.ts table, which only holds the 16 World Cup stadiums.
// Outside WC26 nothing resolved, so no match ever got a weather row.
//
// This walks the distinct venues with unresolved geography, fetches each one's
// city/country from api-football /venues, geocodes that city via Open-Meteo, and
// caches the result in the Venue table — then backfills Match.city, which the
// fixture feed left blank on most fixtures.
//
// Idempotent and non-destructive: already-resolved venues are skipped, and a
// venue that cannot be resolved is reported rather than guessed at.
// ─────────────────────────────────────────────────────────────────────────────

async function handler(req: Request) {
  if (!(await isAdminAuthed(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const limit = Math.min(80, Math.max(1, parseInt(searchParams.get("limit") ?? "40", 10) || 40));

  const before = await prisma.match.count({ where: { city: "", leagueId: { in: [AF_LEAGUE, 0] } } });
  const result = await backfillMatchCities(limit);
  const after = await prisma.match.count({ where: { city: "", leagueId: { in: [AF_LEAGUE, 0] } } });

  const venues = await prisma.venue.findMany({
    select: { name: true, city: true, country: true, lat: true, lng: true, source: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    ok: true,
    matchesMissingCityBefore: before,
    matchesMissingCityAfter: after,
    citiesCorrected: result.citiesCorrected,
    venuesResolved: result.venuesResolved,
    matchesUpdated: result.matchesUpdated,
    unresolvedVenues: result.unresolved,
    // Venues resolve from the api-football venue id. If most are unresolved,
    // run "Seed Fixtures" first — that is what writes Match.venueId.
    hint: result.unresolved.length > 0
      ? "Unresolved venues need Match.venueId — run Seed Fixtures first, then re-run this."
      : null,
    venuesWithCoords: venues.filter((v) => v.lat != null).length,
    venuesTotal: venues.length,
    // Provenance is surfaced deliberately: "geocoded-city" is a city centroid,
    // NOT a stadium-exact position, and must never be presented as one.
    venues: venues.slice(0, 40),
  });
}

export async function GET(req: Request) { return handler(req); }
export async function POST(req: Request) { return handler(req); }
