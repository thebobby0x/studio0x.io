import { NextResponse } from "next/server";
import { getVenueInfo } from "@/lib/venues";

export interface WeatherData {
  tempC: number;
  feelsLikeC: number;
  humidity: number;
  windKph: number;
  windDir: string;
  precipMm: number;
  conditionCode: number;   // WMO weather code
  condition: string;       // human label
  isDay: boolean;
  uvIndex: number;
  forecastHigh: number;
  forecastLow: number;
  forecastPrecipMm: number;
  // Air quality (Open-Meteo Air Quality API / CAMS). null when the AQ service
  // is unavailable — never fabricated. US AQI scale; pm25 in µg/m³ catches
  // wildfire smoke that city-level AQI averaging can hide.
  aqi: number | null;
  pm25: number | null;
  source: "live" | "cache";
}

type CacheEntry = { ts: number; data: WeatherData };
const _cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const WMO_LABELS: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Foggy", 48: "Rime fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow",
  80: "Rain showers", 81: "Rain showers", 82: "Violent showers",
  95: "Thunderstorm", 96: "Thunderstorm + hail", 99: "Thunderstorm + heavy hail",
};

const WIND_DIRS = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];

function degToCompass(deg: number) {
  return WIND_DIRS[Math.round(deg / 22.5) % 16];
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const venue = searchParams.get("venue");
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");

  let lat: number | null = null;
  let lng: number | null = null;

  if (venue) {
    const info = getVenueInfo(venue);
    if (info) { lat = info.lat; lng = info.lng; }
  } else if (latParam && lngParam) {
    lat = parseFloat(latParam);
    lng = parseFloat(lngParam);
  }

  if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "venue or lat/lng required" }, { status: 400 });
  }

  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ ...cached.data, source: "cache" });
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,` +
      `weather_code,wind_speed_10m,wind_direction_10m,is_day,uv_index` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum` +
      `&wind_speed_unit=kmh&timezone=auto&forecast_days=1`;
    // Separate service, separate failure domain: air quality must never take
    // down the core weather strip, so it resolves to null on any error.
    const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}` +
      `&current=us_aqi,pm2_5&timezone=UTC`;

    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 5000);
    const [res, aqJson] = await Promise.all([
      fetch(url, { signal: ctrl.signal, cache: "no-store" }),
      fetch(aqUrl, { signal: ctrl.signal, cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);

    const json = await res.json();
    const c = json.current;
    const d = json.daily;
    const code = c.weather_code as number;

    const data: WeatherData = {
      tempC:           Math.round(c.temperature_2m),
      feelsLikeC:      Math.round(c.apparent_temperature),
      humidity:        c.relative_humidity_2m,
      windKph:         Math.round(c.wind_speed_10m),
      windDir:         degToCompass(c.wind_direction_10m),
      precipMm:        c.precipitation,
      conditionCode:   code,
      condition:       WMO_LABELS[code] ?? "Unknown",
      isDay:           c.is_day === 1,
      uvIndex:         c.uv_index ?? 0,
      forecastHigh:    Math.round(d.temperature_2m_max[0]),
      forecastLow:     Math.round(d.temperature_2m_min[0]),
      forecastPrecipMm: d.precipitation_sum[0],
      aqi:             aqJson?.current?.us_aqi ?? null,
      pm25:            aqJson?.current?.pm2_5 ?? null,
      source:          "live",
    };

    _cache.set(cacheKey, { ts: Date.now(), data });
    return NextResponse.json(data);
  } catch (e) {
    if (cached) return NextResponse.json({ ...cached.data, source: "cache" });
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}
