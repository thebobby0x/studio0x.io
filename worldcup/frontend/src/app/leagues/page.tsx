export const dynamic = "force-dynamic";

import AppNav from "@/components/ui/AppNav";
import { prisma } from "@/lib/prisma";
import { Building2, ChevronRight } from "lucide-react";
import Link from "next/link";
import PlayerPerformanceIndex from "@/components/stats/PlayerPerformanceIndex";
import ClubContributionIndex from "@/components/stats/ClubContributionIndex";
import TournamentXMetrics from "@/components/stats/TournamentXMetrics";
import ClubWCImpact from "@/components/stats/ClubWCImpact";

function LeagueIcon({ league }: { league: string }): string {
  const map: Record<string, string> = {
    "Premier League": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    "La Liga": "🇪🇸",
    "Bundesliga": "🇩🇪",
    "Serie A": "🇮🇹",
    "Ligue 1": "🇫🇷",
    "MLS": "🇺🇸",
    "Saudi Pro League": "🇸🇦",
  };
  return map[league] ?? "⚽";
}

export default async function LeaguesPage() {
  const players = await prisma.player.findMany({
    include: { team: true },
    where: { club: { not: "" } },
    orderBy: { name: "asc" },
  });

  // Group by league → club → players
  const leagueMap = new Map<string, Map<string, typeof players>>();

  for (const player of players) {
    if (!leagueMap.has(player.league)) {
      leagueMap.set(player.league, new Map());
    }
    const clubMap = leagueMap.get(player.league)!;
    if (!clubMap.has(player.club)) {
      clubMap.set(player.club, []);
    }
    clubMap.get(player.club)!.push(player);
  }

  // Sort leagues by total player count (descending)
  const sortedLeagues = Array.from(leagueMap.entries()).sort(
    ([, a], [, b]) => {
      const countA = Array.from(a.values()).reduce((s, p) => s + p.length, 0);
      const countB = Array.from(b.values()).reduce((s, p) => s + p.length, 0);
      return countB - countA;
    }
  );

  // Summary stats
  const totalPlayers = players.length;
  const totalLeagues = leagueMap.size;
  const clubCounts = new Map<string, number>();
  for (const player of players) {
    clubCounts.set(player.club, (clubCounts.get(player.club) ?? 0) + 1);
  }
  const totalClubs = clubCounts.size;
  const topClubEntry = Array.from(clubCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  const topClub = topClubEntry ? `${topClubEntry[0]} (${topClubEntry[1]})` : "—";

  const hasData = players.length > 0;

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      <AppNav />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-3xl font-black text-white tracking-tight">
            Club &amp; League <span className="text-brand-gold">Breakdown</span>
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            {hasData
              ? `${totalClubs} clubs from ${totalLeagues} leagues represented at footy26`
              : "Club data not yet seeded — use the admin seed route to populate"}
          </p>
        </div>

        {/* Summary stat bar */}
        {hasData && (
          <div className="rounded-2xl bg-brand-card border border-brand-border px-5 py-4 mb-6 flex flex-wrap gap-x-8 gap-y-4">
            <div className="text-center">
              <div className="text-2xl font-black text-white tabular-nums">{totalPlayers}</div>
              <div className="text-[9px] text-slate-600 uppercase tracking-wider mt-0.5">WC Players</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-white tabular-nums">{totalClubs}</div>
              <div className="text-[9px] text-slate-600 uppercase tracking-wider mt-0.5">Clubs</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-white tabular-nums">{totalLeagues}</div>
              <div className="text-[9px] text-slate-600 uppercase tracking-wider mt-0.5">Leagues</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-black text-brand-gold">{topClub}</div>
              <div className="text-[9px] text-slate-600 uppercase tracking-wider mt-0.5">Top Club</div>
            </div>
          </div>
        )}

        {/* Fallback */}
        {!hasData && (
          <div className="rounded-2xl bg-brand-card border border-brand-border p-12 text-center">
            <Building2 size={48} className="mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400 font-semibold">No club data available yet</p>
            <p className="text-slate-600 text-sm mt-1">
              Admin: POST to <code className="text-brand-gold font-mono text-xs">/api/admin/seed-players?mock=true</code> to populate with curated data.
            </p>
          </div>
        )}

        {/* Club WC Impact — headline feature */}
        <div className="mb-8">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-600 mb-4">WC Impact by Club &amp; League</h2>
          <ClubWCImpact limit={12} />
        </div>

        {/* studio0x Proprietary Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <ClubContributionIndex limit={8} />
          <PlayerPerformanceIndex limit={10} />
        </div>

        {/* Novel Cross-Metrics — connecting traditionally separate stat categories */}
        <div className="mb-2">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-600 mb-4">Novel Cross-Metrics™</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">
            <TournamentXMetrics metric="cps" limit={10} />
            <TournamentXMetrics metric="ipm" limit={10} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <TournamentXMetrics metric="sei" limit={8} />
            <TournamentXMetrics metric="dd"  limit={8} />
            <TournamentXMetrics metric="pr"  limit={8} />
          </div>
        </div>

        {/* League sections */}
        {sortedLeagues.map(([league, clubMap]) => {
          const icon = LeagueIcon({ league });
          const leagueTotal = Array.from(clubMap.values()).reduce((s, p) => s + p.length, 0);

          // Sort clubs within league by player count desc
          const sortedClubs = Array.from(clubMap.entries()).sort(
            ([, a], [, b]) => b.length - a.length
          );

          return (
            <div key={league} className="mb-6">
              {/* League header */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xl leading-none">{icon}</span>
                <h2 className="text-base font-black text-white tracking-tight">{league}</h2>
                <span className="inline-flex items-center justify-center rounded-full bg-brand-gold/10 text-brand-gold text-xs font-black px-2.5 py-0.5 tabular-nums">
                  {leagueTotal}
                </span>
              </div>

              {/* Club cards grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {sortedClubs.map(([club, clubPlayers]) => (
                  <div
                    key={club}
                    className="rounded-xl bg-brand-card border border-brand-border overflow-hidden"
                  >
                    {/* Club name header */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-brand-border bg-white/2">
                      <span className="text-sm font-black text-white truncate">{club}</span>
                      <span className="text-[10px] font-black text-brand-gold tabular-nums ml-2 shrink-0">
                        {clubPlayers.length} players
                      </span>
                    </div>

                    {/* Player list */}
                    <div className="divide-y divide-brand-border/30">
                      {clubPlayers.map((player) => (
                        <Link
                          key={player.id}
                          href={`/team/${player.team.code}`}
                          className="flex items-center gap-2.5 px-4 py-2 hover:bg-white/5 transition-colors group"
                        >
                          <span className="text-base leading-none shrink-0">{player.team.flagEmoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-200 truncate group-hover:text-white transition-colors">
                              {player.name}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-slate-600 uppercase tracking-wider">{player.position}</span>
                              <span className="text-[10px] text-slate-700">·</span>
                              <span className="text-[10px] text-slate-600">{player.team.name}</span>
                            </div>
                          </div>
                          {player.number > 0 && (
                            <span className="text-[10px] font-mono text-slate-700 shrink-0">#{player.number}</span>
                          )}
                          <ChevronRight size={12} className="text-slate-700 group-hover:text-slate-500 shrink-0 transition-colors" />
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </main>

      <footer className="mt-16 border-t border-brand-border py-8 text-center text-xs text-slate-600">
        studio0x.io · footy26 · Club &amp; League breakdown
      </footer>
    </div>
  );
}
