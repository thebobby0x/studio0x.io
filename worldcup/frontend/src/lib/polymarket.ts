const GAMMA = "https://gamma-api.polymarket.com";
const CACHE_TTL_MS = 30_000;
const TOURNAMENT_CACHE_TTL_MS = 300_000; // 5 minutes — tournament odds move slowly

// Maps Polymarket team names to football-data.org TLAs
const NAME_TO_TLA: Record<string, string> = {
  "Spain": "ESP", "France": "FRA", "Portugal": "POR", "England": "ENG",
  "Brazil": "BRA", "Argentina": "ARG", "Germany": "GER", "Netherlands": "NED",
  "Uruguay": "URU", "Mexico": "MEX", "United States": "USA", "USA": "USA",
  "Canada": "CAN", "Morocco": "MAR", "Japan": "JPN", "South Korea": "KOR",
  "Korea Republic": "KOR", "Senegal": "SEN", "Ecuador": "ECU",
  "Croatia": "CRO", "Belgium": "BEL", "Colombia": "COL", "Turkey": "TUR",
  "Switzerland": "SUI", "Denmark": "DEN", "Austria": "AUT", "Italy": "ITA",
  "Sweden": "SWE", "Poland": "POL", "Australia": "AUS", "Ghana": "GHA",
  "Ivory Coast": "CIV", "Côte d'Ivoire": "CIV", "Nigeria": "NGA",
  "Cameroon": "CMR", "Saudi Arabia": "KSA", "Iran": "IRN", "Algeria": "DZA",
  "Egypt": "EGY", "Tunisia": "TUN", "South Africa": "RSA", "Qatar": "QAT",
  "Paraguay": "PAR", "Chile": "CHI", "Peru": "PER", "Venezuela": "VEN",
  "Bolivia": "BOL", "Honduras": "HON", "Costa Rica": "CRC", "Panama": "PAN",
  "Jamaica": "JAM", "Haiti": "HAI", "El Salvador": "SLV", "Guatemala": "GUA",
  "New Zealand": "NZL", "Scotland": "SCO", "Wales": "WAL",
  "Czech Republic": "CZE", "Czechia": "CZE", "Slovakia": "SVK",
  "Serbia": "SRB", "Greece": "GRE", "Romania": "ROU", "Ukraine": "UKR",
  "Norway": "NOR", "Cape Verde": "CPV", "Curaçao": "CUW",
  "Bosnia and Herzegovina": "BIH", "Bosnia-Herzegovina": "BIH",
  "Jordan": "JOR", "Iraq": "IRQ", "Uzbekistan": "UZB", "Indonesia": "IDN",
  "Albania": "ALB", "Slovenia": "SVN", "Hungary": "HUN", "Finland": "FIN",
  "Israel": "ISR", "Iceland": "ISL", "Cuba": "CUB",
};

export function teamNameToTla(name: string): string | undefined {
  if (NAME_TO_TLA[name]) return NAME_TO_TLA[name];
  const upper = name.toUpperCase();
  for (const [k, v] of Object.entries(NAME_TO_TLA)) {
    if (upper === k.toUpperCase()) return v;
  }
  return undefined;
}

// ── Shared raw market type ────────────────────────────────────────────────────

interface RawPolyMarket {
  active?: boolean;
  groupItemTitle?: string;
  question?: string;
  outcomePrices?: string;
  volumeNum?: number;
  liquidityNum?: number;
  bestBid?: number;
  bestAsk?: number;
}

function parseOutcomePrice(m: RawPolyMarket): number {
  try {
    const prices = JSON.parse(m.outcomePrices ?? '["0","1"]') as string[];
    return parseFloat(prices[0]) || 0;
  } catch {
    return 0;
  }
}

async function fetchGamma(slug: string): Promise<unknown[] | null> {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${GAMMA}/events?slug=${slug}`, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { events?: unknown[] } | unknown[];
    return (json as { events?: unknown[] }).events ?? (Array.isArray(json) ? json : []);
  } catch {
    return null;
  }
}

// ── Group winner markets ──────────────────────────────────────────────────────

export interface GroupWinnerMarket {
  team: string;
  tla?: string;
  probability: number;
  volume: number;
  bestBid: number;
  bestAsk: number;
}

export interface GroupWinnerData {
  group: string;
  markets: GroupWinnerMarket[];
  totalLiquidity: number;
  source: "live" | "cache";
}

const _groupCache = new Map<string, { ts: number; data: GroupWinnerData }>();

export async function getGroupWinnerMarkets(group: string): Promise<GroupWinnerData | null> {
  const key = group.toUpperCase();
  const cached = _groupCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { ...cached.data, source: "cache" };
  }

  const events = await fetchGamma(`world-cup-group-${group.toLowerCase()}-winner`);
  if (!events) return null;

  const event = events[0] as { markets?: RawPolyMarket[]; liquidity?: number } | undefined;
  if (!event) return null;

  const markets: GroupWinnerMarket[] = (event.markets ?? [])
    .filter(m => m.active !== false)
    .map(m => {
      const name = m.groupItemTitle ?? m.question ?? "";
      return {
        team: name,
        tla: teamNameToTla(name),
        probability: parseOutcomePrice(m),
        volume: m.volumeNum ?? 0,
        bestBid: m.bestBid ?? 0,
        bestAsk: m.bestAsk ?? 0,
      };
    })
    .sort((a, b) => b.probability - a.probability);

  const result: GroupWinnerData = {
    group: key,
    markets,
    totalLiquidity: event.liquidity ?? 0,
    source: "live",
  };

  _groupCache.set(key, { ts: Date.now(), data: result });
  return result;
}

// ── Tournament winner markets ─────────────────────────────────────────────────

export interface TournamentWinnerMarket {
  team: string;
  tla?: string;
  probability: number;
  volume: number;
}

export interface TournamentWinnerData {
  markets: TournamentWinnerMarket[];
  totalLiquidity: number;
  source: "live" | "cache";
}

let _tournamentCache: { ts: number; data: TournamentWinnerData } | null = null;
const _tlaCache = new Map<string, number>(); // tla → probability, derived from _tournamentCache

export async function getTournamentWinnerMarkets(): Promise<TournamentWinnerData | null> {
  if (_tournamentCache && Date.now() - _tournamentCache.ts < TOURNAMENT_CACHE_TTL_MS) {
    return { ..._tournamentCache.data, source: "cache" };
  }

  const events = await fetchGamma("world-cup-winner");
  if (!events) return null;

  const event = events[0] as { markets?: RawPolyMarket[]; liquidity?: number } | undefined;
  if (!event) return null;

  const markets: TournamentWinnerMarket[] = (event.markets ?? [])
    .filter(m => m.active !== false)
    .map(m => {
      const name = m.groupItemTitle ?? m.question ?? "";
      return {
        team: name,
        tla: teamNameToTla(name),
        probability: parseOutcomePrice(m),
        volume: m.volumeNum ?? 0,
      };
    })
    .sort((a, b) => b.probability - a.probability);

  // Rebuild TLA lookup cache
  _tlaCache.clear();
  for (const m of markets) {
    if (m.tla) _tlaCache.set(m.tla, m.probability);
  }

  const result: TournamentWinnerData = {
    markets,
    totalLiquidity: event.liquidity ?? 0,
    source: "live",
  };

  _tournamentCache = { ts: Date.now(), data: result };
  return result;
}

/** Get a single team's tournament win probability by TLA. Returns null if not found. */
export async function getTeamTournamentProb(tla: string): Promise<number | null> {
  // Use cache if warm
  if (_tlaCache.has(tla)) return _tlaCache.get(tla)!;
  // Fetch to warm cache
  await getTournamentWinnerMarkets();
  return _tlaCache.get(tla.toUpperCase()) ?? _tlaCache.get(tla) ?? null;
}
