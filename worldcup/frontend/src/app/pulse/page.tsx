"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Trophy, CalendarDays, Wifi, Radio, Star } from "lucide-react";
import { useEffect, useState } from "react";
import type { FlightArc } from "@/app/api/flight-paths/route";
import LiveClock from "@/components/ui/LiveClock";

const WorldFlightMap = dynamic(
  () => import("@/components/map/WorldFlightMap"),
  { ssr: false, loading: () => (
    <div className="w-full h-[500px] rounded-2xl bg-brand-card border border-brand-border animate-pulse" />
  )}
);

function useFlightStats() {
  const [arcs, setArcs] = useState<FlightArc[]>([]);
  useEffect(() => {
    fetch("/api/flight-paths").then(r => r.ok ? r.json() : []).then(setArcs).catch(() => {});
    const t = setInterval(() => {
      fetch("/api/flight-paths").then(r => r.ok ? r.json() : []).then(setArcs).catch(() => {});
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  return arcs;
}

export default function PulsePage() {
  const arcs = useFlightStats();
  const inTransit = arcs.filter(a => a.status === "in-transit").length;
  const venueToVenue = arcs.filter(a => a.phase === "venue-to-venue").length;
  const total = arcs.length;

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      <nav className="sticky top-0 z-50 border-b border-brand-border bg-brand-dark/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-brand-gold" />
            <span className="font-black text-white tracking-tight">WC 2026</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Dashboard</Link>
            <Link href="/schedule" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
              <CalendarDays size={13} />Schedule
            </Link>
            <Link href="/pulse" className="flex items-center gap-1.5 text-xs font-semibold text-brand-gold hover:text-amber-300 transition-colors">
              <Radio size={13} />Pulse
            </Link>
            <Link href="/predict" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
              <Star size={12} />Predict
            </Link>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <Wifi size={11} className="text-brand-green" />
              <span className="hidden sm:inline">Live</span>
            </div>
            <LiveClock />
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            World Cup <span className="text-brand-gold">Flight Tracker</span>
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Watch 32 nations converge on North America — home countries to venues, then venue to venue as the tournament unfolds
          </p>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-brand-card border border-brand-border px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Active arcs</div>
            <div className="text-2xl font-black text-white">{total}</div>
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
        </div>

        <WorldFlightMap />

        {/* Active arc list */}
        {arcs.length > 0 && (
          <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
            <div className="px-4 py-3 border-b border-brand-border text-xs font-semibold uppercase tracking-widest text-slate-500">
              Current Team Movements
            </div>
            <div className="divide-y divide-brand-border/50">
              {arcs.map(arc => (
                <div key={arc.tla} className="flex items-center gap-4 px-4 py-3">
                  <span className={`text-xs font-black w-8 ${arc.phase === "venue-to-venue" ? "text-brand-green" : "text-brand-gold"}`}>
                    {arc.tla}
                  </span>
                  <span className="text-xs text-slate-400 flex-1 min-w-0 truncate">
                    {arc.fromLabel} → {arc.toLabel}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                    arc.status === "in-transit"
                      ? "bg-brand-green/20 text-brand-green"
                      : arc.status === "in-city"
                        ? "bg-amber-500/15 text-amber-500"
                        : "bg-slate-800 text-slate-500"
                  }`}>
                    {arc.status === "in-transit"
                      ? "In transit"
                      : arc.status === "in-city"
                        ? "In host city"
                        : "At venue"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="mt-16 border-t border-brand-border py-8 text-center text-xs text-slate-600">
        studio0x.io · FIFA World Cup 2026 · Flight paths refresh every 60 seconds
      </footer>
    </div>
  );
}
