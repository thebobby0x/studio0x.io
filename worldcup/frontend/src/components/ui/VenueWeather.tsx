"use client";

import { useEffect, useState } from "react";
import { useUnits } from "@/lib/units";

interface WeatherData {
  temperatureC: number;
  weatherCode: number;
  windSpeedKmh: number;
}

function wmoEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code === 1) return "🌤️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code === 51 || code === 53 || code === 55) return "🌦️";
  if (code === 61 || code === 63 || code === 65) return "🌧️";
  if (code === 71 || code === 73 || code === 75) return "❄️";
  if (code === 77) return "🌨️";
  if (code === 80 || code === 81 || code === 82) return "🌦️";
  if (code === 85 || code === 86) return "🌨️";
  if (code === 95) return "⛈️";
  if (code === 96 || code === 99) return "⛈️";
  return "🌡️";
}

interface Props {
  lat: number;
  lng: number;
  timezone: string;
}

export default function VenueWeather({ lat, lng, timezone }: Props) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const { units, tempC } = useUnits();

  useEffect(() => {
    let cancelled = false;

    async function fetchWeather() {
      try {
        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${lat}&longitude=${lng}` +
          `&current=temperature_2m,weathercode,windspeed_10m` +
          `&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) return;
        const json = await res.json();
        const current = json?.current;
        if (!current) return;
        if (!cancelled) {
          setWeather({
            temperatureC: Math.round(current.temperature_2m),
            weatherCode: current.weathercode,
            windSpeedKmh: Math.round(current.windspeed_10m),
          });
        }
      } catch {
        // silently fail — widget is best-effort
      }
    }

    fetchWeather();
    const id = setInterval(fetchWeather, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [lat, lng, timezone]);

  if (!weather) return null;

  const emoji = wmoEmoji(weather.weatherCode);
  const temp = tempC(weather.temperatureC);
  const wind =
    units === "imperial"
      ? `${Math.round(weather.windSpeedKmh * 0.621)} mph`
      : `${weather.windSpeedKmh} km/h`;

  return (
    <span className="text-[10px] text-slate-400 tabular-nums">
      {emoji} {temp} · {wind}
    </span>
  );
}
