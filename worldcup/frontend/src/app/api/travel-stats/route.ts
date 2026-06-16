import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAllVenues, type VenueInfo } from "@/lib/venues";

export const revalidate = 300;

const COUNTRY_FLAG: Record<string, string> = {
  USA: "🇺🇸",
  Canada: "🇨🇦",
  Mexico: "🇲🇽",
};

// Estimated fan multiplier per match: how many fans (not just ticket holders) travel to the city
// Includes fans who can't get tickets but travel anyway
const FAN_MULTIPLIER = 1.4;

// International fan share per city (percentage)
const INTL_SHARE: Record<string, number> = {
  "New York / NJ": 30,
  "Los Angeles": 28,
  "Mexico City": 20,
  "Dallas": 18,
  "Miami": 35,
  "San Francisco": 25,
  "Atlanta": 16,
  "Seattle": 22,
  "Houston": 18,
  "Kansas City": 14,
  "Philadelphia": 20,
  "Boston": 25,
  "Vancouver": 28,
  "Toronto": 30,
  "Guadalajara": 15,
  "Monterrey": 12,
};

// Avg daily hotel rate USD on match days
const HOTEL_RATE: Record<string, number> = {
  "New York / NJ": 380,
  "Los Angeles": 320,
  "Mexico City": 180,
  "Dallas": 220,
  "Miami": 350,
  "San Francisco": 340,
  "Atlanta": 210,
  "Seattle": 250,
  "Houston": 200,
  "Kansas City": 195,
  "Philadelphia": 240,
  "Boston": 290,
  "Vancouver": 260,
  "Toronto": 230,
  "Guadalajara": 140,
  "Monterrey": 150,
};

// Number of direct international flights per match day
const FLIGHTS_INTL: Record<string, number> = {
  "New York / NJ": 420,
  "Los Angeles": 390,
  "Mexico City": 280,
  "Dallas": 210,
  "Miami": 360,
  "San Francisco": 310,
  "Atlanta": 240,
  "Seattle": 195,
  "Houston": 220,
  "Kansas City": 90,
  "Philadelphia": 185,
  "Boston": 210,
  "Vancouver": 175,
  "Toronto": 220,
  "Guadalajara": 120,
  "Monterrey": 95,
};

// Interesting travel fact per city
const TRAVEL_FACT: Record<string, string> = {
  "New York / NJ": "NYC hosts the FINAL — 30,000+ international fans expected to stay 5+ nights, generating over $250M in a single weekend.",
  "Los Angeles": "LA's SoFi Stadium sits 6 miles from LAX, the world's 5th busiest airport with 88M passengers/year.",
  "Mexico City": "Azteca's altitude of 2,250m means planes burn ~8% more fuel landing here — and fans feel it too.",
  "Dallas": "DFW Airport is the 4th busiest globally. Fans from South America often connect through Dallas.",
  "Miami": "Miami has more hotel rooms per capita than any other US city — 68,000+ rooms in the metro area.",
  "San Francisco": "Silicon Valley proximity means the highest concentration of tech-company chartered fan buses.",
  "Atlanta": "Atlanta's Hartsfield-Jackson is the world's busiest airport — 104M passengers in 2023.",
  "Seattle": "Seattle is the closest US venue to East Asia — South Korean and Japanese fans have shortest flights.",
  "Houston": "George Bush Intercontinental Hub connects all CONCACAF nations with direct flights.",
  "Kansas City": "KC sits at the geographic center of the US — fans from both coasts have equal 2-hour flights.",
  "Philadelphia": "Philly is 95 miles from NYC — thousands of fans will do day trips via Amtrak's high-speed Acela.",
  "Boston": "Boston has the highest density of European fans expected — strong Irish, Italian, and Portuguese communities.",
  "Vancouver": "BC Place is the only stadium with a direct rapid transit link — the Canada Line runs to the front door.",
  "Toronto": "Air Canada's global hub connects 207 destinations — Europe-to-Toronto fares drop 40% for WC dates.",
  "Guadalajara": "Guadalajara is a 5-hour drive from Mexico City — expect a huge overland fan convoy on match days.",
  "Monterrey": "Monterrey fans can drive to the US border (Laredo) in 2 hours — many US residents drive south.",
};

export interface CityTravelStats {
  name: string;
  country: string;
  flag: string;
  venue: string;
  capacity: number;
  lat: number;
  lng: number;
  avgTempC: number;
  matchCount: number;
  completedCount: number;
  remainingCount: number;
  hasMatchToday: boolean;
  nextMatchDate: string | null;
  peakArrivals: number;
  peakDepartures: number;
  intlSharePct: number;
  hotelRateUsd: number;
  intlFlightsPerDay: number;
  estimatedRevenuePerMatch: number;
  totalEstimatedRevenue: number;
  travelFact: string;
}

export async function GET() {
  const matches = await prisma.match.findMany({
    include: { homeTeam: true, awayTeam: true },
  });

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Group matches by city
  const cityMatchMap = new Map<string, typeof matches>();
  for (const m of matches) {
    const city = m.city;
    if (!cityMatchMap.has(city)) cityMatchMap.set(city, []);
    cityMatchMap.get(city)!.push(m);
  }

  const allVenues = getAllVenues();
  const venueByCity = new Map<string, VenueInfo & { name: string }>();
  for (const v of allVenues) {
    venueByCity.set(v.city, v);
  }

  const cities: CityTravelStats[] = [];

  for (const [city, cityMatches] of cityMatchMap.entries()) {
    const venueInfo = venueByCity.get(city);
    if (!venueInfo) continue;

    const completed = cityMatches.filter(m => m.status === "FT").length;
    const upcoming  = cityMatches.filter(m => m.status === "NS" || m.status === "LIVE");
    const remaining = upcoming.length;

    const hasMatchToday = cityMatches.some(m => {
      const d = new Date(m.date).toISOString().slice(0, 10);
      return d === todayStr;
    });

    const nextMatch = upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

    const capacity = venueInfo.capacity;
    const intlPct  = INTL_SHARE[city] ?? 20;
    const hotel    = HOTEL_RATE[city] ?? 220;
    const flights  = FLIGHTS_INTL[city] ?? 150;

    // Estimated fans per match day (capacity × fill rate × travel multiplier)
    const fansPerMatch  = Math.round(capacity * 0.92 * FAN_MULTIPLIER);
    // Arrivals peak = fans over 2-day arrival window, split unevenly (70% day before, 30% day of)
    const peakArrivals  = Math.round(fansPerMatch * 0.7);
    const peakDepartures = Math.round(fansPerMatch * 0.85);

    // Revenue per match: intl fans spend more, domestic less
    const intlFans = Math.round(fansPerMatch * (intlPct / 100));
    const domFans  = fansPerMatch - intlFans;
    const revPerMatch = intlFans * 3500 + domFans * 1200;

    cities.push({
      name: city,
      country: venueInfo.country,
      flag: COUNTRY_FLAG[venueInfo.country] ?? "🌎",
      venue: venueInfo.name,
      capacity,
      lat: venueInfo.lat,
      lng: venueInfo.lng,
      avgTempC: venueInfo.avgJuneTempC,
      matchCount: cityMatches.length,
      completedCount: completed,
      remainingCount: remaining,
      hasMatchToday,
      nextMatchDate: nextMatch ? new Date(nextMatch.date).toISOString() : null,
      peakArrivals,
      peakDepartures,
      intlSharePct: intlPct,
      hotelRateUsd: hotel,
      intlFlightsPerDay: flights,
      estimatedRevenuePerMatch: revPerMatch,
      totalEstimatedRevenue: revPerMatch * cityMatches.length,
      travelFact: TRAVEL_FACT[city] ?? `${city} is one of ${cityMatches.length} match cities in the 2026 World Cup.`,
    });
  }

  // Sort: cities with today's matches first, then by total revenue
  cities.sort((a, b) => {
    if (a.hasMatchToday && !b.hasMatchToday) return -1;
    if (!a.hasMatchToday && b.hasMatchToday) return 1;
    return b.totalEstimatedRevenue - a.totalEstimatedRevenue;
  });

  const totalRevenue = cities.reduce((s, c) => s + c.totalEstimatedRevenue, 0);
  const totalMatches = cities.reduce((s, c) => s + c.matchCount, 0);
  const totalFansPerDay = cities
    .filter(c => c.hasMatchToday)
    .reduce((s, c) => s + c.peakArrivals, 0);

  return NextResponse.json({
    cities,
    totals: {
      cities: cities.length,
      matches: totalMatches,
      estimatedRevenue: totalRevenue,
      fansArrivingToday: totalFansPerDay,
      intlVisitors: 1_500_000,
      economicImpact: 5_400_000_000,
    },
  });
}
