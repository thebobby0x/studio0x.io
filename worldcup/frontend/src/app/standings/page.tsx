export const dynamic = "force-dynamic";

import AppNav from "@/components/ui/AppNav";
import { BarChart2 } from "lucide-react";
import type { GroupStanding } from "@/app/api/standings/route";

async function fetchStandings(): Promise<GroupStanding[]> {
  try {
    const { GET } = await import("@/app/api/standings/route");
    const res = await GET();
    return res.json() as Promise<GroupStanding[]>;
  } catch {
    return [];
  }
}

function gdString(gd: number): string {
  if (gd > 0) return `+${gd}`;
  return String(gd);
}

function GroupCard({ standing }: { standing: GroupStanding }) {
  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-brand-border bg-brand-card">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-gold/10 text-brand-gold text-xs font-black tracking-wider">
          {standing.group}
        </span>
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Group {standing.group}
        </span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[auto_1fr_repeat(6,auto)] gap-x-3 px-4 py-1.5 border-b border-brand-border/50 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
        <span className="w-4 text-center">#</span>
        <span>Team</span>
        <span className="w-5 text-center">P</span>
        <span className="w-5 text-center">W</span>
        <span className="w-5 text-center">D</span>
        <span className="w-5 text-center">L</span>
        <span className="w-7 text-center">GD</span>
        <span className="w-8 text-right">Pts</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-brand-border/30">
        {standing.teams.map((team, idx) => {
          const isQualifying = idx < 2;
          const isBubble = idx === 2;

          return (
            <div
              key={team.tla}
              className={`relative grid grid-cols-[auto_1fr_repeat(6,auto)] gap-x-3 items-center px-4 py-2.5 transition-colors ${
                isQualifying ? "bg-brand-green/5 hover:bg-brand-green/10" :
                isBubble     ? "bg-amber-500/3 hover:bg-amber-500/7" :
                               "hover:bg-white/3"
              }`}
            >
              {/* Qualifying left border */}
              {isQualifying && (
                <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-brand-green rounded-r" />
              )}
              {isBubble && (
                <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-amber-500/40 rounded-r" />
              )}

              {/* Rank */}
              <span className="w-4 text-center text-xs font-semibold text-slate-600 tabular-nums">
                {idx + 1}
              </span>

              {/* Flag + Name */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base leading-none shrink-0">{team.flag}</span>
                <span className={`text-sm font-semibold truncate ${
                  isQualifying ? "text-white" : "text-slate-300"
                }`}>
                  {team.name}
                </span>
                <span className="text-[10px] text-slate-600 font-mono shrink-0 hidden sm:inline">
                  {team.tla}
                </span>
              </div>

              {/* Stats */}
              <span className="w-5 text-center text-xs text-slate-400 tabular-nums">{team.p}</span>
              <span className="w-5 text-center text-xs text-slate-400 tabular-nums">{team.w}</span>
              <span className="w-5 text-center text-xs text-slate-400 tabular-nums">{team.d}</span>
              <span className="w-5 text-center text-xs text-slate-400 tabular-nums">{team.l}</span>
              <span className={`w-7 text-center text-xs font-medium tabular-nums ${
                team.gd > 0 ? "text-brand-green" :
                team.gd < 0 ? "text-red-400" :
                "text-slate-500"
              }`}>
                {gdString(team.gd)}
              </span>
              <span className="w-8 text-right text-sm font-black text-white tabular-nums">
                {team.pts}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend (only show if any teams visible) */}
      {standing.teams.length > 0 && (
        <div className="flex items-center gap-4 px-4 py-2 border-t border-brand-border/30 text-[10px] text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-brand-green/30 border-l-2 border-brand-green" />
            Qualifying
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/10 border-l-2 border-amber-500/50" />
            Potential play-off
          </span>
        </div>
      )}
    </div>
  );
}

export default async function StandingsPage() {
  const standings = await fetchStandings();

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      <AppNav />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white tracking-tight">
            FIFA World Cup 2026 <span className="text-brand-gold">Standings</span>
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Live group standings computed from finished matches
          </p>
        </div>

        {standings.length === 0 ? (
          <div className="rounded-2xl bg-brand-card border border-brand-border p-12 text-center">
            <BarChart2 size={48} className="mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400 font-semibold">No standings available</p>
            <p className="text-slate-600 text-sm mt-1">
              Standings will appear once group stage matches have been played.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {standings.map((standing) => (
              <GroupCard key={standing.group} standing={standing} />
            ))}
          </div>
        )}
      </main>

      <footer className="mt-16 border-t border-brand-border py-8 text-center text-xs text-slate-600">
        Studio0x.io · World Cup 2026 Stats Engine · Standings computed from live match data
      </footer>
    </div>
  );
}
