"use client";

import { useUnits } from "@/lib/units";

// Client leaf so SERVER components (FatigueFactor etc.) can render distances
// that still respect the user's metric/imperial toggle.
export default function UnitDist({ km }: { km: number }) {
  const { distKm } = useUnits();
  return <>{distKm(km)}</>;
}
