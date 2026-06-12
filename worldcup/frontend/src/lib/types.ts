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
    corners?: number
    fouls?: number
    yellow_cards?: number
    red_cards?: number
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
  teamId: string
  team: Team
  title: string
  artistCredit: string
  audioUrl: string
  coverArt: string | null
  durationSecs: number
  playCount: number
  listenSeconds: number
  tiktokDeepLink: string | null
}

export interface DataSources {
  match:   "live" | "cache" | "sim"
  markets: "live" | "cache" | "sim"
  stats:   "sim"
}

export interface LiveData {
  match: Match
  metrics: LiveMetrics
  markets: KalshiMarket[]
  dataSources?: DataSources
  kalshiTickers?: { home_win: string; draw: string; away_win: string } | null
}
