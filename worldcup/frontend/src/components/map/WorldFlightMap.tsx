"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { geoNaturalEarth1, geoPath, geoInterpolate } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import { getAllVenues } from "@/lib/venues";
import type { FlightArc } from "@/app/api/flight-paths/route";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const GOLD = "#f5a623";
const GREEN = "#00b140";
const W = 960;
const H = 500;

const projection = geoNaturalEarth1().scale(155).translate([W / 2, H / 2]);
const pathGen = geoPath(projection);

function arcPath(fromLng: number, fromLat: number, toLng: number, toLat: number): string {
  const interp = geoInterpolate([fromLng, fromLat], [toLng, toLat]);
  const pts = Array.from({ length: 61 }, (_, i) => interp(i / 60) as [number, number]);
  const projected = pts.map(p => projection(p)).filter(Boolean) as [number, number][];
  if (projected.length < 2) return "";
  return "M" + projected.map(p => p.join(",")).join("L");
}

function dot(lng: number, lat: number): [number, number] | null {
  return projection([lng, lat]) ?? null;
}

const ALL_VENUES = getAllVenues();

export default function WorldFlightMap() {
  const [countries, setCountries] = useState<string[]>([]);
  const [arcs, setArcs] = useState<FlightArc[]>([]);
  const [loading, setLoading] = useState(true);
  const [dashOffset, setDashOffset] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);

  // Load world geometry
  useEffect(() => {
    fetch(GEO_URL)
      .then(r => r.json())
      .then((topo: Topology) => {
        const geo = feature(topo, topo.objects.countries as GeometryCollection);
        const paths = geo.features.map(f => pathGen(f) ?? "").filter(Boolean);
        setCountries(paths);
      })
      .catch(() => setCountries([]));
  }, []);

  // Fetch flight arcs
  const fetchArcs = useCallback(async () => {
    try {
      const res = await fetch("/api/flight-paths");
      if (res.ok) setArcs(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArcs();
    const t = setInterval(fetchArcs, 60_000);
    return () => clearInterval(t);
  }, [fetchArcs]);

  // Animate dash offset
  useEffect(() => {
    const tick = (ts: number) => {
      const delta = ts - lastTsRef.current;
      lastTsRef.current = ts;
      setDashOffset(prev => prev + delta * 0.012);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(ts => {
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
    });
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  if (loading && countries.length === 0) {
    return (
      <div className="w-full h-[500px] rounded-2xl bg-[#0a0e1a] border border-slate-700 flex items-center justify-center">
        <p className="text-slate-500 text-sm animate-pulse">Loading flight paths...</p>
      </div>
    );
  }

  const dashTotal = 10;
  const offset = -(dashOffset % dashTotal);

  return (
    <div className="w-full rounded-2xl bg-[#0a0e1a] border border-slate-700 overflow-hidden">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", background: "#0a0e1a" }}
      >
        {/* Countries */}
        {countries.map((d, i) => (
          <path key={i} d={d} fill="#1e293b" stroke="#334155" strokeWidth={0.4} />
        ))}

        {/* Flight arcs */}
        {arcs.map(arc => {
          const d = arcPath(arc.fromLng, arc.fromLat, arc.toLng, arc.toLat);
          if (!d) return null;
          const color = arc.phase === "home-to-venue" ? GOLD : GREEN;
          return (
            <path
              key={`arc-${arc.tla}`}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeOpacity={0.8}
              strokeDasharray="6 4"
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          );
        })}

        {/* Arc endpoint dots */}
        {arcs.map(arc => {
          const from = dot(arc.fromLng, arc.fromLat);
          const to = dot(arc.toLng, arc.toLat);
          const color = arc.phase === "home-to-venue" ? GOLD : GREEN;
          return (
            <g key={`dots-${arc.tla}`}>
              {from && <circle cx={from[0]} cy={from[1]} r={2.5} fill={color} fillOpacity={0.9} />}
              {to && <circle cx={to[0]} cy={to[1]} r={2.5} fill={color} fillOpacity={0.9} />}
            </g>
          );
        })}

        {/* Venue markers */}
        {ALL_VENUES.map(venue => {
          const pt = dot(venue.lng, venue.lat);
          if (!pt) return null;
          return (
            <g key={venue.name}>
              <circle cx={pt[0]} cy={pt[1]} r={5} fill={GOLD} fillOpacity={0.15} />
              <circle cx={pt[0]} cy={pt[1]} r={2.5} fill={GOLD} fillOpacity={0.9} />
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-6 px-4 py-3 border-t border-slate-800">
        <div className="flex items-center gap-2">
          <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke={GOLD} strokeWidth="2" strokeDasharray="6 4" /></svg>
          <span className="text-xs text-slate-500">Home → first venue</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke={GREEN} strokeWidth="2" strokeDasharray="6 4" /></svg>
          <span className="text-xs text-slate-500">Venue → venue</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#f5a623] opacity-30" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#f5a623]" />
          </span>
          <span className="text-xs text-slate-500">Venue</span>
        </div>
      </div>
    </div>
  );
}
