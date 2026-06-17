"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type UnitSystem = "metric" | "imperial";

interface UnitsCtx {
  units: UnitSystem;
  toggleUnits: () => void;
  tempC: (c: number) => string;
  distMi: (mi: number) => string;
  altM: (m: number) => string;
}

const Ctx = createContext<UnitsCtx>({
  units: "metric",
  toggleUnits: () => {},
  tempC: (c) => `${c}°C`,
  distMi: (mi) => `${Math.round(mi / 0.621371).toLocaleString()} km`,
  altM: (m) => `${m.toLocaleString()} m`,
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

  return (
    <Ctx.Provider value={{ units, toggleUnits, tempC, distMi, altM }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUnits() {
  return useContext(Ctx);
}
