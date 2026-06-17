"use client";

import dynamic from "next/dynamic";
import { Plane, Users, DollarSign, Thermometer, ChevronRight, MapPin, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import type { FlightArc } from "@/app/api/flight-paths/route";
import type { CityTravelStats } from "@/app/api/travel-stats/route";
import AppNav from "@/components/ui/AppNav";
import { useUnits } from "@/lib/units";

const WorldFlightMap = dynamic(
  () => import("@/components/map/WorldFlightMap"),
  { ssr: false, loading: () => (
    <div className="w-full h-[500px] rounded-2xl bg-brand-card border border-brand-border animate-pulse" />
  )}
);

const TEAM_PARTY_SIZE = 62;

function arcDistanceMi(a: FlightArc): number {
  const R = 6371;
  const dLat = (a.toLat - a.fromLat) * Math.PI / 180;
  const dLng = (a.toLng - a.fromLng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.fromLat * Math.PI / 180) * Math.cos(a.toLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)) * 0.621371);
}

function fmtNum(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

function fmtRevenue(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function formatNextMatch(iso: string | null): string {
  if (!iso) return "No upcoming matches";
  const d = new Date(iso);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff < 0) return "In progress";
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "Starting soon";
  if (hours < 24) return `In ${hours}h`;
  const days = Math.floor(hours / 24);
  return `In ${days}d ${hours % 24}h`;
}

function TempBadge({ c }: { c: number }) {
  const { tempC } = useUnits();
  const color = c >= 32 ? "text-red-400" : c >= 25 ? "text-amber-400" : "text-sky-400";
  return <span className={`text-[10px] font-semibold ${color}`}>{tempC(c)}</span>;
}

function CityCard({ city, expanded, onToggle }: {
  city: CityTravelStats;
  expanded: boolean;
  onToggle: () => void;
}) {
  const progressPct = city.matchCount > 0
    ? Math.round((city.completedCount / city.matchCount) * 100)
    : 0;

  return (
    <div
      className={`rounded-2xl overflow-hidden border transition-all duration-200 cursor-pointer ${
        city.hasMatchToday
          ? "border-brand-gold/40 bg-gradient-to-br from-amber-950/30 to-brand-card"
          : "border-brand-border bg-brand-card hover:border-slate-600"
      }`}
      onClick={onToggle}
    >
      {/* Top row */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-2xl shrink-0">{city.flag}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-white truncate">{city.name}</span>
                {city.hasMatchToday && (
                  <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-brand-gold/20 text-brand-gold uppercase tracking-wider">
                    Match today
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-600 truncate">{city.venue}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <TempBadge c={city.avgTempC} />
            <ChevronRight size={14} className={`text-slate-600 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </div>
        </div>

        {/* Key metrics row */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-slate-900/60 px-2.5 py-2">
            <div className="text-[9px] uppercase tracking-wider text-slate-600 mb-0.5">Arrivals/day</div>
            <div className="text-sm font-black text-white">{fmtNum(city.peakArrivals)}</div>
          </div>
          <div className="rounded-xl bg-slate-900/60 px-2.5 py-2">
            <div className="text-[9px] uppercase tracking-wider text-slate-600 mb-0.5">Est. revenue</div>
            <div className="text-sm font-black text-brand-gold">{fmtRevenue(city.totalEstimatedRevenue)}</div>
          </div>
          <div className="rounded-xl bg-slate-900/60 px-2.5 py-2">
            <div className="text-[9px] uppercase tracking-wider text-slate-600 mb-0.5">Matches</div>
            <div className="text-sm font-black text-white">
              {city.completedCount}<span className="text-slate-600">/{city.matchCount}</span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-green transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-slate-700 mt-1">
          <span>{city.completedCount} played</span>
          <span>{city.remainingCount} remaining · {formatNextMatch(city.nextMatchDate)}</span>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-brand-border/60 px-4 py-3 space-y-3">
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <Plane size={12} className="text-slate-500 shrink-0" />
              <div>
                <div className="text-[9px] text-slate-600">Intl flights/day</div>
                <div className="text-xs font-semibold text-white">{city.intlFlightsPerDay.toLocaleString()}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Users size={12} className="text-slate-500 shrink-0" />
              <div>
                <div className="text-[9px] text-slate-600">International fans</div>
                <div className="text-xs font-semibold text-white">{city.intlSharePct}% of arrivals</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign size={12} className="text-slate-500 shrink-0" />
              <div>
                <div className="text-[9px] text-slate-600">Avg hotel/night</div>
                <div className="text-xs font-semibold text-white">${city.hotelRateUsd}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Thermometer size={12} className="text-slate-500 shrink-0" />
              <div>
                <div className="text-[9px] text-slate-600">Stadium capacity</div>
                <div className="text-xs font-semibold text-white">{city.capacity.toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Departures */}
          <div className="flex items-center justify-between text-[10px] bg-slate-900/40 rounded-xl px-3 py-2">
            <span className="text-slate-500">Departures/day (post-match)</span>
            <span className="font-semibold text-white">{fmtNum(city.peakDepartures)}</span>
          </div>

          {/* Revenue per match */}
          <div className="flex items-center justify-between text-[10px] bg-slate-900/40 rounded-xl px-3 py-2">
            <span className="text-slate-500">Est. revenue per match</span>
            <span className="font-semibold text-brand-gold">{fmtRevenue(city.estimatedRevenuePerMatch)}</span>
          </div>

          {/* Travel fact */}
          <div className="bg-blue-950/30 border border-blue-900/30 rounded-xl px-3 py-2">
            <div className="text-[9px] uppercase tracking-wider text-blue-500/70 mb-1">Travel fact</div>
            <div className="text-[11px] text-slate-400 leading-relaxed">{city.travelFact}</div>
          </div>
        </div>
      )}
    </div>
  );
}

interface TravelData {
  cities: CityTravelStats[];
  totals: {
    cities: number;
    matches: number;
    estimatedRevenue: number;
    fansArrivingToday: number;
    intlVisitors: number;
    economicImpact: number;
  };
}

export default function PulsePage() {
  const [arcs, setArcs] = useState<FlightArc[]>([]);
  const [travel, setTravel] = useState<TravelData | null>(null);
  const [expandedCity, setExpandedCity] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"cities" | "teams">("cities");

  useEffect(() => {
    fetch("/api/flight-paths").then(r => r.ok ? r.json() : []).then(setArcs).catch(() => {});
    fetch("/api/travel-stats").then(r => r.ok ? r.json() : null).then(setTravel).catch(() => {});

    const t = setInterval(() => {
      fetch("/api/flight-paths").then(r => r.ok ? r.json() : []).then(setArcs).catch(() => {});
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  const inTransit = arcs.filter(a => a.status === "in-transit").length;
  const venueToVenue = arcs.filter(a => a.phase === "venue-to-venue").length;
  const totalPersonMiles = arcs.reduce((s, a) => s + arcDistanceMi(a) * TEAM_PARTY_SIZE, 0);

  const todayCities = travel?.cities.filter(c => c.hasMatchToday) ?? [];
  const fansToday = todayCities.reduce((s, c) => s + c.peakArrivals, 0);

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      <AppNav />

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            Fan Travel <span className="text-brand-gold">Pulse</span>
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Real-time movement of 32 nations across 16 cities — team flights, fan arrivals, and tourism impact
          </p>
        </div>

        {/* Hero stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-amber-950/40 to-brand-card border border-amber-900/30 px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-amber-600 mb-1">Economic impact</div>
            <div className="text-2xl font-black text-white">$5.4B</div>
            <div className="text-[10px] text-slate-600 mt-0.5">projected total</div>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-blue-950/30 to-brand-card border border-blue-900/20 px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-blue-500 mb-1">Intl visitors</div>
            <div className="text-2xl font-black text-white">1.5M</div>
            <div className="text-[10px] text-slate-600 mt-0.5">projected travelers</div>
          </div>
          <div className="rounded-2xl bg-brand-card border border-brand-border px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Fan arrivals today</div>
            <div className="text-2xl font-black text-brand-green">{fansToday > 0 ? fmtNum(fansToday) : "—"}</div>
            <div className="text-[10px] text-slate-600 mt-0.5">{todayCities.length > 0 ? `across ${todayCities.length} cities` : "no matches today"}</div>
          </div>
          <div className="rounded-2xl bg-brand-card border border-brand-border px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Host cities</div>
            <div className="text-2xl font-black text-white">{travel?.totals.cities ?? 16}</div>
            <div className="text-[10px] text-slate-600 mt-0.5">across 3 nations</div>
          </div>
        </div>

        {/* Today's activity banner */}
        {todayCities.length > 0 && (
          <div className="rounded-2xl border border-brand-gold/30 bg-gradient-to-r from-amber-950/30 to-transparent px-5 py-4">
            <div className="text-[10px] uppercase tracking-widest text-amber-500/70 mb-2">Today&apos;s match cities</div>
            <div className="flex flex-wrap gap-3">
              {todayCities.map(c => (
                <div key={c.name} className="flex items-center gap-2 bg-amber-900/20 rounded-xl px-3 py-2">
                  <span>{c.flag}</span>
                  <div>
                    <div className="text-xs font-bold text-white">{c.name}</div>
                    <div className="text-[10px] text-slate-500">{fmtNum(c.peakArrivals)} arriving · {fmtRevenue(c.estimatedRevenuePerMatch)} rev est.</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Globe map */}
        <WorldFlightMap />

        {/* Tab switcher */}
        <div className="flex gap-2 border-b border-brand-border pb-0">
          <button
            onClick={() => setActiveTab("cities")}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-colors border-b-2 -mb-px ${
              activeTab === "cities"
                ? "text-white border-brand-gold"
                : "text-slate-500 border-transparent hover:text-slate-300"
            }`}
          >
            <MapPin size={11} className="inline mr-1.5" />
            Host Cities
          </button>
          <button
            onClick={() => setActiveTab("teams")}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-colors border-b-2 -mb-px ${
              activeTab === "teams"
                ? "text-white border-brand-gold"
                : "text-slate-500 border-transparent hover:text-slate-300"
            }`}
          >
            <Plane size={11} className="inline mr-1.5" />
            Team Movements
          </button>
        </div>

        {/* Cities tab */}
        {activeTab === "cities" && (
          <div className="space-y-3">
            {travel === null ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-32 rounded-2xl bg-brand-card border border-brand-border animate-pulse" />
                ))}
              </div>
            ) : (
              <>
                {/* Today's match cities first */}
                {todayCities.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-brand-gold mb-2">Match day</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {todayCities.map(c => (
                        <CityCard
                          key={c.name}
                          city={c}
                          expanded={expandedCity === c.name}
                          onToggle={() => setExpandedCity(expandedCity === c.name ? null : c.name)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* All cities */}
                <div>
                  {todayCities.length > 0 && (
                    <div className="text-[10px] uppercase tracking-widest text-slate-600 mb-2 mt-4">All host cities</div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {travel.cities.filter(c => !c.hasMatchToday).map(c => (
                      <CityCard
                        key={c.name}
                        city={c}
                        expanded={expandedCity === c.name}
                        onToggle={() => setExpandedCity(expandedCity === c.name ? null : c.name)}
                      />
                    ))}
                  </div>
                </div>

                {/* Totals footer */}
                <div className="rounded-2xl bg-brand-card border border-brand-border p-4 mt-4">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-3">Tournament totals (estimated)</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-slate-600">Total ticket revenue</div>
                      <div className="text-base font-black text-white">{fmtRevenue(travel.cities.reduce((s, c) => s + c.totalEstimatedRevenue, 0))}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">International visitors</div>
                      <div className="text-base font-black text-white">1.5M</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">Total matches</div>
                      <div className="text-base font-black text-white">{travel.totals.matches}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-600">Avg hotel/night</div>
                      <div className="text-base font-black text-white">
                        ${Math.round(travel.cities.reduce((s, c) => s + c.hotelRateUsd, 0) / travel.cities.length)}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Teams tab */}
        {activeTab === "teams" && (
          <div className="space-y-3">
            {/* Team flight stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl bg-brand-card border border-brand-border px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Active arcs</div>
                <div className="text-2xl font-black text-white">{arcs.length}</div>
                <div className="text-[10px] text-slate-600 mt-0.5">teams tracked</div>
              </div>
              <div className="rounded-2xl bg-brand-card border border-brand-border px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">In transit</div>
                <div className="text-2xl font-black text-brand-green">{inTransit}</div>
                <div className="text-[10px] text-slate-600 mt-0.5">within 48h of last match</div>
              </div>
              <div className="rounded-2xl bg-brand-card border border-brand-border px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Venue hops</div>
                <div className="text-2xl font-black text-brand-gold">{venueToVenue}</div>
                <div className="text-[10px] text-slate-600 mt-0.5">city-to-city moves</div>
              </div>
              <div className="rounded-2xl bg-brand-card border border-brand-border px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Person-miles</div>
                <div className="text-2xl font-black text-white">{totalPersonMiles > 0 ? (totalPersonMiles / 1_000_000).toFixed(1) + "M" : "—"}</div>
                <div className="text-[10px] text-slate-600 mt-0.5">~{TEAM_PARTY_SIZE} pax per team</div>
              </div>
            </div>

            {arcs.length > 0 && (
              <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
                <div className="px-4 py-3 border-b border-brand-border text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Current Team Movements
                </div>
                <div className="divide-y divide-brand-border/50">
                  {arcs.map(arc => {
                    const mi = arcDistanceMi(arc);
                    return (
                      <div key={arc.tla} className="flex items-center gap-4 px-4 py-3">
                        <span className={`text-xs font-black w-8 ${arc.phase === "venue-to-venue" ? "text-brand-green" : "text-brand-gold"}`}>
                          {arc.tla}
                        </span>
                        <span className="text-xs text-slate-400 flex-1 min-w-0 truncate">
                          {arc.fromLabel} → {arc.toLabel}
                        </span>
                        <span className="text-[10px] text-slate-600 shrink-0 tabular-nums hidden sm:inline">
                          {mi.toLocaleString()} mi
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                          arc.status === "in-transit"
                            ? "bg-brand-green/20 text-brand-green"
                            : arc.status === "in-city"
                              ? "bg-amber-500/15 text-amber-500"
                              : "bg-slate-800 text-slate-500"
                        }`}>
                          {arc.status === "in-transit" ? "In transit" : arc.status === "in-city" ? "In host city" : "At venue"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="mt-16 border-t border-brand-border py-8 text-center text-xs text-slate-600">
        studio0x.io · FIFA World Cup 2026 · Flight paths refresh every 60s · Revenue figures are estimates
      </footer>
    </div>
  );
}
