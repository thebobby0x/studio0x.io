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

type ClubStats = {
  club: string;
  league: string;
  playerNames: string[];
  goals: number;
  assists: number;
  minutesPlayed: number;
  matches: number;
  ratingSum: number;
  ratingCount: number;
  hatTricks: number;
  shotsTotal: number;
  tacklesTotal: number;
  interceptions: number;
  score: number;
};

type LeagueStats = {
  league: string;
  clubs: number;
  players: number;
  goals: number;
  assists: number;
  minutesPlayed: number;
  hatTricks: number;
};

function talkingPoint(club: ClubStats, rank: number, grandTotalGoals: number): string {
  const pct = grandTotalGoals > 0 ? Math.round((club.goals / grandTotalGoals) * 100) : 0;
  const top2 = club.playerNames.slice(0, 2).join(" & ");

  if (club.hatTricks >= 2)
    return `${club.club} players have recorded ${club.hatTricks} hat-tricks — the most devastating club presence at this World Cup.`;
  if (club.hatTricks === 1)
    return `${club.club} has a World Cup hat-trick in the books — ${top2} leading the charge for ${club.league}.`;
  if (rank === 1 && club.goals > 0)
    return `${club.club} leads all clubs with ${club.goals} WC goals${pct > 0 ? ` (${pct}% of all goals)` : ""} — ${top2} are the tournament's dominant club force.`;
  if (club.goals === 0 && club.minutesPlayed > 0)
    return `${club.club}'s ${club.playerNames.length} players have clocked ${club.minutesPlayed} World Cup minutes — contributing defensively and in transition.`;
  return `${club.club}'s ${club.playerNames.length} World Cup players: ${club.goals}G ${club.assists}A across ${club.matches} appearances.`;
}

function leagueTalkingPoint(league: LeagueStats, rank: number, grandTotalGoals: number): string {
  const pct = grandTotalGoals > 0 ? Math.round((league.goals / grandTotalGoals) * 100) : 0;
  if (rank === 1 && league.goals > 0)
    return `${league.league} clubs account for ${pct}% of all World Cup goals — the strongest argument for its global dominance.`;
  if (league.hatTricks > 0)
    return `${league.league} players have ${league.hatTricks} hat-trick${league.hatTricks > 1 ? "s" : ""} at this tournament — proving the league produces elite finishers.`;
  return `${league.clubs} ${league.league} clubs combined for ${league.goals} WC goals and ${league.assists} assists.`;
}

export default async function ClubWCImpact({ limit = 12 }: { limit?: number }) {
  const players = await prisma.player.findMany({
    where: { club: { not: "" }, tournamentStat: { isNot: null } },
    include: {
      tournamentStat: true,
      matchStats: {
        where: { goals: { gte: 3 } },
        select: { goals: true },
      },
    },
  }).catch(() => []);

  const withStats = players.filter(
    (p) => p.tournamentStat && p.tournamentStat.matches > 0
  );

  if (withStats.length === 0) {
    return (
      <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
        <div className="px-4 py-3 border-b border-brand-border flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Club WC Impact™</span>
          <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
        </div>
        <div className="px-4 py-8 text-center">
          <p className="text-slate-500 text-sm font-semibold">No tournament data yet</p>
          <p className="text-slate-700 text-xs mt-1">
            Admin: run <span className="text-brand-gold font-mono text-[10px]">Ingest Player Stats</span> after matches complete
          </p>
        </div>
      </div>
    );
  }

  // Aggregate by club
  const clubMap = new Map<string, ClubStats>();
  for (const p of withStats) {
    const s = p.tournamentStat!;
    if (!clubMap.has(p.club)) {
      clubMap.set(p.club, {
        club: p.club, league: p.league,
        playerNames: [], goals: 0, assists: 0, minutesPlayed: 0,
        matches: 0, ratingSum: 0, ratingCount: 0,
        hatTricks: 0, shotsTotal: 0, tacklesTotal: 0, interceptions: 0, score: 0,
      });
    }
    const c = clubMap.get(p.club)!;
    c.playerNames.push(p.name);
    c.goals += s.goals;
    c.assists += s.assists;
    c.minutesPlayed += s.minutesPlayed;
    c.matches += s.matches;
    if (s.rating > 0) { c.ratingSum += s.rating; c.ratingCount++; }
    c.hatTricks += p.matchStats.length;
    c.shotsTotal += s.shotsTotal;
    c.tacklesTotal += s.tacklesTotal;
    c.interceptions += s.interceptions;
  }

  const grandTotalGoals = [...clubMap.values()].reduce((n, c) => n + c.goals, 0);

  const clubs = [...clubMap.values()]
    .map(c => ({
      ...c,
      score: c.goals * 4 + c.assists * 2.5 + c.hatTricks * 8 +
        (c.tacklesTotal + c.interceptions) * 0.3 + c.shotsTotal * 0.2 +
        (c.minutesPlayed / 90) * 0.5,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Aggregate by league (across ALL clubs, not just top N)
  const leagueMap = new Map<string, LeagueStats>();
  for (const [, c] of clubMap) {
    if (!leagueMap.has(c.league)) {
      leagueMap.set(c.league, { league: c.league, clubs: 0, players: 0, goals: 0, assists: 0, minutesPlayed: 0, hatTricks: 0 });
    }
    const l = leagueMap.get(c.league)!;
    l.clubs++;
    l.players += c.playerNames.length;
    l.goals += c.goals;
    l.assists += c.assists;
    l.minutesPlayed += c.minutesPlayed;
    l.hatTricks += c.hatTricks;
  }
  const leagues = [...leagueMap.values()].sort((a, b) => b.goals - a.goals).slice(0, 8);

  const maxScore = Math.max(...clubs.map(c => c.score), 1);

  return (
    <div className="space-y-6">
      {/* League Summary */}
      <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
        <div className="px-4 py-3 border-b border-brand-border flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">League WC Impact™</span>
          <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
          <span className="ml-auto text-[9px] text-slate-600 uppercase tracking-wider">goals from each league at WC</span>
        </div>
        <div className="divide-y divide-brand-border/30">
          {leagues.map((l, i) => {
            const pct = grandTotalGoals > 0 ? (l.goals / grandTotalGoals) * 100 : 0;
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
                        <span className="text-brand-gold font-black">{l.goals}G</span>
                        <span className="text-blue-400">{l.assists}A</span>
                        {l.hatTricks > 0 && (
                          <span className="text-purple-400 font-black">{l.hatTricks}🎩</span>
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
                      {leagueTalkingPoint(l, i, grandTotalGoals)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Club Leaderboard */}
      <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
        <div className="px-4 py-3 border-b border-brand-border flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Club WC Impact™</span>
          <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
          <span className="ml-auto text-[9px] text-slate-600 uppercase tracking-wider">ranked by WC contribution score</span>
        </div>
        <div className="divide-y divide-brand-border/30">
          {clubs.map((c, i) => {
            const flag = LEAGUE_FLAG[c.league] ?? "⚽";
            const avgRating = c.ratingCount > 0 ? (c.ratingSum / c.ratingCount).toFixed(1) : null;
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
                        {c.goals > 0 && <span className="text-brand-gold font-black">{c.goals}G</span>}
                        {c.assists > 0 && <span className="text-blue-400">{c.assists}A</span>}
                        {c.hatTricks > 0 && <span className="text-purple-400 font-black">{c.hatTricks}🎩</span>}
                        {avgRating && <span className="text-amber-400">★{avgRating}</span>}
                      </div>
                    </div>

                    {/* Impact bar */}
                    <div className="h-1 rounded-full bg-brand-border overflow-hidden mb-1.5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-500 to-brand-green"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>

                    {/* Player chips */}
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {c.playerNames.slice(0, 6).map(n => (
                        <span key={n} className="text-[9px] bg-brand-border/60 text-slate-400 rounded px-1.5 py-0.5">{n}</span>
                      ))}
                      {c.playerNames.length > 6 && (
                        <span className="text-[9px] text-slate-600">+{c.playerNames.length - 6} more</span>
                      )}
                    </div>

                    {/* Talking point */}
                    <p className="text-[10px] text-slate-500 italic leading-relaxed">
                      {talkingPoint(c, i, grandTotalGoals)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t border-brand-border/50 px-4 py-2 text-[9px] text-slate-700 text-center">
          WC Impact Score = Goals×4 + Assists×2.5 + Hat-tricks×8 + Defensive actions×0.3 · 🎩 = hat-trick
        </div>
      </div>
    </div>
  );
}
