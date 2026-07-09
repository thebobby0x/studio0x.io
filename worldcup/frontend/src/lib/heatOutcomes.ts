import { prisma } from "@/lib/prisma";
import { getVenueInfo } from "@/lib/venues";
import { CLIMATE_CONTROLLED, heatBand } from "@/lib/heat";

// ── Heat vs. Outcomes (backlog §16) ──────────────────────────────────────────
// Stamps every played fixture with the REAL kickoff-hour weather and, once FT,
// outcome facts from the events feed. Unlike VAR wall-clock timing, weather is
// honestly backfillable: Open-Meteo's hourly API serves past days (up to 92),
// so the archived reading at the venue's coordinates for the kickoff hour is
// retrieval of fact, not fabrication.
//
// Chunked (default 8/call) because each match costs 1 Open-Meteo + up to 1
// api-football request — a full one-shot backfill of ~90 matches would blow
// the 60s Hobby function limit (same lesson as the anthem import, gotcha #18).

const AF_BASE = "https://v3.football.api-sports.io";

export interface HeatBackfillResult {
  ok: boolean;
  processed: number;
  created: number;
  outcomesAdded: number;
  skippedNoVenue: number;
  skippedNoData: number;
  remaining: number;
  errors: string[];
}

interface HourlyWeather {
  tempC: number;
  feelsC: number;
  humidity: number;
}

async function fetchKickoffWeather(
  lat: number,
  lng: number,
  kickoff: Date
): Promise<HourlyWeather | null> {
  const day = kickoff.toISOString().slice(0, 10);
  // Open-Meteo's forecast endpoint serves real (re)analysis for past days in
  // range — one code path for the whole tournament, no archive-API lag issues.
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m,apparent_temperature,relative_humidity_2m` +
    `&start_date=${day}&end_date=${day}&timezone=UTC`;
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const times: string[] = json.hourly?.time ?? [];
    // Kickoff hour slot (floor) — ambient conditions move little inside an hour
    const hourIso = kickoff.toISOString().slice(0, 13) + ":00";
    const i = times.indexOf(hourIso);
    if (i < 0) return null;
    const t = json.hourly.temperature_2m?.[i];
    const f = json.hourly.apparent_temperature?.[i];
    const h = json.hourly.relative_humidity_2m?.[i];
    if (t == null || f == null || h == null) return null;
    return { tempC: t, feelsC: f, humidity: h };
  } catch {
    return null;
  }
}

interface HourlyAir {
  aqi: number;
  pm25: number;
}

// Kickoff-hour air quality (US AQI + PM2.5) — the wildfire-smoke signal.
// Separate Open-Meteo service; failure just means null fields, never a
// failed backfill row.
async function fetchKickoffAir(
  lat: number,
  lng: number,
  kickoff: Date
): Promise<HourlyAir | null> {
  const day = kickoff.toISOString().slice(0, 10);
  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}` +
    `&hourly=us_aqi,pm2_5&start_date=${day}&end_date=${day}&timezone=UTC`;
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const times: string[] = json.hourly?.time ?? [];
    const hourIso = kickoff.toISOString().slice(0, 13) + ":00";
    const i = times.indexOf(hourIso);
    if (i < 0) return null;
    const aqi = json.hourly.us_aqi?.[i];
    const pm25 = json.hourly.pm2_5?.[i];
    if (aqi == null || pm25 == null) return null;
    return { aqi, pm25 };
  } catch {
    return null;
  }
}

interface OutcomeFacts {
  totalGoals: number;
  lateGoals: number;
  cards: number;
  subsAfter75: number;
}

async function fetchOutcomeFacts(fixture: number): Promise<OutcomeFacts | null> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${AF_BASE}/fixtures/events?fixture=${fixture}`, {
      headers: { "x-apisports-key": key },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const events: { type: string; detail: string; time: { elapsed: number } }[] =
      json.response ?? [];
    if (events.length === 0) return null;
    // Missed pens are NOT goals (same rule as the goals route)
    const goals = events.filter((e) => e.type === "Goal" && e.detail !== "Missed Penalty");
    return {
      totalGoals: goals.length,
      lateGoals: goals.filter((e) => e.time.elapsed >= 75).length,
      cards: events.filter((e) => e.type === "Card").length,
      subsAfter75: events.filter((e) => e.type === "subst" && e.time.elapsed >= 75).length,
    };
  } catch {
    return null;
  }
}

export async function backfillMatchWeather(count = 8): Promise<HeatBackfillResult> {
  const result: HeatBackfillResult = {
    ok: false, processed: 0, created: 0, outcomesAdded: 0,
    skippedNoVenue: 0, skippedNoData: 0, remaining: 0, errors: [],
  };

  const existing = await prisma.matchWeather.findMany({
    select: { fixture: true, totalGoals: true, aqi: true },
  });
  const byFixture = new Map(existing.map((w) => [w.fixture, w]));

  // Matches that have kicked off: need a weather row, and FT ones whose row
  // is still missing outcome facts need those filled in.
  const played = await prisma.match.findMany({
    where: { date: { lte: new Date() }, fixture: { gt: 0 } },
    orderBy: { date: "asc" },
    select: { fixture: true, date: true, status: true, venue: true },
  });
  const todo = played.filter((m) => {
    const row = byFixture.get(m.fixture);
    if (!row) return true;
    return m.status === "FT" && row.totalGoals === null;
  });

  const chunk = todo.slice(0, count);
  result.remaining = todo.length - chunk.length;

  const today = new Date().toISOString().slice(0, 10);

  for (const m of chunk) {
    result.processed++;
    try {
      const row = byFixture.get(m.fixture);

      if (!row) {
        const info = getVenueInfo(m.venue);
        if (!info) { result.skippedNoVenue++; continue; }
        const wx = await fetchKickoffWeather(info.lat, info.lng, m.date);
        if (!wx) { result.skippedNoData++; continue; }
        const [facts, air] = await Promise.all([
          m.status === "FT" ? fetchOutcomeFacts(m.fixture) : Promise.resolve(null),
          fetchKickoffAir(info.lat, info.lng, m.date),
        ]);
        await prisma.matchWeather.create({
          data: {
            fixture: m.fixture,
            kickoff: m.date,
            tempC: wx.tempC,
            feelsC: wx.feelsC,
            humidity: wx.humidity,
            band: heatBand(wx.feelsC),
            source: m.date.toISOString().slice(0, 10) === today ? "recent" : "archive",
            climateControlled: CLIMATE_CONTROLLED.has(m.venue),
            ...(air ?? {}),
            ...(facts ?? {}),
          },
        });
        result.created++;
        if (facts) result.outcomesAdded++;
      } else {
        // Row exists but outcomes were missing when it was created (match was
        // live at the time) — fill them in now that it's FT. Piggyback the
        // air-quality fill for rows stamped before the AQ columns existed.
        const info = getVenueInfo(m.venue);
        const [facts, air] = await Promise.all([
          fetchOutcomeFacts(m.fixture),
          row.aqi === null && info ? fetchKickoffAir(info.lat, info.lng, m.date) : Promise.resolve(null),
        ]);
        if (!facts && !air) { result.skippedNoData++; continue; }
        await prisma.matchWeather.update({
          where: { fixture: m.fixture },
          data: { ...(air ?? {}), ...(facts ?? {}) },
        });
        if (facts) result.outcomesAdded++;
      }
    } catch (e) {
      result.errors.push(`fixture ${m.fixture}: ${String(e)}`);
    }
  }

  result.ok = true;
  return result;
}

// ── Aggregate ────────────────────────────────────────────────────────────────

export interface HeatBucket {
  n: number;
  goalsPerMatch: number;
  lateGoalSharePct: number; // % of all goals scored 75'+
  cardsPerMatch: number;
  subsAfter75PerMatch: number;
}

export interface HeatOutcomesAggregate {
  bands: Record<string, HeatBucket>;
  hot: HeatBucket;  // High + Extreme
  mild: HeatBucket; // Low + Moderate
  excludedClimateControlled: number;
  generatedAt: string;
}

type WeatherRow = {
  band: string;
  totalGoals: number | null;
  lateGoals: number | null;
  cards: number | null;
  subsAfter75: number | null;
};

function bucketOf(rows: WeatherRow[]): HeatBucket {
  const n = rows.length;
  if (n === 0) return { n: 0, goalsPerMatch: 0, lateGoalSharePct: 0, cardsPerMatch: 0, subsAfter75PerMatch: 0 };
  const goals = rows.reduce((s, r) => s + (r.totalGoals ?? 0), 0);
  const late = rows.reduce((s, r) => s + (r.lateGoals ?? 0), 0);
  const cards = rows.reduce((s, r) => s + (r.cards ?? 0), 0);
  const subs = rows.reduce((s, r) => s + (r.subsAfter75 ?? 0), 0);
  return {
    n,
    goalsPerMatch: +(goals / n).toFixed(2),
    lateGoalSharePct: goals > 0 ? Math.round((late / goals) * 100) : 0,
    cardsPerMatch: +(cards / n).toFixed(2),
    subsAfter75PerMatch: +(subs / n).toFixed(2),
  };
}

export async function heatOutcomesAggregate(): Promise<HeatOutcomesAggregate> {
  // Only FT matches with ingested outcomes; climate-controlled venues excluded
  // from heat buckets (their outdoor reading isn't match conditions).
  const rows = await prisma.matchWeather.findMany({
    where: { totalGoals: { not: null } },
  });
  const open = rows.filter((r) => !r.climateControlled);

  const bands: Record<string, HeatBucket> = {};
  for (const band of ["Low", "Moderate", "High", "Extreme"]) {
    bands[band] = bucketOf(open.filter((r) => r.band === band));
  }
  return {
    bands,
    hot: bucketOf(open.filter((r) => r.band === "High" || r.band === "Extreme")),
    mild: bucketOf(open.filter((r) => r.band === "Low" || r.band === "Moderate")),
    excludedClimateControlled: rows.length - open.length,
    generatedAt: new Date().toISOString(),
  };
}
