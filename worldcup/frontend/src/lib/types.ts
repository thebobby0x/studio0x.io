export interface Team {
  id: string
  name: string
  code: string
  flagEmoji: string
  groupStage: string
}

export interface Match {
  id: string
  fixture: number
  homeTeam: Team
  awayTeam: Team
  venue: string
  city: string
  date: string
  status: string
  homeScore: number
  awayScore: number
  elapsed: number
}

export interface LiveMetrics {
  [teamCode: string]: {
    possession?: number
    shots_on?: number
    shots_off?: number
    total_shots?: number
    blocked_shots?: number
    corners?: number
    fouls?: number
    offsides?: number
    yellow_cards?: number
    red_cards?: number
    saves?: number
    passes?: number
    pass_accuracy?: number
    xg?: number
  }
}

export interface KalshiMarket {
  id: string
  outcome: string
  contractSlug: string
  price: number
  volume: number
  lastTick: string
}

export interface AudioStream {
  id: string
  teamId: string | null
  team: Team | null
  title: string
  artistCredit: string
  audioUrl: string
  coverArt: string | null
  durationSecs: number
  playCount: number
  listenSeconds: number
  shareClicks: number
  tiktokDeepLink: string | null
}

export interface DataSources {
  match:   "live" | "cache" | "sim" | "api-football"
  markets: "live" | "cache" | "sim"
  stats:   "api-football" | "sim"
}

export interface KalshiOutcomeDetail {
  bid: number | null
  ask: number | null
  last: number | null
  volume: number
}

export interface KalshiLiveSnapshot {
  home_win: number
  draw: number
  away_win: number
  volume: number
  tickers: { home_win: string; draw: string; away_win: string }
  detail: { home_win: KalshiOutcomeDetail; draw: KalshiOutcomeDetail; away_win: KalshiOutcomeDetail }
  source: "live" | "cache"
}

export interface LiveData {
  match: Match
  metrics: LiveMetrics
  markets: KalshiMarket[]
  dataSources?: DataSources
  kalshiTickers?: { home_win: string; draw: string; away_win: string } | null
  kalshiLive?: KalshiLiveSnapshot | null
  liveProbs?: { home: number; draw: number; away: number } | null
  tournamentOdds?: { home: number | null; away: number | null } | null
}

// OpenSky Network flight data (full field set)
export interface Flight {
  icao24: string;
  callsign: string | null;
  origin_country: string;
  time_position: number | null;
  last_contact: number;
  longitude: number | null;
  latitude: number | null;
  baro_altitude: number | null;
  on_ground: boolean;
  velocity: number | null;
  true_track: number | null;
  vertical_rate: number | null;
  sensors: number[] | null;
  geo_altitude: number | null;
  squawk: string | null;
  spi: boolean;
  position_source: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}
