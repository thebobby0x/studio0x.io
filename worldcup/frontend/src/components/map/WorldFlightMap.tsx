"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { geoNaturalEarth1, geoPath, geoInterpolate } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import { getAllVenues, getVenueInfo } from "@/lib/venues";
import type { FlightArc } from "@/app/api/flight-paths/route";
import type { VenueDensity } from "@/app/api/flight-density/route";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const GOLD = "#f5a623";
const GREEN = "#00b140";
const BLUE = "#3b82f6";
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

type Layer = "home-arcs" | "venue-hops" | "density";

const LAYER_CONFIG: { id: Layer; label: string; color: string }[] = [
  { id: "home-arcs",  label: "Home arcs",   color: GOLD  },
  { id: "venue-hops", label: "Venue hops",  color: GREEN },
  { id: "density",    label: "Air traffic", color: BLUE  },
];

export default function WorldFlightMap() {
  const [countries,    setCountries]    = useState<string[]>([]);
  const [arcs,         setArcs]         = useState<FlightArc[]>([]);
  const [density,      setDensity]      = useState<VenueDensity[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [dashOffset,   setDashOffset]   = useState(0);
  const [activeLayers, setActiveLayers] = useState<Set<Layer>>(new Set(["home-arcs", "venue-hops", "density"]));
  const [followTla,    setFollowTla]    = useState("");
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null);
  const [selectedArc,   setSelectedArc]   = useState<FlightArc | null>(null);
  const rafRef    = useRef<number | null>(null);
  const lastTsRef = useRef(0);

  useEffect(() => {
    fetch(GEO_URL)
      .then(r => r.json())
      .then((topo: Topology) => {
        const geo = feature(topo, topo.objects.countries as GeometryCollection);
        setCountries(geo.features.map(f => pathGen(f) ?? "").filter(Boolean));
      })
      .catch(() => setCountries([]));
  }, []);

  const fetchArcs = useCallback(async () => {
    try {
      const res = await fetch("/api/flight-paths");
      if (res.ok) setArcs(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDensity = useCallback(async () => {
    try {
      const res = await fetch("/api/flight-density");
      if (res.ok) setDensity(await res.json());
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    fetchArcs();
    fetchDensity();
    const t1 = setInterval(fetchArcs,   60_000);
    const t2 = setInterval(fetchDensity, 90_000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [fetchArcs, fetchDensity]);

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

  const densityByName = Object.fromEntries(density.map(d => [d.name, d.count]));
  const maxDensity    = Math.max(1, ...density.map(d => d.count));
  const offset        = -((dashOffset % 10));

  const toggleLayer = (layer: Layer) =>
    setActiveLayers(prev => {
      const next = new Set(prev);
      next.has(layer) ? next.delete(layer) : next.add(layer);
      return next;
    });

  const followedArc = followTla ? arcs.find(a => a.tla === followTla) ?? null : null;

  function arcOpacity(arc: FlightArc) {
    if (!followTla) return 0.8;
    return arc.tla === followTla ? 1 : 0.08;
  }

  function handleArcClick(arc: FlightArc) {
    setSelectedArc(arc);
    setSelectedVenue(null);
    setFollowTla(arc.tla);
  }

  function handleVenueClick(name: string) {
    if (selectedVenue === name) { setSelectedVenue(null); return; }
    setSelectedVenue(name);
    setSelectedArc(null);
    setFollowTla("");
  }

  function clearSelection() {
    setSelectedVenue(null);
    setSelectedArc(null);
    setFollowTla("");
  }

  const visibleArcs = arcs.filter(a =>
    a.phase === "home-to-venue" ? activeLayers.has("home-arcs") : activeLayers.has("venue-hops")
  );

  const venueInfo = selectedVenue ? getVenueInfo(selectedVenue) : null;

  if (loading && countries.length === 0) {
    return (
      <div className="w-full h-[500px] rounded-2xl bg-[#0a0e1a] border border-slate-700 flex items-center justify-center">
        <p className="text-slate-500 text-sm animate-pulse">Loading flight paths...</p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl bg-[#0a0e1a] border border-slate-700 overflow-hidden">

      {/* ── Control bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-800">

        {/* Layer toggles */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-widest text-slate-600 mr-0.5">Show</span>
          {LAYER_CONFIG.map(({ id, label, color }) => {
            const on = activeLayers.has(id);
            return (
              <button
                key={id}
                onClick={() => toggleLayer(id)}
                className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border transition-all"
                style={on
                  ? { borderColor: `${color}55`, background: `${color}18`, color }
                  : { borderColor: "#334155", color: "#64748b", background: "transparent" }
                }
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: on ? color : "#334155" }} />
                {label}
              </button>
            );
          })}
        </div>

        {/* Follow team */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-widest text-slate-600">Follow</span>
          <select
            value={followTla}
            onChange={e => {
              const tla = e.target.value;
              setFollowTla(tla);
              if (tla) {
                const arc = arcs.find(a => a.tla === tla) ?? null;
                setSelectedArc(arc);
                setSelectedVenue(null);
              } else {
                setSelectedArc(null);
              }
            }}
            className="text-[11px] bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-300 focus:outline-none focus:border-slate-500 cursor-pointer"
          >
            <option value="">All teams</option>
            {arcs.map(a => (
              <option key={a.tla} value={a.tla}>{a.tla}</option>
            ))}
          </select>
          {followTla && (
            <button onClick={clearSelection} className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── SVG Map ── */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", background: "#0a0e1a" }}
      >
        {/* Countries */}
        {countries.map((d, i) => (
          <path key={i} d={d} fill="#1a2234" stroke="#243044" strokeWidth={0.4} />
        ))}

        {/* Density rings */}
        {activeLayers.has("density") && ALL_VENUES.map(venue => {
          const pt = dot(venue.lng, venue.lat);
          if (!pt) return null;
          const count = densityByName[venue.name] ?? 0;
          if (count === 0) return null;
          const intensity = count / maxDensity;
          return (
            <circle
              key={`heat-${venue.name}`}
              cx={pt[0]} cy={pt[1]}
              r={8 + intensity * 28}
              fill="none" stroke={BLUE}
              strokeWidth={1.5}
              strokeOpacity={0.15 + intensity * 0.35}
            />
          );
        })}

        {/* Arcs */}
        {visibleArcs.map(arc => {
          const d = arcPath(arc.fromLng, arc.fromLat, arc.toLng, arc.toLat);
          if (!d) return null;
          const color   = arc.phase === "home-to-venue" ? GOLD : GREEN;
          const opacity = arcOpacity(arc);
          const isFollow = followTla === arc.tla;
          return (
            <path
              key={`arc-${arc.tla}`}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={isFollow ? 2.5 : 1.5}
              strokeOpacity={opacity}
              strokeDasharray="6 4"
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ cursor: "pointer" }}
              onClick={() => handleArcClick(arc)}
            />
          );
        })}

        {/* Arc endpoint dots */}
        {visibleArcs.map(arc => {
          const from  = dot(arc.fromLng, arc.fromLat);
          const to    = dot(arc.toLng,   arc.toLat);
          const color = arc.phase === "home-to-venue" ? GOLD : GREEN;
          const op    = arcOpacity(arc);
          return (
            <g key={`dots-${arc.tla}`} style={{ cursor: "pointer" }} onClick={() => handleArcClick(arc)}>
              {from && <circle cx={from[0]} cy={from[1]} r={2.5} fill={color} fillOpacity={op * 0.9} />}
              {to   && <circle cx={to[0]}   cy={to[1]}   r={2.5} fill={color} fillOpacity={op * 0.9} />}
            </g>
          );
        })}

        {/* Follow-team beacon (pulsing at destination) */}
        {followedArc && (() => {
          const to = dot(followedArc.toLng, followedArc.toLat);
          if (!to) return null;
          const color = followedArc.phase === "home-to-venue" ? GOLD : GREEN;
          return (
            <g>
              <circle cx={to[0]} cy={to[1]} r={6} fill={color} fillOpacity={0.5}>
                <animate attributeName="r"       from="6"   to="20"  dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.5" to="0"   dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx={to[0]} cy={to[1]} r={4.5} fill={color} />
              <circle cx={to[0]} cy={to[1]} r={2}   fill="white" />
            </g>
          );
        })()}

        {/* Venue markers */}
        {ALL_VENUES.map(venue => {
          const pt         = dot(venue.lng, venue.lat);
          if (!pt) return null;
          const isSelected = selectedVenue === venue.name;
          return (
            <g
              key={venue.name}
              style={{ cursor: "pointer" }}
              onClick={() => handleVenueClick(venue.name)}
            >
              <circle cx={pt[0]} cy={pt[1]} r={isSelected ? 11 : 7}  fill={GOLD} fillOpacity={isSelected ? 0.25 : 0.1} />
              <circle cx={pt[0]} cy={pt[1]} r={3}                      fill={GOLD} fillOpacity={isSelected ? 1   : 0.85} />
              {isSelected && <circle cx={pt[0]} cy={pt[1]} r={1.5} fill="white" />}
            </g>
          );
        })}
      </svg>

      {/* ── Venue info panel ── */}
      {selectedVenue && venueInfo && (
        <div className="border-t border-slate-800 px-5 py-4 bg-[#0d1220]">
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-[9px] uppercase tracking-widest text-slate-600 mb-1">Stadium</div>
              <div className="text-sm font-bold text-white">{selectedVenue}</div>
              <div className="text-xs text-slate-400 mt-0.5">{venueInfo.city} · {venueInfo.country}</div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5 text-[11px] text-slate-500">
                <span>⚽ {venueInfo.capacity.toLocaleString()} seats</span>
                {venueInfo.altitudeM > 0 && <span>⛰ {venueInfo.altitudeM} m altitude</span>}
                <span>🌡 {venueInfo.avgJuneTempC}°C · {venueInfo.avgJuneHumidityPct}% humidity in June</span>
              </div>
              {venueInfo.didYouKnow.length > 0 && (
                <p className="mt-2.5 text-[11px] text-slate-500 italic leading-relaxed">
                  "{venueInfo.didYouKnow[0]}"
                </p>
              )}
            </div>
            <button
              onClick={() => setSelectedVenue(null)}
              className="text-slate-600 hover:text-slate-400 transition-colors text-lg leading-none shrink-0"
            >×</button>
          </div>
        </div>
      )}

      {/* ── Team / arc info panel ── */}
      {selectedArc && !selectedVenue && (
        <div className="border-t border-slate-800 px-5 py-4 bg-[#0d1220]">
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[9px] uppercase tracking-widest text-slate-600">Team movement</span>
                <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${
                  selectedArc.status === "in-transit"
                    ? "bg-emerald-900/40 text-emerald-400"
                    : "bg-slate-800 text-slate-500"
                }`}>
                  {selectedArc.status === "in-transit" ? "In transit" : "Scheduled"}
                </span>
              </div>
              <div className="text-base font-black" style={{ color: selectedArc.phase === "home-to-venue" ? GOLD : GREEN }}>
                {selectedArc.tla}
              </div>
              <div className="text-xs text-slate-300 mt-1">
                {selectedArc.fromLabel}
                <span className="mx-2 text-slate-600">→</span>
                {selectedArc.toLabel}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {selectedArc.phase === "home-to-venue"
                  ? "Home country → first match venue"
                  : "Venue → next match venue"}
              </div>
            </div>
            <button
              onClick={clearSelection}
              className="text-slate-600 hover:text-slate-400 transition-colors text-lg leading-none shrink-0"
            >×</button>
          </div>
        </div>
      )}

      {/* ── Compact legend ── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2.5 border-t border-slate-800">
        <span className="text-[10px] text-slate-600">Click venue · arc · or pick a team to focus</span>
        <div className="flex items-center gap-1.5 ml-auto text-[10px] text-slate-600">
          <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke={GOLD}  strokeWidth="2" strokeDasharray="5 3" /></svg>Home
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
          <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke={GREEN} strokeWidth="2" strokeDasharray="5 3" /></svg>Venue hop
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <circle cx="5" cy="5" r="4" fill="none" stroke={BLUE} strokeWidth="1.5" strokeOpacity="0.6" />
          </svg>Air traffic
        </div>
      </div>
    </div>
  );
}
