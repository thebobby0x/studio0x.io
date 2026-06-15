import { NextResponse } from "next/server";
import { getAllVenues, getVenueInfo } from "@/lib/venues";
import { prisma } from "@/lib/prisma";

export const revalidate = 90;

export interface VenueDensity {
  name: string;
  lat: number;
  lng: number;
  count: number;
  estimated?: boolean;
}

type OpenSkyState = [
  string,         // icao24
  string,         // callsign
  string,         // origin_country
  number | null,  // time_position
  number | null,  // last_contact
  number | null,  // longitude
  number | null,  // latitude
  number | null,  // baro_altitude
  boolean,        // on_ground
  ...unknown[]
];

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Estimate fan aircraft based on match schedule proximity
function estimateForVenue(
  matchTimes: { date: Date; status: string }[],
  now: Date
): number {
  let count = 120; // baseline regional air traffic
  for (const m of matchTimes) {
    const hoursFromNow = (m.date.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (m.status !== "FT") {
      // Upcoming or live
      if (hoursFromNow >= -3 && hoursFromNow < 0)   count += 420; // match happening now
      else if (hoursFromNow >= 0 && hoursFromNow < 24) count += 380; // day-of arrivals
      else if (hoursFromNow >= 24 && hoursFromNow < 48) count += 240; // 1-2 days out
      else if (hoursFromNow >= 48 && hoursFromNow < 72) count += 110; // 2-3 days out
    } else {
      // Finished — fans departing
      const hoursSince = -hoursFromNow;
      if (hoursSince >= 0 && hoursSince < 12)  count += 340; // post-match departures
      else if (hoursSince >= 12 && hoursSince < 24) count += 210;
      else if (hoursSince >= 24 && hoursSince < 48) count += 120;
    }
  }
  return count;
}

let _cache: { ts: number; data: VenueDensity[] } | null = null;

export async function GET() {
  if (_cache && Date.now() - _cache.ts < 90_000) {
    return NextResponse.json(_cache.data);
  }

  const venues = getAllVenues();
  const now = new Date();

  // Always compute DB-based estimates so we have meaningful fallback data
  const dbEstimates: Record<string, number> = {};
  try {
    const windowStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const windowEnd   = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    const nearbyMatches = await prisma.match.findMany({
      where: { date: { gte: windowStart, lte: windowEnd } },
      select: { venue: true, date: true, status: true },
    });

    // Map canonical venue → match times
    const venueMatches: Record<string, { date: Date; status: string }[]> = {};
    for (const m of nearbyMatches) {
      const info = getVenueInfo(m.venue);
      if (!info) continue;
      // Match to our venue list by proximity
      const match = venues.find(v => Math.abs(v.lat - info.lat) < 0.01 && Math.abs(v.lng - info.lng) < 0.01);
      if (!match) continue;
      if (!venueMatches[match.name]) venueMatches[match.name] = [];
      venueMatches[match.name].push({ date: m.date, status: m.status });
    }

    for (const venue of venues) {
      dbEstimates[venue.name] = estimateForVenue(venueMatches[venue.name] ?? [], now);
    }
  } catch {
    // DB unavailable — estimates default to 0, live OpenSky data used as-is
  }

  try {
    const url = "https://opensky-network.org/api/states/all?lamin=8&lomin=-130&lamax=56&lomax=-59";
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8_000);
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });

    if (!res.ok) throw new Error(`OpenSky ${res.status}`);
    const json = await res.json() as { states?: OpenSkyState[] };
    const states = json.states ?? [];

    const airborne = states.filter(s => !s[8] && s[5] != null && s[6] != null) as OpenSkyState[];
    const hasLiveData = airborne.length > 0;

    const data: VenueDensity[] = venues.map(v => {
      const liveCount = airborne.filter(s => haversineKm(v.lat, v.lng, s[6]!, s[5]!) < 200).length;
      const estimated = !hasLiveData || liveCount === 0;
      const count = hasLiveData && liveCount > 0 ? liveCount : (dbEstimates[v.name] ?? 120);
      return { name: v.name, lat: v.lat, lng: v.lng, count, estimated };
    });

    _cache = { ts: Date.now(), data };
    return NextResponse.json(data);
  } catch {
    // OpenSky unavailable — use DB estimates
    const data: VenueDensity[] = venues.map(v => ({
      name: v.name, lat: v.lat, lng: v.lng,
      count: dbEstimates[v.name] ?? 120,
      estimated: true,
    }));
    _cache = { ts: Date.now(), data };
    return NextResponse.json(data);
  }
}
