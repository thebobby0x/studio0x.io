"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { geoNaturalEarth1, geoPath, geoInterpolate } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import { getAllVenues, getVenueInfo } from "@/lib/venues";
import type { FlightArc } from "@/app/api/flight-paths/route";
import type { VenueDensity } from "@/app/api/flight-density/route";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const GOLD  = "#f5a623";
const GREEN = "#00b140";
const BLUE  = "#3b82f6";
const W = 960;
const H = 500;

// FIFA WC 2026: 26 players + ~36 support staff (coaches, medics, analysts, kit, federation officials)
const TEAM_PARTY_SIZE = 62;

const projection = geoNaturalEarth1().scale(155).translate([W / 2, H / 2]);
const pathGen    = geoPath(projection);

function arcPath(fromLng: number, fromLat: number, toLng: number, toLat: number): string {
  const interp = geoInterpolate([fromLng, fromLat], [toLng, toLat]);
  const pts    = Array.from({ length: 61 }, (_, i) => interp(i / 60) as [number, number]);
  const proj   = pts.map(p => projection(p)).filter(Boolean) as [number, number][];
  if (proj.length < 2) return "";
  return "M" + proj.map(p => p.join(",")).join("L");
}

function dot(lng: number, lat: number): [number, number] | null {
  return projection([lng, lat]) ?? null;
}

const ALL_VENUES = getAllVenues();

function travelStats(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const R = 6371;
  const dLat = (toLat - fromLat) * Math.PI / 180;
  const dLng = (toLng - fromLng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(fromLat * Math.PI / 180) * Math.cos(toLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const km = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  const miles = Math.round(km * 0.621371);
  const hours = Math.round((km / 900 + 0.75) * 10) / 10;
  return { km, miles, hours };
}

type Layer = "home-arcs" | "venue-hops" | "density";

const LAYER_CONFIG: { id: Layer; label: string; color: string }[] = [
  { id: "home-arcs",  label: "Home arcs",   color: GOLD  },
  { id: "venue-hops", label: "Venue hops",  color: GREEN },
  { id: "density",    label: "Fan flights",  color: BLUE  },
];

interface VB { x: number; y: number; w: number; h: number }
const INIT_VB: VB = { x: 0, y: 0, w: W, h: H };

export default function WorldFlightMap() {
  const [countries,     setCountries]     = useState<string[]>([]);
  const [arcs,          setArcs]          = useState<FlightArc[]>([]);
  const [density,       setDensity]       = useState<VenueDensity[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [dashOffset,    setDashOffset]    = useState(0);
  const [activeLayers,  setActiveLayers]  = useState<Set<Layer>>(new Set(["home-arcs", "venue-hops", "density"]));
  const [followTla,     setFollowTla]     = useState("");
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null);
  const [selectedArc,   setSelectedArc]   = useState<FlightArc | null>(null);
  const [grabbing,      setGrabbing]      = useState(false);

  const svgRef     = useRef<SVGSVGElement>(null);
  const vbRef      = useRef<VB>(INIT_VB);
  const dragRef    = useRef<{ x: number; y: number } | null>(null);
  const touchRef   = useRef<{ dist: number } | null>(null);
  const didDragRef = useRef(false);
  const rafRef     = useRef<number | null>(null);
  const lastTsRef  = useRef(0);

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
    } finally { setLoading(false); }
  }, []);

  const fetchDensity = useCallback(async () => {
    try {
      const res = await fetch("/api/flight-density");
      if (res.ok) setDensity(await res.json());
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    fetchArcs(); fetchDensity();
    const t1 = setInterval(fetchArcs,    60_000);
    const t2 = setInterval(fetchDensity, 90_000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [fetchArcs, fetchDensity]);

  useEffect(() => {
    const tick = (ts: number) => {
      setDashOffset(prev => prev + (ts - lastTsRef.current) * 0.012);
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(ts => { lastTsRef.current = ts; rafRef.current = requestAnimationFrame(tick); });
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // Viewport helpers — all ops go through vbRef + direct setAttribute to avoid re-render on drag
  const applyVB = useCallback((vb: VB) => {
    vbRef.current = vb;
    svgRef.current?.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  }, []);

  const getScale = useCallback(() => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return { sx: 1, sy: 1 };
    return { sx: vbRef.current.w / r.width, sy: vbRef.current.h / r.height };
  }, []);

  // Non-passive wheel + touch listeners
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    function zoomAt(clientX: number, clientY: number, factor: number) {
      const r = el!.getBoundingClientRect();
      const { x, y, w, h } = vbRef.current;
      const svgX = ((clientX - r.left) / r.width)  * w + x;
      const svgY = ((clientY - r.top)  / r.height) * h + y;
      const nw   = Math.max(120, Math.min(W * 2.5, w * factor));
      const nh   = nw * (H / W);
      vbRef.current = { x: svgX - (svgX - x) * (nw / w), y: svgY - (svgY - y) * (nh / h), w: nw, h: nh };
      el!.setAttribute("viewBox", `${vbRef.current.x} ${vbRef.current.y} ${nw} ${nh}`);
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.18 : 1 / 1.18);
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length < 2) return;
      e.preventDefault();
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (touchRef.current) {
        const factor = touchRef.current.dist / dist;
        const cx = (t1.clientX + t2.clientX) / 2;
        const cy = (t1.clientY + t2.clientY) / 2;
        zoomAt(cx, cy, factor);
      }
      touchRef.current = { dist };
    }

    el.addEventListener("wheel",     onWheel,     { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      el.removeEventListener("wheel",     onWheel);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  // Zoom button helpers
  function zoomBy(factor: number) {
    const { x, y, w, h } = vbRef.current;
    const nw = Math.max(120, Math.min(W * 2.5, w * factor));
    const nh = nw * (H / W);
    applyVB({ x: x + (w - nw) / 2, y: y + (h - nh) / 2, w: nw, h: nh });
  }
  function resetView() { applyVB(INIT_VB); }

  // Mouse drag
  function onMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    didDragRef.current = false;
    dragRef.current    = { x: e.clientX, y: e.clientY };
    setGrabbing(true);
  }

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!dragRef.current) return;
    const { sx, sy } = getScale();
    const dx = (e.clientX - dragRef.current.x) * sx;
    const dy = (e.clientY - dragRef.current.y) * sy;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDragRef.current = true;
    dragRef.current = { x: e.clientX, y: e.clientY };
    applyVB({ ...vbRef.current, x: vbRef.current.x - dx, y: vbRef.current.y - dy });
  }

  function onMouseUp() { dragRef.current = null; setGrabbing(false); }

  // Touch single-finger pan
  function onTouchStart(e: React.TouchEvent<SVGSVGElement>) {
    if (e.touches.length === 1) {
      dragRef.current  = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      touchRef.current = null;
    } else {
      dragRef.current = null;
    }
  }

  function onTouchEnd() { dragRef.current = null; touchRef.current = null; }

  // Single-finger pan on SVG (non-pinch handled in useEffect)
  function onTouchMoveSingle(e: React.TouchEvent<SVGSVGElement>) {
    if (e.touches.length !== 1 || !dragRef.current) return;
    const { sx, sy } = getScale();
    const dx = (e.touches[0].clientX - dragRef.current.x) * sx;
    const dy = (e.touches[0].clientY - dragRef.current.y) * sy;
    dragRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    applyVB({ ...vbRef.current, x: vbRef.current.x - dx, y: vbRef.current.y - dy });
  }

  // Derived state
  const densityByName  = Object.fromEntries(density.map(d => [d.name, d.count]));
  const maxDensity     = Math.max(1, ...density.map(d => d.count));
  const totalAircraft  = density.reduce((s, d) => s + d.count, 0);
  const offset         = -((dashOffset % 10));
  const followedArc    = followTla ? arcs.find(a => a.tla === followTla) ?? null : null;
  const venueInfo      = selectedVenue ? getVenueInfo(selectedVenue) : null;
  const homeArcCount   = arcs.filter(a => a.phase === "home-to-venue").length;
  const venueHopCount  = arcs.filter(a => a.phase === "venue-to-venue").length;

  const toggleLayer = (l: Layer) =>
    setActiveLayers(prev => { const n = new Set(prev); n.has(l) ? n.delete(l) : n.add(l); return n; });

  function arcOpacity(arc: FlightArc) {
    return !followTla ? 0.8 : arc.tla === followTla ? 1 : 0.07;
  }

  function handleArcClick(arc: FlightArc) {
    if (didDragRef.current) return;
    setSelectedArc(arc); setSelectedVenue(null); setFollowTla(arc.tla);
  }

  function handleVenueClick(name: string) {
    if (didDragRef.current) return;
    if (selectedVenue === name) { setSelectedVenue(null); return; }
    setSelectedVenue(name); setSelectedArc(null); setFollowTla("");
  }

  function clearSelection() { setSelectedVenue(null); setSelectedArc(null); setFollowTla(""); }

  const visibleArcs = arcs.filter(a =>
    a.phase === "home-to-venue" ? activeLayers.has("home-arcs") : activeLayers.has("venue-hops")
  );

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
        <div className="flex items-center gap-1.5 flex-wrap">
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
                  : { borderColor: "#334155", color: "#64748b" }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: on ? color : "#334155" }} />
                {label}
                {id === "density"    && on && totalAircraft > 0  && <span className="ml-0.5 opacity-60">{totalAircraft}</span>}
                {id === "home-arcs" && on && homeArcCount > 0   && <span className="ml-0.5 opacity-60">{homeArcCount} teams</span>}
                {id === "venue-hops"&& on && venueHopCount > 0  && <span className="ml-0.5 opacity-60">{venueHopCount} teams</span>}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center border border-slate-700 rounded-lg overflow-hidden text-slate-400">
            <button onClick={() => zoomBy(1 / 1.5)} className="px-2.5 py-1 hover:text-white hover:bg-slate-800 transition-colors font-mono leading-none">+</button>
            <div className="w-px h-4 bg-slate-700" />
            <button onClick={() => zoomBy(1.5)}     className="px-2.5 py-1 hover:text-white hover:bg-slate-800 transition-colors font-mono leading-none">−</button>
            <div className="w-px h-4 bg-slate-700" />
            <button onClick={resetView}              className="px-2 py-1 text-[9px] hover:text-white hover:bg-slate-800 transition-colors tracking-widest">FIT</button>
          </div>

          <span className="text-[9px] uppercase tracking-widest text-slate-600">Follow</span>
          <select
            value={followTla}
            onChange={e => {
              const tla = e.target.value;
              setFollowTla(tla);
              setSelectedArc(tla ? (arcs.find(a => a.tla === tla) ?? null) : null);
              if (tla) setSelectedVenue(null);
            }}
            className="text-[11px] bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-300 focus:outline-none focus:border-slate-500 cursor-pointer"
          >
            <option value="">All teams</option>
            {arcs.map(a => <option key={a.tla} value={a.tla}>{a.tla}</option>)}
          </select>
          {followTla && (
            <button onClick={clearSelection} className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors">✕</button>
          )}
        </div>
      </div>

      {/* ── SVG Map ── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{
          width: "100%", height: "auto", display: "block", background: "#0a0e1a",
          cursor: grabbing ? "grabbing" : "grab",
          touchAction: "none",
          userSelect: "none",
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMoveSingle}
        onTouchEnd={onTouchEnd}
      >
        {/* Countries */}
        {countries.map((d, i) => (
          <path key={i} d={d} fill="#1a2234" stroke="#243044" strokeWidth={0.4} />
        ))}

        {/* Density rings — faint base ring always visible, larger ring scaled to traffic count */}
        {activeLayers.has("density") && ALL_VENUES.map(venue => {
          const pt      = dot(venue.lng, venue.lat);
          if (!pt) return null;
          const count     = densityByName[venue.name] ?? 0;
          const intensity = count > 0 ? count / maxDensity : 0;
          return (
            <g key={`heat-${venue.name}`}>
              <circle cx={pt[0]} cy={pt[1]} r={6} fill="none" stroke={BLUE} strokeWidth={0.8} strokeOpacity={0.2} />
              {count > 0 && (
                <circle cx={pt[0]} cy={pt[1]} r={10 + intensity * 30} fill="none" stroke={BLUE}
                  strokeWidth={1.5} strokeOpacity={0.15 + intensity * 0.4} />
              )}
            </g>
          );
        })}

        {/* Arcs */}
        {visibleArcs.map(arc => {
          const d = arcPath(arc.fromLng, arc.fromLat, arc.toLng, arc.toLat);
          if (!d) return null;
          const color    = arc.phase === "home-to-venue" ? GOLD : GREEN;
          const isFollow = followTla === arc.tla;
          return (
            <path
              key={`arc-${arc.tla}`} d={d}
              fill="none" stroke={color}
              strokeWidth={isFollow ? 2.5 : 1.5}
              strokeOpacity={arcOpacity(arc)}
              strokeDasharray="6 4" strokeDashoffset={offset} strokeLinecap="round"
              style={{ cursor: "pointer" }}
              onClick={() => handleArcClick(arc)}
            />
          );
        })}

        {/* Arc dots */}
        {visibleArcs.map(arc => {
          const from = dot(arc.fromLng, arc.fromLat);
          const to   = dot(arc.toLng,   arc.toLat);
          const color = arc.phase === "home-to-venue" ? GOLD : GREEN;
          const op    = arcOpacity(arc);
          return (
            <g key={`dots-${arc.tla}`} style={{ cursor: "pointer" }} onClick={() => handleArcClick(arc)}>
              {from && <circle cx={from[0]} cy={from[1]} r={2.5} fill={color} fillOpacity={op * 0.9} />}
              {to   && <circle cx={to[0]}   cy={to[1]}   r={2.5} fill={color} fillOpacity={op * 0.9} />}
            </g>
          );
        })}

        {/* Follow-team pulsing beacon */}
        {followedArc && (() => {
          const to = dot(followedArc.toLng, followedArc.toLat);
          if (!to) return null;
          const color = followedArc.phase === "home-to-venue" ? GOLD : GREEN;
          return (
            <g>
              <circle cx={to[0]} cy={to[1]} r={6} fill={color} fillOpacity={0.5}>
                <animate attributeName="r"       from="6"   to="22"  dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.5" to="0"   dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx={to[0]} cy={to[1]} r={4.5} fill={color} />
              <circle cx={to[0]} cy={to[1]} r={2}   fill="white" />
            </g>
          );
        })()}

        {/* Venue markers */}
        {ALL_VENUES.map(venue => {
          const pt = dot(venue.lng, venue.lat);
          if (!pt) return null;
          const sel = selectedVenue === venue.name;
          return (
            <g key={venue.name} style={{ cursor: "pointer" }} onClick={() => handleVenueClick(venue.name)}>
              <circle cx={pt[0]} cy={pt[1]} r={sel ? 11 : 7} fill={GOLD} fillOpacity={sel ? 0.25 : 0.1} />
              <circle cx={pt[0]} cy={pt[1]} r={3}             fill={GOLD} fillOpacity={sel ? 1    : 0.85} />
              {sel && <circle cx={pt[0]} cy={pt[1]} r={1.5} fill="white" />}
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
                <p className="mt-2.5 text-[11px] text-slate-500 italic leading-relaxed">"{venueInfo.didYouKnow[0]}"</p>
              )}
            </div>
            <button onClick={() => setSelectedVenue(null)} className="text-slate-600 hover:text-slate-400 text-lg leading-none shrink-0 transition-colors">×</button>
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
                {selectedArc.fromLabel}<span className="mx-2 text-slate-600">→</span>{selectedArc.toLabel}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {selectedArc.phase === "home-to-venue" ? "Home country → first match venue" : "Venue → next match venue"}
              </div>
              {(() => {
                const s = travelStats(selectedArc.fromLat, selectedArc.fromLng, selectedArc.toLat, selectedArc.toLng);
                const personMiles = (s.miles * TEAM_PARTY_SIZE).toLocaleString();
                return (
                  <div className="flex flex-col gap-1 mt-2.5 text-[11px] text-slate-500">
                    <div className="flex gap-4">
                      <span>✈ {s.miles.toLocaleString()} mi · {s.km.toLocaleString()} km</span>
                      <span>⏱ ~{s.hours}h flight</span>
                    </div>
                    <div className="flex gap-4 text-slate-600">
                      <span>👥 ~{TEAM_PARTY_SIZE} traveling</span>
                      <span>🗺 {personMiles} person-miles</span>
                    </div>
                  </div>
                );
              })()}
            </div>
            <button onClick={clearSelection} className="text-slate-600 hover:text-slate-400 text-lg leading-none shrink-0 transition-colors">×</button>
          </div>
        </div>
      )}

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2.5 border-t border-slate-800">
        <span className="text-[10px] text-slate-600">Scroll or pinch to zoom · drag to pan · click venue or arc</span>
        <div className="flex items-center gap-1.5 ml-auto text-[10px] text-slate-600">
          <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke={GOLD}  strokeWidth="2" strokeDasharray="5 3" /></svg>Home
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
          <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke={GREEN} strokeWidth="2" strokeDasharray="5 3" /></svg>Venue hop
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <circle cx="5" cy="5" r="4" fill="none" stroke={BLUE} strokeWidth="1.5" strokeOpacity="0.6" />
          </svg>Fan flights
        </div>
      </div>
    </div>
  );
}
