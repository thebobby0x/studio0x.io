export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// THE DEPOT READ API — the ecosystem endpoint flagged as the #1 blocker in the
// April GSEIE brief. Sibling modules query structured data here instead of
// scraping or wiring their own feeds.
//
//   GET /api/events?city=&sport=&competition=&team=&from=&to=&limit=
//
// Known consumers and their shapes:
//   · podiumMetrics  → ?competition=fifa-world-cup-2026&from=…
//   · podiumSelect   → ?city=Miami&from=2026-07-01&to=2026-07-20  (trip planning)
//   · passport       → ?city=…&from=…&to=…                        (check-in events)
//   · arcade         → ?competition=…&from=…                      (prediction slates)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const city = q.get("city")?.trim();
  const sport = q.get("sport")?.trim();
  const competition = q.get("competition")?.trim(); // slug
  const team = q.get("team")?.trim();               // name substring
  const from = q.get("from") ? new Date(q.get("from")!) : undefined;
  const to = q.get("to") ? new Date(q.get("to")!) : undefined;
  const limit = Math.min(parseInt(q.get("limit") ?? "200", 10) || 200, 1000);

  const events = await prisma.event.findMany({
    where: {
      ...(competition ? { competition: { slug: competition } } : {}),
      ...(sport ? { competition: { ...(competition ? { slug: competition } : {}), sport } } : {}),
      ...(city ? { venue: { city: { contains: city, mode: "insensitive" } } } : {}),
      ...(team
        ? {
            OR: [
              { homeTeam: { name: { contains: team, mode: "insensitive" } } },
              { awayTeam: { name: { contains: team, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(from || to
        ? { date: { ...(from && !isNaN(from.getTime()) ? { gte: from } : {}), ...(to && !isNaN(to.getTime()) ? { lte: to } : {}) } }
        : {}),
    },
    include: {
      competition: { select: { slug: true, name: true, sport: true, season: true } },
      venue: { select: { name: true, city: true, country: true } },
      homeTeam: { select: { name: true, badgeUrl: true } },
      awayTeam: { select: { name: true, badgeUrl: true } },
    },
    orderBy: { date: "asc" },
    take: limit,
  });

  return NextResponse.json(
    {
      count: events.length,
      events: events.map((e) => ({
        id: e.id,
        name: e.name,
        round: e.round,
        date: e.date,
        status: e.status,
        competition: e.competition,
        venue: e.venue,
        homeTeam: e.homeTeam?.name ?? null,
        awayTeam: e.awayTeam?.name ?? null,
        homeScore: e.homeScore,
        awayScore: e.awayScore,
      })),
    },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=120" } }
  );
}
