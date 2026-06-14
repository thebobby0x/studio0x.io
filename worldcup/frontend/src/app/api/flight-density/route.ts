import { NextResponse } from "next/server";
import { getAllVenues } from "@/lib/venues";

export const revalidate = 90;

export interface VenueDensity {
  name: string;
  lat: number;
  lng: number;
  count: number;
}

type OpenSkyState = [
  string,   // icao24
  string,   // callsign
  string,   // origin_country
  number | null, // time_position
  number | null, // last_contact
  number | null, // longitude
  number | null, // latitude
  number | null, // baro_altitude
  boolean,  // on_ground
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

let _cache: { ts: number; data: VenueDensity[] } | null = null;

export async function GET() {
  if (_cache && Date.now() - _cache.ts < 90_000) {
    return NextResponse.json(_cache.data);
  }

  const venues = getAllVenues();

  try {
    // Single bbox covering all WC 2026 venues (continental USA + Mexico + Canada)
    const url =
      "https://opensky-network.org/api/states/all?lamin=8&lomin=-130&lamax=56&lomax=-59";

    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8_000);
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });

    if (!res.ok) throw new Error(`OpenSky ${res.status}`);
    const json = await res.json() as { states?: OpenSkyState[] };
    const states = json.states ?? [];

    // Only airborne aircraft with valid coords
    const airborne = states.filter(
      s => !s[8] && s[5] != null && s[6] != null
    ) as OpenSkyState[];

    const data: VenueDensity[] = venues.map(v => ({
      name: v.name,
      lat: v.lat,
      lng: v.lng,
      count: airborne.filter(s => haversineKm(v.lat, v.lng, s[6]!, s[5]!) < 200).length,
    }));

    _cache = { ts: Date.now(), data };
    return NextResponse.json(data);
  } catch {
    // Return zeros on error so the map still renders
    const data: VenueDensity[] = venues.map(v => ({
      name: v.name, lat: v.lat, lng: v.lng, count: 0,
    }));
    return NextResponse.json(data);
  }
}
