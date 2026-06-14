import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVenueInfo } from "@/lib/venues";
import { TEAM_HOME_COORDS } from "@/lib/teamHomeCoords";

export const revalidate = 60;

export interface FlightArc {
  tla: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  phase: "home-to-venue" | "venue-to-venue";
  fromLabel: string;
  toLabel: string;
  status: "in-transit" | "arrived";
}

export async function GET() {
  const matches = await prisma.match.findMany({
    include: { homeTeam: true, awayTeam: true },
    orderBy: { date: "asc" },
  });

  const now = new Date();
  const TRANSIT_WINDOW_MS = 48 * 60 * 60 * 1000;

  const teamMatches = new Map<
    string,
    Array<{ venue: string; date: Date; status: string }>
  >();

  for (const m of matches) {
    const homeTla = m.homeTeam.code;
    const awayTla = m.awayTeam.code;
    const entry = { venue: m.venue, date: m.date, status: m.status };
    if (!teamMatches.has(homeTla)) teamMatches.set(homeTla, []);
    if (!teamMatches.has(awayTla)) teamMatches.set(awayTla, []);
    teamMatches.get(homeTla)!.push(entry);
    teamMatches.get(awayTla)!.push(entry);
  }

  const arcs: FlightArc[] = [];

  for (const [tla, teamMatchList] of teamMatches.entries()) {
    const homeCoords = TEAM_HOME_COORDS[tla];
    if (!homeCoords) continue;

    const sorted = [...teamMatchList].sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );

    const ftMatches = sorted.filter((m) => m.status === "FT");
    const nsMatches = sorted.filter((m) => m.status === "NS");

    if (nsMatches.length === 0) continue;

    const nextMatch = nsMatches[0];
    const nextVenueInfo = getVenueInfo(nextMatch.venue);
    if (!nextVenueInfo) continue;

    if (ftMatches.length === 0) {
      arcs.push({
        tla,
        fromLat: homeCoords.lat,
        fromLng: homeCoords.lng,
        toLat: nextVenueInfo.lat,
        toLng: nextVenueInfo.lng,
        phase: "home-to-venue",
        fromLabel: homeCoords.country,
        toLabel: nextVenueInfo.city,
        status: "arrived",
      });
    } else {
      const lastFt = ftMatches[ftMatches.length - 1];
      const lastVenueInfo = getVenueInfo(lastFt.venue);
      if (!lastVenueInfo) continue;

      const msSinceLastFt = now.getTime() - lastFt.date.getTime();
      const transitStatus: "in-transit" | "arrived" =
        msSinceLastFt <= TRANSIT_WINDOW_MS ? "in-transit" : "arrived";

      arcs.push({
        tla,
        fromLat: lastVenueInfo.lat,
        fromLng: lastVenueInfo.lng,
        toLat: nextVenueInfo.lat,
        toLng: nextVenueInfo.lng,
        phase: "venue-to-venue",
        fromLabel: lastVenueInfo.city,
        toLabel: nextVenueInfo.city,
        status: transitStatus,
      });
    }
  }

  return NextResponse.json(arcs, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
  });
}
