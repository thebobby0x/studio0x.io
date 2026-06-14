"use client";

import { useEffect, useRef, useState } from "react";
import type { LineString } from "geojson";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  useMapContext,
} from "react-simple-maps";
import { geoInterpolate } from "d3-geo";
import { getAllVenues } from "@/lib/venues";
import type { FlightArc } from "@/app/api/flight-paths/route";

const GEO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const GOLD = "#f5a623";
const GREEN = "#00b140";

function interpolateArc(
  from: [number, number],
  to: [number, number],
  steps = 50
): [number, number][] {
  const interp = geoInterpolate(from, to);
  return Array.from({ length: steps + 1 }, (_, i) => interp(i / steps) as [number, number]);
}

interface ArcPathProps {
  arc: FlightArc;
  animOffset: number;
}

function ArcPath({ arc, animOffset }: ArcPathProps) {
  const { path } = useMapContext();

  const coords = interpolateArc(
    [arc.fromLng, arc.fromLat],
    [arc.toLng, arc.toLat],
    60
  );

  const lineData: LineString = {
    type: "LineString",
    coordinates: coords,
  };

  const d = path(lineData as never);
  if (!d) return null;

  const color = arc.phase === "home-to-venue" ? GOLD : GREEN;
  const dashLen = 6;
  const gapLen = 4;
  const totalDash = dashLen + gapLen;
  const offset = (animOffset * totalDash) % totalDash;

  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeOpacity={0.75}
      strokeDasharray={`${dashLen} ${gapLen}`}
      strokeDashoffset={-offset}
      strokeLinecap="round"
    />
  );
}

interface DotsProps {
  arc: FlightArc;
}

function ArcDots({ arc }: DotsProps) {
  const { projection } = useMapContext();
  if (!projection) return null;

  const fromPt = projection([arc.fromLng, arc.fromLat]);
  const toPt = projection([arc.toLng, arc.toLat]);

  const color = arc.phase === "home-to-venue" ? GOLD : GREEN;

  return (
    <>
      {fromPt && (
        <circle
          cx={fromPt[0]}
          cy={fromPt[1]}
          r={2.5}
          fill={color}
          fillOpacity={0.9}
        />
      )}
      {toPt && (
        <circle
          cx={toPt[0]}
          cy={toPt[1]}
          r={2.5}
          fill={color}
          fillOpacity={0.9}
        />
      )}
    </>
  );
}

const ALL_VENUES = getAllVenues();

export default function WorldFlightMap() {
  const [arcs, setArcs] = useState<FlightArc[]>([]);
  const [loading, setLoading] = useState(true);
  const [animOffset, setAnimOffset] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  async function fetchArcs() {
    try {
      const res = await fetch("/api/flight-paths");
      if (!res.ok) return;
      const data: FlightArc[] = await res.json();
      setArcs(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchArcs();
    const interval = setInterval(fetchArcs, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function tick(ts: number) {
      const delta = ts - lastTimeRef.current;
      lastTimeRef.current = ts;
      setAnimOffset((prev) => prev + delta * 0.012);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame((ts) => {
      lastTimeRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
    });
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (loading) {
    return (
      <div className="w-full h-[500px] rounded-2xl bg-[#0a0e1a] border border-slate-700 flex items-center justify-center">
        <p className="text-slate-500 text-sm animate-pulse">Loading flight paths...</p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl bg-[#0a0e1a] border border-slate-700 overflow-hidden">
      <ComposableMap
        projection="geoNaturalEarth1"
        projectionConfig={{ scale: 155 }}
        style={{ width: "100%", height: "500px", background: "#0a0e1a" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            (geographies as Array<{ rsmKey: string } & Record<string, unknown>>).map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#1e293b"
                stroke="#334155"
                strokeWidth={0.4}
                style={{
                  default: { outline: "none" },
                  hover: { outline: "none", fill: "#263448" },
                  pressed: { outline: "none" },
                }}
              />
            ))
          }
        </Geographies>

        {arcs.map((arc) => (
          <ArcPath key={`arc-${arc.tla}`} arc={arc} animOffset={animOffset} />
        ))}

        {arcs.map((arc) => (
          <ArcDots key={`dots-${arc.tla}`} arc={arc} />
        ))}

        {ALL_VENUES.map((venue) => (
          <Marker
            key={venue.name}
            coordinates={[venue.lng, venue.lat]}
          >
            <circle r={4} fill={GOLD} fillOpacity={0.25} />
            <circle r={2} fill={GOLD} fillOpacity={0.9} />
          </Marker>
        ))}
      </ComposableMap>

      <div className="flex items-center gap-6 px-4 py-3 border-t border-slate-800 bg-[#0a0e1a]">
        <div className="flex items-center gap-2">
          <span className="block w-5 h-0.5 bg-[#f5a623] opacity-75" style={{ backgroundImage: "repeating-linear-gradient(90deg,#f5a623 0,#f5a623 6px,transparent 6px,transparent 10px)" }} />
          <span className="text-xs text-slate-500">Home → first venue</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="block w-5 h-0.5 opacity-75" style={{ backgroundImage: "repeating-linear-gradient(90deg,#00b140 0,#00b140 6px,transparent 6px,transparent 10px)" }} />
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
