export const dynamic = "force-dynamic";

import AppNav from "@/components/ui/AppNav";
import { BarChart2 } from "lucide-react";
import type { GroupStanding, TeamStanding } from "@/app/api/standings/route";

// ── Group Death Score™ ────────────────────────────────────────────────────────
// Measures how competitive and exciting a group is based on pts tightness + goal rate
function groupDeathScore(teams: TeamStanding[]): { score: number; label: string; emoji: string } {
  const played = teams.filter(t => t.p > 0);
  if (played.length < 2) return { score: 0, label: "TBD", emoji: "⏳" };

  const pts = played.map(t => t.pts);
  const ptsRange = Math.max(...pts) - Math.min(...pts);
  const totalGoals = played.reduce((s, t) => s + t.gf, 0) / 2;
  const totalMatches = played.reduce((s, t) => s + t.p, 0) / 2;
  const goalsPerMatch = totalMatches > 0 ? totalGoals / totalMatches : 0;

  const tightness  = Math.max(0, 100 - (ptsRange / 9) * 70);
  const excitement = Math.min(100, (goalsPerMatch / 4) * 100);
  const score = Math.round(tightness * 0.65 + excitement * 0.35);

  return {
    score,
    label: score >= 80 ? "Group of Death" : score >= 60 ? "Competitive" : score >= 40 ? "Taking Shape" : "Clear Leader",
    emoji: score >= 80 ? "💀" : score >= 60 ? "🔥" : score >= 40 ? "⚡" : "😌",
  };
}

// ── Power Rankings™ ──────────────────────────────────────────────────────────
// Composite team strength score across all groups (pts + gd + goals efficiency)
function powerRankings(standings: GroupStanding[]) {
  const all: Array<{ tla: string; name: string; flag: string; group: string; score: number; p: number }> = [];

  for (const g of standings) {
    for (const t of g.teams) {
      if (t.p === 0) continue;
      const ptsPerGame = t.pts / t.p;
      const gdPerGame  = t.gd  / t.p;
      const gfPerGame  = t.gf  / t.p;
      const winRate    = t.w   / t.p;

      const score = Math.round(
        ptsPerGame * 40 / 3 * 100    // max 3 pts/game → max 40
        + Math.max(0, gdPerGame + 5) / 10 * 30  // centred on gd=0
        + gfPerGame / 4 * 20          // 4 goals/game → max 20
        + winRate * 10                // win rate component
      );

      all.push({ tla: t.tla, name: t.name, flag: t.flag, group: g.group, score: Math.min(100, score), p: t.p });
    }
  }

  return all.sort((a, b) => b.score - a.score).slice(0, 16);
}

// ── Tournament Entropy™ ───────────────────────────────────────────────────────
// Shannon entropy on W/D/L distribution — higher = more unpredictable tournament
function tournamentEntropy(standings: GroupStanding[]): { pct: number; label: string } {
  let wins = 0, draws = 0;
  for (const g of standings) {
    for (const t of g.teams) { wins += t.w; draws += t.d; }
  }
  const totalResults = (wins + draws) / 2;
  if (totalResults === 0) return { pct: 0, label: "No matches yet" };

  const pW = (wins / 2) / totalResults;
  const pD = (draws / 2) / totalResults;
  const pL = pW;
  const h = (p: number) => (p > 0 ? -p * Math.log2(p) : 0);
  const pct = Math.round(((h(pW) + h(pD) + h(pL)) / Math.log2(3)) * 100);

  return {
    pct,
    label: pct >= 90 ? "Perfectly Balanced" :
           pct >= 75 ? "Highly Unpredictable" :
           pct >= 60 ? "Competitive" :
           pct >= 45 ? "Favorites Dominating" : "Predictable",
  };
}

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
  const gds = groupDeathScore(standing.teams);

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
        {gds.score > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-bold">
            <span>{gds.emoji}</span>
            <span className="text-slate-500">{gds.label}</span>
            <span className="text-slate-700 font-mono">{gds.score}</span>
          </span>
        )}
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
  const entropy = tournamentEntropy(standings);
  const power = powerRankings(standings);

  const totalPlayed = standings.reduce((s, g) =>
    s + g.teams.reduce((ts, t) => ts + t.p, 0) / 2, 0
  );
  const totalGoals = standings.reduce((s, g) =>
    s + g.teams.reduce((ts, t) => ts + t.gf, 0) / 2, 0
  );
  const avgGoals = totalPlayed > 0 ? (totalGoals / totalPlayed).toFixed(2) : "—";

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      <AppNav />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-3xl font-black text-white tracking-tight">
            FIFA World Cup 2026 <span className="text-brand-gold">Standings</span>
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Live group standings computed from finished matches
          </p>
        </div>

        {/* Tournament Entropy™ strip */}
        {totalPlayed > 0 && (
          <div className="rounded-2xl bg-brand-card border border-brand-border px-5 py-4 mb-6 flex flex-wrap items-center gap-x-8 gap-y-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-brand-gold mb-1">Tournament Entropy™</div>
              <div className="flex items-center gap-3">
                <div className="relative w-36 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-brand-green to-amber-400 rounded-full" style={{ width: `${entropy.pct}%` }} />
                </div>
                <span className="text-sm font-black text-white tabular-nums">{entropy.pct}%</span>
                <span className="text-[10px] text-slate-500">{entropy.label}</span>
              </div>
              <div className="text-[9px] text-slate-700 mt-1">Shannon entropy on W/D/L outcomes · 100% = perfectly random</div>
            </div>
            <div className="flex gap-6 text-center">
              <div>
                <div className="text-xl font-black text-white tabular-nums">{totalPlayed}</div>
                <div className="text-[9px] text-slate-600 uppercase tracking-wider">Matches</div>
              </div>
              <div>
                <div className="text-xl font-black text-white tabular-nums">{totalGoals}</div>
                <div className="text-[9px] text-slate-600 uppercase tracking-wider">Goals</div>
              </div>
              <div>
                <div className="text-xl font-black text-white tabular-nums">{avgGoals}</div>
                <div className="text-[9px] text-slate-600 uppercase tracking-wider">Goals/Match</div>
              </div>
            </div>
          </div>
        )}


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

        {/* Power Rankings™ */}
        {power.length > 0 && (
          <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden mt-6">
            <div className="flex items-center justify-between px-5 py-3 border-b border-brand-border">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Power Rankings™</span>
                <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
              </div>
              <span className="text-[9px] text-slate-700 uppercase tracking-wider">Pts efficiency · GD · Goals · Win rate</span>
            </div>
            <div className="divide-y divide-brand-border/30">
              {power.map((t, i) => (
                <div key={t.tla} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="text-xs text-slate-600 tabular-nums w-5 text-right font-mono">{i + 1}</span>
                  <span className="text-base leading-none">{t.flag}</span>
                  <span className="text-xs font-semibold text-slate-200 flex-1 truncate">{t.name}</span>
                  <span className="text-[9px] text-slate-600 font-mono w-7 text-center">G{t.group}</span>
                  <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-brand-gold to-amber-300 rounded-full"
                      style={{ width: `${t.score}%` }}
                    />
                  </div>
                  <span className="text-xs font-black text-brand-gold tabular-nums w-8 text-right">{t.score}</span>
                </div>
              ))}
            </div>
            <div className="px-5 py-2 border-t border-brand-border/30 text-[9px] text-slate-700">
              Top 16 teams by performance · updates live as matches complete
            </div>
          </div>
        )}
      </main>

      <footer className="mt-16 border-t border-brand-border py-8 text-center text-xs text-slate-600">
        Studio0x.io · World Cup 2026 Stats Engine · Standings computed from live match data
      </footer>
    </div>
  );
}
