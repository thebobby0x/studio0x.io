import { prisma } from "@/lib/prisma";

const LEAGUE_FLAG: Record<string, string> = {
  "Premier League": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "La Liga": "🇪🇸",
  "Bundesliga": "🇩🇪",
  "Serie A": "🇮🇹",
  "Ligue 1": "🇫🇷",
  "MLS": "🇺🇸",
  "Saudi Pro League": "🇸🇦",
  "Primeira Liga": "🇵🇹",
  "Eredivisie": "🇳🇱",
  "Liga MX": "🇲🇽",
  "Brasileirao": "🇧🇷",
  "J.League": "🇯🇵",
  "Süper Lig": "🇹🇷",
  "Bundesliga 2": "🇩🇪",
  "Danish Superliga": "🇩🇰",
};

type ClubEntry = {
  club: string;
  league: string;
  playerNames: string[];
  // WC tournament stats (live mode)
  wcGoals: number;
  wcAssists: number;
  wcMinutes: number;
  wcMatches: number;
  wcRatingSum: number;
  wcRatingCount: number;
  hatTricks: number;
  shotsTotal: number;
  tacklesTotal: number;
  interceptions: number;
  // career / squad stats (preview mode fallback)
  careerGoals: number;
  score: number;
};

type LeagueEntry = {
  league: string;
  clubs: number;
  players: number;
  goals: number;
  assists: number;
  hatTricks: number;
  careerGoals: number;
};

function wcTalkingPoint(c: ClubEntry, rank: number, grandTotal: number): string {
  const pct = grandTotal > 0 ? Math.round((c.wcGoals / grandTotal) * 100) : 0;
  const top2 = c.playerNames.slice(0, 2).join(" & ");
  if (c.hatTricks >= 2)
    return `${c.club} players have delivered ${c.hatTricks} hat-tricks — the most explosive club presence at the 2026 tournament.`;
  if (c.hatTricks === 1)
    return `${c.club} already has a tournament hat-trick — ${top2} carrying the banner for ${c.league}.`;
  if (rank === 0 && c.wcGoals > 0)
    return `${c.club} leads all clubs with ${c.wcGoals} WC goals${pct > 0 ? ` (${pct}% of all goals scored)` : ""} — ${top2} are the tournament's dominant club force.`;
  if (c.wcGoals === 0 && c.wcMinutes > 0)
    return `${c.club}'s ${c.playerNames.length} players have clocked ${c.wcMinutes} tournament minutes — contributing without getting on the scoresheet.`;
  return `${c.club}: ${c.playerNames.length} players · ${c.wcGoals}G ${c.wcAssists}A across ${c.wcMatches} appearances.`;
}

function previewTalkingPoint(c: ClubEntry, rank: number): string {
  const top2 = c.playerNames.slice(0, 2).join(" & ");
  if (rank === 0)
    return `${c.club} sends the most players to this tournament — ${top2} among a star-studded WC squad with ${c.careerGoals} combined international goals.`;
  if (c.careerGoals > 30)
    return `${c.playerNames.length} ${c.club} players bring a combined ${c.careerGoals} international goals to the 2026 tournament — elite firepower on the stage.`;
  return `${c.club} is represented by ${c.playerNames.length} player${c.playerNames.length !== 1 ? "s" : ""} — ${top2} carrying the club flag.`;
}

function leagueTalkingPoint(l: LeagueEntry, rank: number, grandTotal: number, isLive: boolean): string {
  const pct = grandTotal > 0 ? Math.round((l.goals / grandTotal) * 100) : 0;
  if (isLive) {
    if (rank === 0 && l.goals > 0)
      return `${l.league} clubs account for ${pct}% of all tournament goals — the clearest argument for its global supremacy.`;
    if (l.hatTricks > 0)
      return `${l.league} players have recorded ${l.hatTricks} hat-trick${l.hatTricks > 1 ? "s" : ""} — elite finishing runs in this league.`;
    return `${l.clubs} ${l.league} clubs: ${l.goals}G ${l.assists}A combined at the 2026 tournament.`;
  } else {
    if (rank === 0)
      return `${l.league} sends the most players to this tournament — ${l.players} players from ${l.clubs} clubs bringing ${l.careerGoals} combined international goals.`;
    if (l.careerGoals > 50)
      return `${l.players} ${l.league} players carry ${l.careerGoals} international goals into this tournament — a league built on global talent.`;
    return `${l.clubs} ${l.league} clubs represented across ${l.players} tournament players.`;
  }
}

export default async function ClubWCImpact({ limit = 12 }: { limit?: number }) {
  // Fetch all players with clubs — include tournament stats + hat-trick matches when available
  const allPlayers = await prisma.player.findMany({
    where: { club: { not: "" } },
    include: {
      tournamentStat: true,
      matchStats: {
        where: { goals: { gte: 3 } },
        select: { goals: true },
      },
    },
  }).catch(() => []);

  if (allPlayers.length === 0) {
    return (
      <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
        <div className="px-4 py-3 border-b border-brand-border flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Club WC Impact™</span>
          <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
        </div>
        <div className="px-4 py-8 text-center">
          <p className="text-slate-500 text-sm font-semibold">No club data yet</p>
          <p className="text-slate-700 text-xs mt-1">
            Admin: run <span className="text-brand-gold font-mono text-[10px]">Seed Clubs (Mock)</span> to populate
          </p>
        </div>
      </div>
    );
  }

  // Determine if we have live WC tournament stats
  const playersWithWCStats = allPlayers.filter(p => p.tournamentStat && p.tournamentStat.matches > 0);
  const isLive = playersWithWCStats.length > 0;

  // Aggregate by club using whichever data source is available
  const clubMap = new Map<string, ClubEntry>();
  for (const p of allPlayers) {
    if (!p.club) continue;
    if (!clubMap.has(p.club)) {
      clubMap.set(p.club, {
        club: p.club, league: p.league,
        playerNames: [],
        wcGoals: 0, wcAssists: 0, wcMinutes: 0, wcMatches: 0,
        wcRatingSum: 0, wcRatingCount: 0,
        hatTricks: 0, shotsTotal: 0, tacklesTotal: 0, interceptions: 0,
        careerGoals: 0, score: 0,
      });
    }
    const c = clubMap.get(p.club)!;
    c.playerNames.push(p.name);
    c.careerGoals += p.goals;
    if (p.tournamentStat) {
      const s = p.tournamentStat;
      c.wcGoals += s.goals;
      c.wcAssists += s.assists;
      c.wcMinutes += s.minutesPlayed;
      c.wcMatches += s.matches;
      if (s.rating > 0) { c.wcRatingSum += s.rating; c.wcRatingCount++; }
      c.shotsTotal += s.shotsTotal;
      c.tacklesTotal += s.tacklesTotal;
      c.interceptions += s.interceptions;
    }
    c.hatTricks += p.matchStats.length;
  }

  const grandTotalGoals = [...clubMap.values()].reduce((n, c) => n + c.wcGoals, 0);

  const clubs = [...clubMap.values()]
    .map(c => ({
      ...c,
      score: isLive
        ? c.wcGoals * 4 + c.wcAssists * 2.5 + c.hatTricks * 8 +
          (c.tacklesTotal + c.interceptions) * 0.3 + c.shotsTotal * 0.2 +
          (c.wcMinutes / 90) * 0.5
        : c.playerNames.length * 2 + c.careerGoals * 0.5,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Aggregate by league
  const leagueMap = new Map<string, LeagueEntry>();
  for (const [, c] of clubMap) {
    if (!leagueMap.has(c.league)) {
      leagueMap.set(c.league, { league: c.league, clubs: 0, players: 0, goals: 0, assists: 0, hatTricks: 0, careerGoals: 0 });
    }
    const l = leagueMap.get(c.league)!;
    l.clubs++;
    l.players += c.playerNames.length;
    l.goals += c.wcGoals;
    l.assists += c.wcAssists;
    l.hatTricks += c.hatTricks;
    l.careerGoals += c.careerGoals;
  }

  const leagues = [...leagueMap.values()]
    .sort((a, b) => isLive ? b.goals - a.goals : b.players - a.players)
    .slice(0, 8);

  const maxScore = Math.max(...clubs.map(c => c.score), 1);
  const maxLeaguePlayers = Math.max(...leagues.map(l => l.players), 1);

  return (
    <div className="space-y-6">
      {/* Pre-tournament notice banner */}
      {!isLive && (
        <div className="rounded-xl border border-brand-gold/20 bg-brand-gold/5 px-4 py-2.5 flex items-center gap-2">
          <span className="text-brand-gold text-[10px]">◆</span>
          <p className="text-[10px] text-slate-400">
            <span className="text-brand-gold font-black">Squad Preview</span> — showing WC squad strength &amp; career goals.
            Live WC stats appear automatically after matches are ingested.
          </p>
        </div>
      )}

      {/* League breakdown */}
      <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
        <div className="px-4 py-3 border-b border-brand-border flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">
            {isLive ? "League WC Impact™" : "League Squad Strength™"}
          </span>
          <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
          <span className="ml-auto text-[9px] text-slate-600 uppercase tracking-wider">
            {isLive ? "WC goals by league" : "WC players by league"}
          </span>
        </div>
        <div className="divide-y divide-brand-border/30">
          {leagues.map((l, i) => {
            const pct = isLive
              ? (grandTotalGoals > 0 ? (l.goals / grandTotalGoals) * 100 : 0)
              : (l.players / maxLeaguePlayers) * 100;
            const flag = LEAGUE_FLAG[l.league] ?? "⚽";
            return (
              <div key={l.league} className="px-4 py-3 hover:bg-white/3 transition-colors">
                <div className="flex items-start gap-3">
                  <span className="text-[10px] font-mono text-slate-600 w-4 shrink-0 tabular-nums pt-0.5">{i + 1}</span>
                  <span className="text-base shrink-0">{flag}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-black text-white">{l.league}</span>
                      <div className="flex items-center gap-3 shrink-0 text-[10px] font-mono">
                        {isLive ? (
                          <>
                            <span className="text-brand-gold font-black">{l.goals}G</span>
                            <span className="text-slate-300">{l.assists}A</span>
                            {l.hatTricks > 0 && <span className="text-brand-gold font-black">{l.hatTricks}🎩</span>}
                          </>
                        ) : (
                          <>
                            <span className="text-white font-black">{l.players} players</span>
                            <span className="text-slate-500">{l.careerGoals} int'l G</span>
                          </>
                        )}
                        <span className="text-slate-600">{l.clubs} clubs</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-brand-border overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-gold to-amber-600"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-600 mt-1 italic">
                      {leagueTalkingPoint(l, i, grandTotalGoals, isLive)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Club leaderboard */}
      <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
        <div className="px-4 py-3 border-b border-brand-border flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Club WC Impact™</span>
          <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
          <span className="ml-auto text-[9px] text-slate-600 uppercase tracking-wider">
            {isLive ? "ranked by WC contribution score" : "ranked by squad strength"}
          </span>
        </div>
        <div className="divide-y divide-brand-border/30">
          {clubs.map((c, i) => {
            const flag = LEAGUE_FLAG[c.league] ?? "⚽";
            const avgRating = c.wcRatingCount > 0 ? (c.wcRatingSum / c.wcRatingCount).toFixed(1) : null;
            const barPct = (c.score / maxScore) * 100;
            return (
              <div key={c.club} className="px-4 py-3 hover:bg-white/3 transition-colors">
                <div className="flex items-start gap-3">
                  <span className="text-[10px] font-mono text-slate-600 w-4 shrink-0 tabular-nums pt-0.5">{i + 1}</span>
                  <span className="text-base shrink-0" title={c.league}>{flag}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        <span className="text-xs font-black text-white truncate block">{c.club}</span>
                        <span className="text-[9px] text-slate-600">{c.league} · {c.playerNames.length} player{c.playerNames.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono">
                        {isLive ? (
                          <>
                            {c.wcGoals > 0 && <span className="text-brand-gold font-black">{c.wcGoals}G</span>}
                            {c.wcAssists > 0 && <span className="text-slate-300">{c.wcAssists}A</span>}
                            {c.hatTricks > 0 && <span className="text-brand-gold font-black">{c.hatTricks}🎩</span>}
                            {avgRating && <span className="text-amber-400">★{avgRating}</span>}
                          </>
                        ) : (
                          <>
                            <span className="text-slate-400">{c.careerGoals} int'l G</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="h-1 rounded-full bg-brand-border overflow-hidden mb-1.5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-brand-green"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>

                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {c.playerNames.slice(0, 6).map(n => (
                        <span key={n} className="text-[9px] bg-brand-border/60 text-slate-400 rounded px-1.5 py-0.5">{n}</span>
                      ))}
                      {c.playerNames.length > 6 && (
                        <span className="text-[9px] text-slate-600">+{c.playerNames.length - 6} more</span>
                      )}
                    </div>

                    <p className="text-[10px] text-slate-500 italic leading-relaxed">
                      {isLive
                        ? wcTalkingPoint(c, i, grandTotalGoals)
                        : previewTalkingPoint(c, i)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t border-brand-border/50 px-4 py-2 text-[9px] text-slate-700 text-center">
          {isLive
            ? "WC Impact Score = Goals×4 + Assists×2.5 + Hat-tricks×8 + Defensive actions×0.3 · 🎩 = hat-trick"
            : "Squad Strength = Players×2 + Career Int'l Goals×0.5 · Updates live once match stats ingested"}
        </div>
      </div>
    </div>
  );
}
