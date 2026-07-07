// TLA → ISO 3166-1 alpha-2 (or subdivision) code for flagcdn.com
const ISO2: Record<string, string> = {
  // Americas
  ARG: "ar", BOL: "bo", BRA: "br", CAN: "ca", CHI: "cl",
  COL: "co", CRC: "cr", CUW: "cw", CUR: "cw", CPV: "cv", ECU: "ec",
  GUA: "gt", HAI: "ht", HON: "hn", JAM: "jm", MEX: "mx",
  NCA: "ni", PAN: "pa", PAR: "py", PER: "pe", SLV: "sv",
  TRI: "tt", URU: "uy", USA: "us", VEN: "ve",
  // Europe
  ALB: "al", AUT: "at", BEL: "be", BIH: "ba", BUL: "bg",
  CRO: "hr", CZE: "cz", DEN: "dk", ENG: "gb-eng", ESP: "es",
  FIN: "fi", FRA: "fr", GEO: "ge", GER: "de", GRE: "gr",
  HUN: "hu", IRL: "ie", ISL: "is", ITA: "it", KOS: "xk",
  MKD: "mk", MNE: "me", NED: "nl", NOR: "no", POL: "pl",
  POR: "pt", ROU: "ro", SCO: "gb-sct", SRB: "rs", SUI: "ch",
  SVK: "sk", SWE: "se", TUR: "tr", UKR: "ua", WAL: "gb-wls",
  // Africa
  // CGO → "cd": api-football uses CGO for DR CONGO (our WC26 team), not Rep. of Congo
  ALG: "dz", CIV: "ci", CMR: "cm", COD: "cd", CGO: "cd",
  EGY: "eg", ETH: "et", GAB: "ga", GAM: "gm", GHA: "gh",
  GUI: "gn", KEN: "ke", MAR: "ma", MLI: "ml", MOZ: "mz",
  MTN: "mr", NAM: "na", NGA: "ng", RSA: "za", RWA: "rw",
  SEN: "sn", SLE: "sl", TAN: "tz", TGO: "tg", TUN: "tn",
  UGA: "ug", ZAF: "za", ZAM: "zm", ZIM: "zw",
  // Asia / Middle East
  AUS: "au", BHR: "bh", CHN: "cn", IDN: "id", IND: "in",
  IRN: "ir", IRQ: "iq", JOR: "jo", JPN: "jp", KOR: "kr",
  KSA: "sa", SAU: "sa", KUW: "kw", MAS: "my", OMA: "om",
  PAK: "pk", PHI: "ph", QAT: "qa", SGP: "sg", SYR: "sy",
  THA: "th", UAE: "ae", UZB: "uz", VIE: "vn", YEM: "ye",
  // Oceania
  FIJ: "fj", NZL: "nz", PNG: "pg", SOL: "sb", VAN: "vu",
};

export function getFlagUrl(tla: string | undefined | null, width = 80): string | null {
  if (!tla) return null;
  const code = ISO2[tla.toUpperCase()];
  if (!code) return null;
  return `https://flagcdn.com/w${width}/${code}.png`;
}
