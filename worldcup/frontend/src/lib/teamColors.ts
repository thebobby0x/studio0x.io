// National-team primary colors for data-viz (owner-sanctioned exception to the
// color discipline, 7/17 — same class as the flight map's blue). Used by the
// Match DNA™ diverging goal graph. Unknown codes fall back to the standard
// duel colors (home green / away gold).
export const TEAM_COLORS: Record<string, string> = {
  ARG: "#75AADB", // sky blue
  ESP: "#C60B1E", // red
  FRA: "#0055A4",
  ENG: "#CE1124",
  BRA: "#009C3B",
  GER: "#DD0000",
  POR: "#046A38",
  NED: "#FF6600",
  MEX: "#006847",
  USA: "#0A3161",
  BEL: "#ED2939",
  CRO: "#FF0000",
  MAR: "#C1272D",
  SUI: "#DA291C",
  COL: "#FCD116",
  NOR: "#BA0C2F",
  SWE: "#006AA7",
  JPN: "#BC002D",
};

export function teamColor(code: string | undefined, fallback: string): string {
  return (code && TEAM_COLORS[code]) || fallback;
}
