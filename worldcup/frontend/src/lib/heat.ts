// ── Cramp Watch™ heat bands — single source of truth ─────────────────────────
// Used by the live match-page display (StadiumInfoCard) AND the Heat vs.
// Outcomes aggregate, so a "High" on screen always means the same threshold
// the tournament-wide numbers were bucketed with.
//
// Bands follow standard heat-index guidance applied to Open-Meteo's apparent
// temperature (which already folds in humidity). Honest limits: this is
// AMBIENT weather at the stadium, not pitch-surface temperature.

export type HeatBand = "Low" | "Moderate" | "High" | "Extreme";

export const CLIMATE_CONTROLLED = new Set([
  "AT&T Stadium",          // Arlington/Dallas — retractable roof
  "NRG Stadium",           // Houston — retractable roof
  "Mercedes-Benz Stadium", // Atlanta — retractable roof
  "BC Place",              // Vancouver — retractable roof
  "SoFi Stadium",          // Inglewood/LA — fixed canopy
]);

export function heatBand(feelsC: number): HeatBand {
  if (feelsC >= 39) return "Extreme";
  if (feelsC >= 32) return "High";
  if (feelsC >= 27) return "Moderate";
  return "Low";
}

// US AQI bands (EPA scale). Colors follow the color discipline: slate for
// informational, gold for caution, red for genuinely bad — never green/blue.
export function aqiBand(aqi: number): { label: string; color: string; concern: boolean } {
  if (aqi <= 50) return { label: "Good", color: "text-slate-400", concern: false };
  if (aqi <= 100) return { label: "Moderate", color: "text-slate-300", concern: false };
  if (aqi <= 150) return { label: "Unhealthy for Sensitive Groups", color: "text-brand-gold", concern: true };
  if (aqi <= 200) return { label: "Unhealthy", color: "text-red-400", concern: true };
  if (aqi <= 300) return { label: "Very Unhealthy", color: "text-red-400", concern: true };
  return { label: "Hazardous", color: "text-red-400", concern: true };
}

// EPA 24h PM2.5 standard is 35 µg/m³ — sustained readings above it usually
// mean smoke or haze (wildfires), not ordinary city pollution.
export const PM25_SMOKE_THRESHOLD = 35;

export function crampWatch(feelsC: number, humidity: number): {
  level: HeatBand;
  color: string;
  note: string;
} | null {
  const band = heatBand(feelsC);
  if (band === "Extreme") return { level: band, color: "text-red-400", note: "cooling breaks likely · severe cramp & dehydration risk late" };
  if (band === "High") return { level: band, color: "text-brand-gold", note: "elevated cramp risk in the final 30′ · watch hydration" };
  if (band === "Moderate") return { level: band, color: "text-slate-300", note: humidity >= 60 ? "humid — hydration matters as legs tire" : "hydration matters as legs tire" };
  return null; // Low — no banner needed
}
