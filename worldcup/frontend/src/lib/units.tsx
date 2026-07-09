"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type UnitSystem = "metric" | "imperial";

interface UnitsCtx {
  units: UnitSystem;
  toggleUnits: () => void;
  tempC: (c: number) => string;
  distMi: (mi: number) => string;
  distKm: (km: number) => string;
  altM: (m: number) => string;
  windKph: (kph: number) => string;
  precipMm: (mm: number) => string;
}

const Ctx = createContext<UnitsCtx>({
  units: "metric",
  toggleUnits: () => {},
  tempC: (c) => `${c}°C`,
  distMi: (mi) => `${Math.round(mi / 0.621371).toLocaleString()} km`,
  distKm: (km) => `${Math.round(km).toLocaleString()} km`,
  altM: (m) => `${m.toLocaleString()} m`,
  windKph: (kph) => `${Math.round(kph)} km/h`,
  precipMm: (mm) => `${mm.toFixed(1)} mm`,
});

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [units, setUnits] = useState<UnitSystem>("metric");

  useEffect(() => {
    const s = localStorage.getItem("wc26_units");
    if (s === "imperial" || s === "metric") setUnits(s);
  }, []);

  function toggleUnits() {
    setUnits(prev => {
      const next = prev === "metric" ? "imperial" : "metric";
      localStorage.setItem("wc26_units", next);
      return next;
    });
  }

  const tempC = (c: number) =>
    units === "imperial" ? `${Math.round(c * 9 / 5 + 32)}°F` : `${c}°C`;

  const distMi = (mi: number) =>
    units === "imperial"
      ? `${mi.toLocaleString()} mi`
      : `${Math.round(mi / 0.621371).toLocaleString()} km`;

  const altM = (m: number) =>
    units === "imperial"
      ? `${Math.round(m * 3.28084).toLocaleString()} ft`
      : `${m.toLocaleString()} m`;

  const distKm = (km: number) =>
    units === "imperial"
      ? `${Math.round(km * 0.621371).toLocaleString()} mi`
      : `${Math.round(km).toLocaleString()} km`;

  const windKph = (kph: number) =>
    units === "imperial" ? `${Math.round(kph * 0.621371)} mph` : `${Math.round(kph)} km/h`;

  const precipMm = (mm: number) =>
    units === "imperial" ? `${(mm / 25.4).toFixed(2)} in` : `${mm.toFixed(1)} mm`;

  return (
    <Ctx.Provider value={{ units, toggleUnits, tempC, distMi, distKm, altM, windKph, precipMm }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUnits() {
  return useContext(Ctx);
}
