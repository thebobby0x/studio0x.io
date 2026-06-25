export const dynamic = "force-dynamic";

import AppNav from "@/components/ui/AppNav";
import TournamentRecords from "@/components/stats/TournamentRecords";
import EliminationProximity from "@/components/stats/EliminationProximity";
import { BarChart2 } from "lucide-react";
import type { GroupStanding, TeamStanding } from "@/app/api/standings/route";
import { getTournamentWinnerMarkets } from "@/lib/polymarket";
import { prisma } from "@/lib/prisma";

// ── Group Intensity™ ──────────────────────────────────────────────────────────
// LIVE results-based: measures how tight and entertaining the group actually is
// (pts spread + goals per match). Updates as matches complete.
function groupIntensityScore(teams: TeamStanding[]): { score: number; label: string; emoji: string } {
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
    label: score >= 80 ? "Extremely Tight" : score >= 60 ? "Competitive" : score >= 40 ? "Taking Shape" : "Clear Leader",
    emoji: score >= 80 ? "🔥" : score >= 60 ? "⚡" : score >= 40 ? "📈" : "😌",
  };
}

// ── Group Danger Index™ ───────────────────────────────────────────────────────
// PRE-TOURNAMENT: how much tournament-favourite strength is concentrated in one group.
// Uses Polymarket win-tournament odds. A group where multiple top contenders
// are packed together = high danger (traditional "Group of Death" concept).
// multiplier = groupTotalOdds / expectedGroupOdds  (expected = totalOdds / 12)
function groupDangerIndex(
  teams: TeamStanding[],
  oddsMap: Map<string, number>,
  totalOdds: number,
): { multiplier: number; label: string; emoji: string; pct: number } | null {
  if (oddsMap.size === 0 || totalOdds === 0) return null;

  const expectedPerGroup = totalOdds / 12;
  const groupTotal = teams.reduce((s, t) => s + (oddsMap.get(t.tla) ?? 0), 0);
  if (groupTotal === 0) return null;

  const multiplier = Math.round((groupTotal / expectedPerGroup) * 10) / 10;
  const pct = Math.round(groupTotal * 100);

  const label =
    multiplier >= 3   ? "Group of Death" :
    multiplier >= 2   ? "Very Dangerous" :
    multiplier >= 1.4 ? "Above Average"  :
    multiplier >= 0.7 ? "Standard"       : "Underdog Group";

  const emoji =
    multiplier >= 3   ? "💀" :
    multiplier >= 2   ? "⚠️" :
    multiplier >= 1.4 ? "🎯" :
    multiplier >= 0.7 ? "⬜" : "🕊️";

  return { multiplier, label, emoji, pct };
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
        ptsPerGame * 40 / 3           // max 3 pts/game → max 40
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

type ConductRaw = { yellows: number; reds: number; fouls: number };
type ConductResult = ConductRaw & { score: number; label: string; color: string };

async function fetchTeamConduct(): Promise<Map<string, ConductResult>> {
  try {
    const stats = await prisma.playerTournamentStat.findMany({
      include: { player: { include: { team: true } } },
    });
    if (stats.length === 0) return new Map();

    const raw = new Map<string, ConductRaw>();
    for (const s of stats) {
      const tla = s.player.team.code;
      const e = raw.get(tla) ?? { yellows: 0, reds: 0, fouls: 0 };
      raw.set(tla, {
        yellows: e.yellows + s.yellowCards,
        reds: e.reds + s.redCards,
        fouls: e.fouls + s.foulsCommitted,
      });
    }

    const result = new Map<string, ConductResult>();
    for (const [tla, d] of raw) {
      const deductions = d.yellows * 3 + d.reds * 10 + d.fouls * 0.3;
      const score = Math.max(0, Math.round(100 - deductions));
      const label =
        score >= 90 ? "Exemplary" :
        score >= 75 ? "Disciplined" :
        score >= 55 ? "Physical" : "Aggressive";
      const color =
        score >= 90 ? "text-brand-green" :
        score >= 75 ? "text-amber-400" :
        score >= 55 ? "text-orange-400" : "text-red-400";
      result.set(tla, { ...d, score, label, color });
    }
    return result;
  } catch {
    return new Map();
  }
}

function gdString(gd: number): string {
  if (gd > 0) return `+${gd}`;
  return String(gd);
}

type ConductEntry = { yellows: number; reds: number; fouls: number; score: number; label: string; color: string };

function GroupCard({
  standing,
  oddsMap,
  totalOdds,
  conductMap,
}: {
  standing: GroupStanding;
  oddsMap: Map<string, number>;
  totalOdds: number;
  conductMap: Map<string, ConductEntry>;
}) {
  const gi  = groupIntensityScore(standing.teams);
  const gdi = groupDangerIndex(standing.teams, oddsMap, totalOdds);

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-brand-border bg-brand-card flex-wrap">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-gold/10 text-brand-gold text-xs font-black tracking-wider shrink-0">
          {standing.group}
        </span>
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400 mr-auto">
          Group {standing.group}
        </span>
        {/* Group Danger Index™ — pre-tournament Polymarket strength */}
        {gdi && (
          <span className="flex items-center gap-1 text-[10px] font-bold border border-brand-border/50 rounded-full px-2 py-0.5">
            <span>{gdi.emoji}</span>
            <span className={`${gdi.multiplier >= 2 ? "text-red-400" : gdi.multiplier >= 1.4 ? "text-amber-400" : "text-slate-500"}`}>
              {gdi.label}
            </span>
            <span className="text-slate-700 font-mono">{gdi.multiplier}×</span>
          </span>
        )}
        {/* Group Intensity™ — live results-based competitiveness */}
        {gi.score > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-slate-600">
            <span>{gi.emoji}</span>
            <span>{gi.label}</span>
          </span>
        )}
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[auto_1fr_repeat(8,auto)] gap-x-3 px-4 py-1.5 border-b border-brand-border/50 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
        <span className="w-4 text-center">#</span>
        <span>Team</span>
        <span className="w-5 text-center">P</span>
        <span className="w-5 text-center">W</span>
        <span className="w-5 text-center">D</span>
        <span className="w-5 text-center">L</span>
        <span className="w-5 text-center">GF</span>
        <span className="w-5 text-center">GA</span>
        <span className="w-7 text-center">GD</span>
        <span className="w-8 text-right">Pts</span>
        {conductMap.size > 0 && (
          <span className="w-12 text-right hidden sm:block">Cndct</span>
        )}
      </div>

      {/* Rows */}
      <div className="divide-y divide-brand-border/30">
        {standing.teams.map((team, idx) => {
          const isQualifying = idx < 2;
          const isBubble = idx === 2;

          return (
            <div
              key={team.tla}
              className={`relative grid grid-cols-[auto_1fr_repeat(8,auto)] gap-x-3 items-center px-4 py-2.5 transition-colors ${
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
              <span className="w-5 text-center text-xs text-slate-400 tabular-nums">{team.gf}</span>
              <span className="w-5 text-center text-xs text-slate-400 tabular-nums">{team.ga}</span>
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
              {conductMap.has(team.tla) && (
                <span className={`text-[9px] font-bold ${conductMap.get(team.tla)!.color} w-12 text-right tabular-nums hidden sm:block`}>
                  {conductMap.get(team.tla)!.score}
                </span>
              )}
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
      {/* Team Conduct™ legend */}
      {conductMap.size > 0 && (
        <div className="px-4 py-2 border-t border-brand-border/30 text-[9px] text-slate-700 hidden sm:block">
          <span className="font-black uppercase tracking-widest text-brand-gold mr-2">Team Conduct™</span>
          <span className="text-brand-green mr-2">≥90 Exemplary</span>
          <span className="text-amber-400 mr-2">≥75 Disciplined</span>
          <span className="text-orange-400 mr-2">≥55 Physical</span>
          <span className="text-red-400">&lt;55 Aggressive</span>
          <span className="ml-2 font-mono">· score = 100 − (Y×3 + R×10 + Fouls×0.3)</span>
        </div>
      )}
    </div>
  );
}

export default async function StandingsPage() {
  const [standings, oddsData, conductMap] = await Promise.all([
    fetchStandings(),
    getTournamentWinnerMarkets().catch(() => null),
    fetchTeamConduct(),
  ]);

  // Build tla → odds map from Polymarket data
  const oddsMap = new Map<string, number>();
  let totalOdds = 0;
  if (oddsData?.markets) {
    for (const m of oddsData.markets) {
      if (m.tla) { oddsMap.set(m.tla.toUpperCase(), m.probability); totalOdds += m.probability; }
    }
  }

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
              <GroupCard key={standing.group} standing={standing} oddsMap={oddsMap} totalOdds={totalOdds} conductMap={conductMap} />
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

        {/* Tournament Records™ */}
        <TournamentRecords />
        <div className="mt-8">
          <EliminationProximity limit={16} />
        </div>
      </main>

      <footer className="mt-16 border-t border-brand-border py-8 text-center text-xs text-slate-600">
        Studio0x.io · World Cup 2026 Stats Engine · Standings computed from live match data
      </footer>
    </div>
  );
}
