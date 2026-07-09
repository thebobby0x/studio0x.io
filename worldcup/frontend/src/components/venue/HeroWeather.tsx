"use client";

import { useEffect, useState } from "react";
import { Cloud, Sun, CloudRain, Zap } from "lucide-react";
import type { WeatherData } from "@/app/api/weather/route";

function WeatherIcon({ code, isDay }: { code: number; isDay: boolean }) {
  const cls = "shrink-0";
  if (code === 0 || code === 1) return isDay ? <Sun size={11} className={`text-amber-400 ${cls}`} /> : <Cloud size={11} className={`text-slate-400 ${cls}`} />;
  if (code <= 3) return <Cloud size={11} className={`text-slate-400 ${cls}`} />;
  if (code <= 67) return <CloudRain size={11} className={`text-slate-300 ${cls}`} />;
  if (code <= 82) return <CloudRain size={11} className={`text-slate-400 ${cls}`} />;
  return <Zap size={11} className={`text-amber-400 ${cls}`} />;
}

export default function HeroWeather({ venueName }: { venueName: string }) {
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    fetch(`/api/weather?venue=${encodeURIComponent(venueName)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setWeather(d))
      .catch(() => null);
  }, [venueName]);

  if (!weather) return null;

  return (
    <span className="flex items-center gap-1.5">
      <WeatherIcon code={weather.conditionCode} isDay={weather.isDay} />
      <span className="font-semibold text-slate-300">{weather.tempC}°C</span>
      <span className="text-slate-600 text-[10px]">{weather.condition}</span>
    </span>
  );
}
