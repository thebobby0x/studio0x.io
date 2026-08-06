const F: Record<string, string> = {
  // Americas
  ARG:"🇦🇷", BOL:"🇧🇴", BRA:"🇧🇷", CAN:"🇨🇦", CHI:"🇨🇱",
  COL:"🇨🇴", CRC:"🇨🇷", CUW:"🇨🇼", CUR:"🇨🇼", CPV:"🇨🇻", ECU:"🇪🇨",
  GUA:"🇬🇹", HAI:"🇭🇹", HON:"🇭🇳", JAM:"🇯🇲", MEX:"🇲🇽",
  NCA:"🇳🇮", PAN:"🇵🇦", PAR:"🇵🇾", PER:"🇵🇪", SLV:"🇸🇻",
  TRI:"🇹🇹", URU:"🇺🇾", USA:"🇺🇸", VEN:"🇻🇪",
  // Europe
  ALB:"🇦🇱", AUT:"🇦🇹", BEL:"🇧🇪", BIH:"🇧🇦", BUL:"🇧🇬",
  CRO:"🇭🇷", CZE:"🇨🇿", DEN:"🇩🇰", ENG:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", ESP:"🇪🇸",
  FIN:"🇫🇮", FRA:"🇫🇷", GEO:"🇬🇪", GER:"🇩🇪", GRE:"🇬🇷",
  HUN:"🇭🇺", IRL:"🇮🇪", ISL:"🇮🇸", ITA:"🇮🇹", KOS:"🇽🇰",
  MKD:"🇲🇰", MNE:"🇲🇪", NED:"🇳🇱", NOR:"🇳🇴", POL:"🇵🇱",
  POR:"🇵🇹", ROU:"🇷🇴", SCO:"🏴󠁧󠁢󠁳󠁣󠁴󠁿", SRB:"🇷🇸", SUI:"🇨🇭",
  SVK:"🇸🇰", SWE:"🇸🇪", TUR:"🇹🇷", UKR:"🇺🇦", WAL:"🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  // Africa
  ALG:"🇩🇿", CIV:"🇨🇮", CMR:"🇨🇲", COD:"🇨🇩", CGO:"🇨🇩", EGY:"🇪🇬", ETH:"🇪🇹",
  GAB:"🇬🇦", GAM:"🇬🇲", GHA:"🇬🇭", GUI:"🇬🇳", KEN:"🇰🇪",
  MAR:"🇲🇦", MLI:"🇲🇱", MOZ:"🇲🇿", MTN:"🇲🇷", NAM:"🇳🇦",
  NGA:"🇳🇬", RSA:"🇿🇦", RWA:"🇷🇼", SEN:"🇸🇳", SLE:"🇸🇱",
  TAN:"🇹🇿", TGO:"🇹🇬", TUN:"🇹🇳", UGA:"🇺🇬", ZAF:"🇿🇦",
  ZAM:"🇿🇲", ZIM:"🇿🇼",
  // Asia / Middle East
  AUS:"🇦🇺", BHR:"🇧🇭", CHN:"🇨🇳", IDN:"🇮🇩", IND:"🇮🇳",
  IRN:"🇮🇷", IRQ:"🇮🇶", JOR:"🇯🇴", JPN:"🇯🇵", KOR:"🇰🇷",
  KUW:"🇰🇼", KSA:"🇸🇦", MAS:"🇲🇾", OMA:"🇴🇲", PAK:"🇵🇰", PHI:"🇵🇭",
  QAT:"🇶🇦", SAU:"🇸🇦", SGP:"🇸🇬", SYR:"🇸🇾", THA:"🇹🇭",
  UAE:"🇦🇪", UZB:"🇺🇿", VIE:"🇻🇳", YEM:"🇾🇪",
  // Oceania
  FIJ:"🇫🇯", NZL:"🇳🇿", PNG:"🇵🇬", SOL:"🇸🇧", VAN:"🇻🇺",
};

// A 3-letter code maps to a NATION only where codes are FIFA nation TLAs. On a
// club competition the codes belong to clubs and collide head-on with that map:
// Columbus Crew's api-football code is "COL" (Colombia), Portland Timbers "POR"
// (Portugal), Chicago Fire "CHI" (Chile), Guadalajara "GUA" (Guatemala), Real
// Salt Lake "SAL" (El Salvador). Every one of those rendered the wrong country's
// flag next to a club's name on the live Leagues Cup site.
//
// So this lookup is gated on the deployment. Club deployments get the neutral
// flag — a club's badge is its crest (see FlagImg), and a wrong flag is worse
// than no flag. Use countryFlag() in lib/teamIdentity when you have a real
// country, and teamBadge() when you have a persisted team row.
import { SPORT } from "@/lib/sportConfig";

export function getFlag(tla: string | undefined | null): string {
  if (!tla) return "";
  // Club deployments: a 3-letter code is a CLUB, not a nation, so no flag is
  // correct here. This used to return the white-flag emoji, which rendered a
  // literal 🏳️ next to every club on every emoji-only surface. Empty string is
  // the honest answer — callers that need a visual use <FlagImg>, which falls
  // back to a monogram. Never a country's flag, and never a white one either.
  if (!SPORT.feedCodesAreNationTlas) return "";
  return F[tla.toUpperCase()] ?? "";
}

/** Nation-flag lookup that ignores the deployment gate. For the rare surface
 *  that genuinely holds a FIFA nation TLA on a club deployment (e.g. a host
 *  country badge), never for a team code. */
export function nationFlag(tla: string | undefined | null): string {
  if (!tla) return "🏳️";
  return F[tla.toUpperCase()] ?? "🏳️";
}
