// Competition registry — the depot's catalog. sourceId is the TheSportsDB
// league id where known; empty string = unmapped (fill in from /admin, the
// id is editable per row). Slugs are stable — events key off them.
export interface RegistryEntry {
  slug: string;
  name: string;
  sport: string;
  region: string;
  season: string;
  source: "thesportsdb" | "jolpica";
  sourceId: string;
}

export const COMPETITION_REGISTRY: RegistryEntry[] = [
  { slug: "fifa-world-cup-2026",            name: "FIFA World Cup 2026",            sport: "soccer", region: "Americas", season: "2026",      source: "thesportsdb", sourceId: "4429" },
  { slug: "uefa-champions-league-2026-27",  name: "UEFA Champions League 2026-27",  sport: "soccer", region: "Europe",   season: "2026-2027", source: "thesportsdb", sourceId: "4480" },
  { slug: "uefa-europa-league-2025-26",     name: "UEFA Europa League 2025-26",     sport: "soccer", region: "Europe",   season: "2025-2026", source: "thesportsdb", sourceId: "4455" },
  { slug: "formula-1-2026",                 name: "Formula 1 2026 World Championship", sport: "f1",  region: "Global",   season: "2026",      source: "jolpica",     sourceId: "f1" },
  // Unmapped yet — set the TheSportsDB id from /admin, then Sync.
  { slug: "afc-asian-cup-2027",             name: "AFC Asian Cup 2027",             sport: "soccer", region: "Asia",     season: "2027",      source: "thesportsdb", sourceId: "" },
  { slug: "afc-champions-league-2026-27",   name: "AFC Champions League 2026-27",   sport: "soccer", region: "Asia",     season: "2026-2027", source: "thesportsdb", sourceId: "" },
  { slug: "africa-cup-of-nations-2025",     name: "Africa Cup of Nations 2025",     sport: "soccer", region: "Africa",   season: "2025",      source: "thesportsdb", sourceId: "" },
  { slug: "caf-champions-league-2026-27",   name: "CAF Champions League 2026-27",   sport: "soccer", region: "Africa",   season: "2026-2027", source: "thesportsdb", sourceId: "" },
  { slug: "concacaf-champions-cup-2026",    name: "CONCACAF Champions Cup 2026",    sport: "soccer", region: "Americas", season: "2026",      source: "thesportsdb", sourceId: "" },
  { slug: "concacaf-gold-cup-2025",         name: "CONCACAF Gold Cup 2025",         sport: "soccer", region: "Americas", season: "2025",      source: "thesportsdb", sourceId: "" },
  { slug: "conmebol-libertadores-2026",     name: "CONMEBOL Libertadores 2026",     sport: "soccer", region: "Americas", season: "2026",      source: "thesportsdb", sourceId: "" },
  { slug: "copa-america-2024",              name: "Copa América 2024",              sport: "soccer", region: "Americas", season: "2024",      source: "thesportsdb", sourceId: "" },
  { slug: "fifa-club-world-cup-2025",       name: "FIFA Club World Cup 2025",       sport: "soccer", region: "Global",   season: "2025",      source: "thesportsdb", sourceId: "" },
  { slug: "fifa-womens-world-cup-2027",     name: "FIFA Women's World Cup 2027",    sport: "soccer", region: "Americas", season: "2027",      source: "thesportsdb", sourceId: "" },
  { slug: "uefa-conference-league-2026-27", name: "UEFA Conference League 2026-27", sport: "soccer", region: "Europe",   season: "2026-2027", source: "thesportsdb", sourceId: "" },
  { slug: "uefa-euro-2028",                 name: "UEFA Euro 2028",                 sport: "soccer", region: "Europe",   season: "2028",      source: "thesportsdb", sourceId: "" },
  { slug: "uefa-womens-euro-2025",          name: "UEFA Women's Euro 2025",         sport: "soccer", region: "Europe",   season: "2025",      source: "thesportsdb", sourceId: "" },
];

// Popular TheSportsDB league ids, for quick admin reference:
// Premier League 4328 · La Liga 4335 · Bundesliga 4331 · Serie A 4332 ·
// Ligue 1 4334 · UCL 4480 · FIFA World Cup 4429 · NBA 4387 · NFL 4391
