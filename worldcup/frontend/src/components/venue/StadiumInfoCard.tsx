"use client";

import { useEffect, useState, useCallback } from "react";
import { MapPin, Wind, Droplets, Thermometer, Mountain, Users, ChevronDown, ChevronUp, Lightbulb, Sun, Cloud, CloudRain, CloudSnow, Zap, Eye } from "lucide-react";
import type { VenueInfo } from "@/lib/venues";
import type { WeatherData } from "@/app/api/weather/route";

function WeatherIcon({ code, isDay, size = 16 }: { code: number; isDay: boolean; size?: number }) {
  if (code === 0 || code === 1) return isDay ? <Sun size={size} className="text-amber-400" /> : <Eye size={size} className="text-slate-400" />;
  if (code <= 3) return <Cloud size={size} className="text-slate-400" />;
  if (code <= 67) return <CloudRain size={size} className="text-slate-300" />;
  if (code <= 77) return <CloudSnow size={size} className="text-slate-300" />;
  if (code <= 82) return <CloudRain size={size} className="text-slate-400" />;
  return <Zap size={size} className="text-amber-400" />;
}

// ── Cramp Watch™ — heat-stress read from REAL ambient data ───────────────────
// Bands follow standard heat-index guidance applied to Open-Meteo's apparent
// temperature (which already folds in humidity). Honest limits, stated in the
// label: this is AMBIENT weather at the stadium, not pitch-surface temperature,
// and several WC26 venues are climate-controlled — the outdoor reading doesn't
// apply inside them.
const CLIMATE_CONTROLLED = new Set([
  "AT&T Stadium",        // Arlington/Dallas — retractable roof
  "NRG Stadium",         // Houston — retractable roof
  "Mercedes-Benz Stadium", // Atlanta — retractable roof
  "BC Place",            // Vancouver — retractable roof
  "SoFi Stadium",        // Inglewood/LA — fixed canopy
]);

function crampWatch(feelsC: number, humidity: number): {
  level: "Low" | "Moderate" | "High" | "Extreme";
  color: string;
  note: string;
} | null {
  if (feelsC >= 39) return { level: "Extreme", color: "text-red-400", note: "cooling breaks likely · severe cramp & dehydration risk late" };
  if (feelsC >= 32) return { level: "High", color: "text-brand-gold", note: "elevated cramp risk in the final 30′ · watch hydration" };
  if (feelsC >= 27) return { level: "Moderate", color: "text-slate-300", note: humidity >= 60 ? "humid — hydration matters as legs tire" : "hydration matters as legs tire" };
  return null; // Low — no banner needed
}

function WeatherStrip({ venueName, lat, lng }: { venueName: string; lat: number; lng: number }) {
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ venue: venueName });
    fetch(`/api/weather?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setWeather(d))
      .catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueName, lat, lng]);

  if (!weather) {
    return (
      <div className="flex items-center gap-4 py-3 px-4 border-t border-brand-border/50 animate-pulse">
        <div className="h-4 w-32 bg-brand-border/40 rounded" />
        <div className="h-4 w-24 bg-brand-border/40 rounded" />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 px-4 border-t border-brand-border/50 text-xs text-slate-400">
      <div className="flex items-center gap-1.5 font-semibold text-white">
        <WeatherIcon code={weather.conditionCode} isDay={weather.isDay} />
        <span>{weather.tempC}°C</span>
        <span className="font-normal text-slate-500 text-[10px]">({weather.condition})</span>
      </div>
      <div className="flex items-center gap-1">
        <Thermometer size={11} className="text-slate-500" />
        <span>Feels {weather.feelsLikeC}°C</span>
      </div>
      <div className="flex items-center gap-1">
        <Droplets size={11} className="text-slate-500" />
        <span>{weather.humidity}%</span>
      </div>
      <div className="flex items-center gap-1">
        <Wind size={11} className="text-slate-500" />
        <span>{weather.windKph} km/h {weather.windDir}</span>
      </div>
      {weather.precipMm > 0 && (
        <div className="flex items-center gap-1 text-slate-300">
          <CloudRain size={11} />
          <span>{weather.precipMm.toFixed(1)} mm</span>
        </div>
      )}
      <div className="ml-auto text-[10px] text-slate-600 tabular-nums hidden sm:block">
        H:{weather.forecastHigh}° L:{weather.forecastLow}°
        {weather.forecastPrecipMm > 0 ? ` · ${weather.forecastPrecipMm.toFixed(1)}mm` : ""}
      </div>

      {/* Cramp Watch™ — only surfaces when heat is a real factor */}
      {(() => {
        const cw = crampWatch(weather.feelsLikeC, weather.humidity);
        if (!cw) return null;
        const covered = CLIMATE_CONTROLLED.has(venueName);
        return (
          <div className="w-full flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-1.5 mt-0.5 border-t border-brand-border/40">
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Cramp Watch™</span>
            <span className={`text-[11px] font-black ${cw.color}`}>{cw.level}</span>
            <span className="text-[10px] text-slate-500">
              heat index {weather.feelsLikeC}° · {weather.humidity}% RH — {cw.note}
            </span>
            <span className="text-[9px] text-slate-700 w-full sm:w-auto sm:ml-auto">
              ambient at stadium (Open-Meteo){covered ? " · climate-controlled venue — outdoor reading" : ""}
            </span>
          </div>
        );
      })()}
    </div>
  );
}

interface Props {
  venueName: string;
  venueInfo: VenueInfo;
}

export default function StadiumInfoCard({ venueName, venueInfo }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [factIdx, setFactIdx] = useState(0);

  const nextFact = useCallback(() => {
    setFactIdx(i => (i + 1) % venueInfo.didYouKnow.length);
  }, [venueInfo.didYouKnow.length]);

  // Auto-rotate facts every 6 seconds
  useEffect(() => {
    if (venueInfo.didYouKnow.length <= 1) return;
    const id = setInterval(nextFact, 6000);
    return () => clearInterval(id);
  }, [nextFact, venueInfo.didYouKnow.length]);

  const altLabel = venueInfo.altitudeM >= 1000
    ? `${venueInfo.altitudeM.toLocaleString()}m — thin air!`
    : venueInfo.altitudeM >= 300
    ? `${venueInfo.altitudeM}m`
    : `${venueInfo.altitudeM}m (sea level)`;

  const altColor = venueInfo.altitudeM >= 1500
    ? "text-amber-400"
    : venueInfo.altitudeM >= 600
    ? "text-amber-200"
    : "text-slate-400";

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800/60 via-brand-card to-slate-800/60 px-4 py-3 border-b border-brand-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin size={13} className="text-brand-gold" />
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Stadium Info</span>
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
        >
          {expanded ? <><ChevronUp size={12} /> Less</> : <><ChevronDown size={12} /> More</>}
        </button>
      </div>

      {/* Key stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-brand-border/30">
        <div className="bg-brand-card px-4 py-3 flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-600 uppercase tracking-wider">Stadium</span>
          <span className="text-sm font-semibold text-slate-200 leading-tight">{venueName}</span>
        </div>
        <div className="bg-brand-card px-4 py-3 flex flex-col gap-0.5">
          <div className="flex items-center gap-1 text-[10px] text-slate-600 uppercase tracking-wider">
            <Users size={10} /> Capacity
          </div>
          <span className="text-sm font-semibold text-slate-200">{venueInfo.capacity.toLocaleString()}</span>
        </div>
        <div className="bg-brand-card px-4 py-3 flex flex-col gap-0.5">
          <div className="flex items-center gap-1 text-[10px] text-slate-600 uppercase tracking-wider">
            <Mountain size={10} /> Altitude
          </div>
          <span className={`text-sm font-semibold ${altColor}`}>{altLabel}</span>
        </div>
        <div className="bg-brand-card px-4 py-3 flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-600 uppercase tracking-wider">Avg June Temp</span>
          <span className="text-sm font-semibold text-slate-200">{venueInfo.avgJuneTempC}°C · {venueInfo.avgJuneHumidityPct}% humidity</span>
        </div>
      </div>

      {/* Live weather strip */}
      <WeatherStrip venueName={venueName} lat={venueInfo.lat} lng={venueInfo.lng} />

      {/* Did you know */}
      <div className="px-4 py-3 border-t border-brand-border/50 flex items-start gap-3">
        <Lightbulb size={14} className="text-brand-gold shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 leading-relaxed">{venueInfo.didYouKnow[factIdx]}</p>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex gap-1">
              {venueInfo.didYouKnow.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setFactIdx(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${i === factIdx ? "bg-brand-gold" : "bg-brand-border hover:bg-slate-600"}`}
                />
              ))}
            </div>
            <button onClick={nextFact} className="text-[10px] text-slate-600 hover:text-brand-gold transition-colors">
              Next fact →
            </button>
          </div>
        </div>
      </div>

      {/* Expanded: coordinates + climate context */}
      {expanded && (
        <div className="border-t border-brand-border/50 px-4 py-3 grid grid-cols-2 gap-3 text-xs text-slate-500">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">Coordinates</div>
            <div className="tabular-nums">{venueInfo.lat.toFixed(4)}°, {venueInfo.lng.toFixed(4)}°</div>
            <div className="text-[10px] text-slate-600 mt-0.5">{venueInfo.timezone}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">Altitude</div>
            <div className={altColor}>{venueInfo.altitudeM.toLocaleString()} m above sea level</div>
            {venueInfo.altitudeM >= 1000 && (
              <div className="text-[10px] text-amber-500/70 mt-0.5">
                High altitude reduces O₂ by ~{Math.round((1 - Math.exp(-venueInfo.altitudeM / 8500)) * 100)}%
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">Avg June Climate</div>
            <div>{venueInfo.avgJuneTempC}°C · {venueInfo.avgJuneHumidityPct}% humidity</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">Country</div>
            <div>{venueInfo.city}, {venueInfo.country}</div>
          </div>
        </div>
      )}
    </div>
  );
}
