export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft, Users, ChevronRight, Target, Star, Zap, Shield, Activity } from "lucide-react";
import AppNav from "@/components/ui/AppNav";
import { getFlag } from "@/lib/flags";
import type { ScheduleMatch } from "@/app/api/schedule/route";
import { prisma } from "@/lib/prisma";

async function fetchSchedule(): Promise<ScheduleMatch[]> {
  try {
    const { GET } = await import("@/app/api/schedule/route");
    const res = await GET();
    return res.json() as Promise<ScheduleMatch[]>;
  } catch {
    return [];
  }
}

const POSITION_ORDER = ["GK", "DEF", "MID", "FWD"];
const POSITION_LABELS: Record<string, string> = {
  GK: "Goalkeeper",
  DEF: "Defenders",
  MID: "Midfielders",
  FWD: "Forwards",
};

// Cross-metric helpers (same formulas as TournamentXMetrics component)
function calcIPM(s: { goals: number; assists: number; passesKey: number; minutesPlayed: number }): number | null {
  if (s.minutesPlayed < 45) return null;
  return ((s.goals * 3 + s.assists * 2 + s.passesKey * 0.5) / s.minutesPlayed) * 90;
}

function calcSEI(s: { shotsTotal: number; shotsOnTarget: number; goals: number }): number | null {
  if (s.shotsTotal < 1) return null;
  const accuracy = s.shotsOnTarget / s.shotsTotal;
  const conversion = s.goals / s.shotsTotal;
  return (accuracy * 0.4 + conversion * 0.6) * 100;
}

function calcDD(s: { duelsTotal: number; duelsWon: number }): number | null {
  if (s.duelsTotal < 5) return null;
  return (s.duelsWon / s.duelsTotal) * Math.log(s.duelsTotal + 1) * 10;
}

function calcCPS(s: {
  goals: number; assists: number; passesKey: number; tacklesTotal: number;
  interceptions: number; duelsWon: number; foulsCommitted: number;
  yellowCards: number; redCards: number; minutesPlayed: number;
}): number | null {
  if (s.minutesPlayed < 45) return null;
  const discipline = s.foulsCommitted + s.yellowCards * 2 + s.redCards * 5 + 1;
  const output = s.goals * 3 + s.assists * 2 + s.passesKey + s.tacklesTotal + s.interceptions + s.duelsWon * 0.5;
  return (output / discipline) * (s.minutesPlayed / 90);
}

function fmt(n: number | null): string {
  if (n === null) return "—";
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
}

function StatBar({ label, value, max, color = "bg-brand-gold" }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] text-slate-600 uppercase tracking-wider">{label}</span>
        <span className="text-[10px] font-mono text-slate-400">{value}</span>
      </div>
      <div className="h-1 rounded-full bg-brand-border">
        <div className={`h-1 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MatchRow({ m, teamTla }: { m: ScheduleMatch; teamTla: string }) {
  const isHome = (m.homeTeam.tla ?? "").toUpperCase() === teamTla.toUpperCase();
  const opp = isHome ? m.awayTeam : m.homeTeam;
  const teamScore = isHome ? m.homeScore : m.awayScore;
  const oppScore  = isHome ? m.awayScore : m.homeScore;
  const isLive    = m.status === "LIVE" || m.status === "HT";
  const isDone    = m.status === "FT";
  const groupLabel = m.group ? `Group ${m.group}` : m.stageLabel;

  let result: string | null = null;
  let resultColor = "";
  if (isDone && teamScore !== null && oppScore !== null) {
    if (teamScore > oppScore)       { result = "W"; resultColor = "text-brand-green"; }
    else if (teamScore < oppScore)  { result = "L"; resultColor = "text-red-400"; }
    else                             { result = "D"; resultColor = "text-amber-400"; }
  }

  return (
    <Link href={`/schedule/${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors group">
      <div className="w-16 shrink-0 text-[10px] text-slate-600 uppercase tracking-wider">{groupLabel}</div>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-lg">{getFlag(opp.tla)}</span>
        <span className="text-sm font-semibold text-slate-300 truncate">{opp.name}</span>
        <span className="text-[10px] text-slate-600 shrink-0">{isHome ? "H" : "A"}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {isLive ? (
          <span className="flex items-center gap-1 text-xs font-bold text-brand-green">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
            {teamScore ?? 0}–{oppScore ?? 0}
          </span>
        ) : isDone ? (
          <div className="flex items-center gap-2">
            <span className={`text-xs font-black w-4 text-center ${resultColor}`}>{result}</span>
            <span className="text-xs font-bold text-slate-400 tabular-nums">{teamScore}–{oppScore}</span>
          </div>
        ) : (
          <span suppressHydrationWarning className="text-xs text-slate-600">
            {new Date(m.utcDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        )}
        <ChevronRight size={12} className="text-slate-700 group-hover:text-slate-400 transition-colors" />
      </div>
    </Link>
  );
}

export default async function TeamPage({ params }: { params: Promise<{ tla: string }> }) {
  const { tla } = await params;
  const TLA = tla.toUpperCase();

  const allMatches = await fetchSchedule();
  const teamMatches = allMatches.filter(m =>
    (m.homeTeam.tla ?? "").toUpperCase() === TLA || (m.awayTeam.tla ?? "").toUpperCase() === TLA
  );

  if (teamMatches.length === 0) {
    return (
      <div className="min-h-screen bg-brand-dark text-slate-200 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-6xl">{getFlag(TLA)}</div>
          <p className="text-slate-400 font-semibold">Team not found in the footy26 schedule.</p>
          <Link href="/schedule" className="text-brand-gold hover:text-amber-300 text-sm">← Back to schedule</Link>
        </div>
      </div>
    );
  }

  const teamInfo = (teamMatches[0].homeTeam.tla ?? "").toUpperCase() === TLA
    ? teamMatches[0].homeTeam
    : teamMatches[0].awayTeam;
  const group = teamMatches.find(m => m.group)?.group ?? null;

  // Compute record from completed matches
  const ftMatches = teamMatches.filter(m => m.status === "FT");
  let w = 0, d = 0, l = 0, gf = 0, ga = 0;
  for (const m of ftMatches) {
    const isHome = (m.homeTeam.tla ?? "").toUpperCase() === TLA;
    const scored   = isHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0);
    const conceded = isHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0);
    gf += scored; ga += conceded;
    if (scored > conceded) w++;
    else if (scored < conceded) l++;
    else d++;
  }
  const pts = w * 3 + d;

  // Form guide — last 5 results newest-first
  const formGuide = [...ftMatches].reverse().slice(0, 5).map(m => {
    const isHome = (m.homeTeam.tla ?? "").toUpperCase() === TLA;
    const scored   = isHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0);
    const conceded = isHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0);
    const opp = isHome ? m.awayTeam : m.homeTeam;
    if (scored > conceded) return { r: "W", color: "bg-brand-green", opp: opp.name, score: `${scored}–${conceded}` };
    if (scored < conceded) return { r: "L", color: "bg-red-500", opp: opp.name, score: `${scored}–${conceded}` };
    return { r: "D", color: "bg-amber-500", opp: opp.name, score: `${scored}–${conceded}` };
  });

  // Load players with tournament stats
  type PlayerWithStat = {
    id: string;
    number: number;
    name: string;
    position: string;
    club: string;
    tournamentStat: {
      goals: number; assists: number; matches: number; minutesPlayed: number;
      yellowCards: number; redCards: number; rating: number;
      shotsTotal: number; shotsOnTarget: number;
      passesTotal: number; passesKey: number;
      tacklesTotal: number; tackleBlocks: number; interceptions: number;
      duelsTotal: number; duelsWon: number;
      dribblesAttempts: number; dribblesSuccess: number;
      foulsDrawn: number; foulsCommitted: number;
      penaltiesScored: number; penaltiesMissed: number;
    } | null;
  };

  let players: PlayerWithStat[] = [];
  try {
    const dbTeam = await prisma.team.findFirst({
      where: { code: TLA },
      include: {
        homePlayers: {
          include: { tournamentStat: true },
        },
      },
    });
    if (dbTeam?.homePlayers) {
      players = (dbTeam.homePlayers as PlayerWithStat[]).sort((a, b) => {
        const pi = POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position);
        return pi !== 0 ? pi : a.number - b.number;
      });
    }
  } catch {
    // DB unavailable
  }

  // Top performers (need at least 1 match)
  const withStats = players.filter(p => p.tournamentStat && p.tournamentStat.matches > 0);
  const topScorers = [...withStats].sort((a, b) => (b.tournamentStat?.goals ?? 0) - (a.tournamentStat?.goals ?? 0)).slice(0, 5);
  const topAssists = [...withStats].sort((a, b) => (b.tournamentStat?.assists ?? 0) - (a.tournamentStat?.assists ?? 0)).slice(0, 5);
  const topRated   = [...withStats]
    .filter(p => (p.tournamentStat?.minutesPlayed ?? 0) >= 45)
    .sort((a, b) => (b.tournamentStat?.rating ?? 0) - (a.tournamentStat?.rating ?? 0))
    .slice(0, 5);

  // Cross-metrics for top players by IPM
  const crossMetricPlayers = [...withStats]
    .filter(p => (p.tournamentStat?.minutesPlayed ?? 0) >= 45)
    .map(p => {
      const s = p.tournamentStat!;
      return {
        ...p,
        ipm: calcIPM(s),
        sei: calcSEI(s),
        dd: calcDD(s),
        cps: calcCPS(s),
      };
    })
    .filter(p => p.ipm !== null || p.cps !== null)
    .sort((a, b) => ((b.cps ?? 0) - (a.cps ?? 0)))
    .slice(0, 8);

  // Squad max stats for bar scaling
  const maxGoals = Math.max(1, ...withStats.map(p => p.tournamentStat?.goals ?? 0));
  const maxAssists = Math.max(1, ...withStats.map(p => p.tournamentStat?.assists ?? 0));
  const maxRating = Math.max(1, ...withStats.map(p => p.tournamentStat?.rating ?? 0));

  // Split matches
  const liveMatches     = teamMatches.filter(m => m.status === "LIVE" || m.status === "HT");
  const upcomingMatches = teamMatches.filter(m => m.status === "NS");
  const pastMatches     = teamMatches.filter(m => m.status === "FT").reverse();
  const hasStats        = withStats.length > 0;

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      <AppNav />

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Back */}
        <Link href="/schedule" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={14} />
          Back to schedule
        </Link>

        {/* Team hero */}
        <div className="rounded-3xl bg-brand-card border border-brand-border overflow-hidden">
          <div className="bg-gradient-to-br from-brand-green/10 via-transparent to-amber-500/10 px-8 py-10">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              <div className="text-8xl select-none">{getFlag(TLA)}</div>
              <div className="text-center sm:text-left">
                <div className="text-3xl font-black text-white tracking-tight">{teamInfo.name}</div>
                <div className="text-slate-500 mt-1 text-sm uppercase tracking-widest">{TLA}</div>
                {group && (
                  <div className="mt-3 inline-flex items-center gap-2 bg-brand-gold/10 border border-brand-gold/20 text-brand-gold text-xs font-bold px-3 py-1 rounded-full">
                    Group {group}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Record bar */}
          {ftMatches.length > 0 && (
            <div className="border-t border-brand-border px-8 py-5">
              <div className="flex items-center gap-1 mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-600">Tournament Record</div>
              <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
                <div className="grid grid-cols-7 gap-2 text-center">
                  {[
                    { label: "P",   value: ftMatches.length, color: "text-slate-300" },
                    { label: "W",   value: w,   color: "text-brand-green" },
                    { label: "D",   value: d,   color: "text-amber-400" },
                    { label: "L",   value: l,   color: "text-red-400" },
                    { label: "GF",  value: gf,  color: "text-slate-300" },
                    { label: "GA",  value: ga,  color: "text-slate-300" },
                    { label: "Pts", value: pts, color: "text-white" },
                  ].map(({ label, value, color }) => (
                    <div key={label}>
                      <div className={`text-2xl font-black tabular-nums ${color}`}>{value}</div>
                      <div className="text-[10px] text-slate-600 uppercase tracking-wider mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Form guide */}
                {formGuide.length > 0 && (
                  <div>
                    <div className="text-[10px] text-slate-600 uppercase tracking-widest mb-2">Form</div>
                    <div className="flex items-center gap-1.5">
                      {formGuide.map((f, i) => (
                        <div key={i} className="group relative">
                          <div className={`w-7 h-7 rounded-full ${f.color} flex items-center justify-center text-[10px] font-black text-white cursor-default`}>
                            {f.r}
                          </div>
                          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-brand-dark border border-brand-border rounded px-2 py-1 text-[10px] text-slate-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                            {f.opp} {f.score}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Top Performers */}
        {hasStats && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Top Performers™</span>
              <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Top scorers */}
              <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-brand-border">
                  <Target size={13} className="text-brand-gold" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Goals</span>
                </div>
                <div className="divide-y divide-brand-border/30">
                  {topScorers.filter(p => (p.tournamentStat?.goals ?? 0) > 0).slice(0, 5).map((p, i) => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-2">
                      <span className="text-[10px] text-slate-700 w-4 text-right font-mono">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-200 truncate">{p.name}</div>
                        <div className="text-[10px] text-slate-600">{p.position}</div>
                      </div>
                      <span className="text-sm font-black text-brand-gold tabular-nums">{p.tournamentStat?.goals ?? 0}</span>
                    </div>
                  ))}
                  {topScorers.filter(p => (p.tournamentStat?.goals ?? 0) > 0).length === 0 && (
                    <div className="px-4 py-6 text-center text-slate-700 text-xs">No goals yet</div>
                  )}
                </div>
              </div>

              {/* Top assists */}
              <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-brand-border">
                  <Zap size={13} className="text-slate-300" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Assists</span>
                </div>
                <div className="divide-y divide-brand-border/30">
                  {topAssists.filter(p => (p.tournamentStat?.assists ?? 0) > 0).slice(0, 5).map((p, i) => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-2">
                      <span className="text-[10px] text-slate-700 w-4 text-right font-mono">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-200 truncate">{p.name}</div>
                        <div className="text-[10px] text-slate-600">{p.position}</div>
                      </div>
                      <span className="text-sm font-black text-slate-300 tabular-nums">{p.tournamentStat?.assists ?? 0}</span>
                    </div>
                  ))}
                  {topAssists.filter(p => (p.tournamentStat?.assists ?? 0) > 0).length === 0 && (
                    <div className="px-4 py-6 text-center text-slate-700 text-xs">No assists yet</div>
                  )}
                </div>
              </div>

              {/* Top rated */}
              <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-brand-border">
                  <Star size={13} className="text-amber-400" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Rating</span>
                </div>
                <div className="divide-y divide-brand-border/30">
                  {topRated.filter(p => (p.tournamentStat?.rating ?? 0) > 0).slice(0, 5).map((p, i) => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-2">
                      <span className="text-[10px] text-slate-700 w-4 text-right font-mono">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-200 truncate">{p.name}</div>
                        <div className="text-[10px] text-slate-600">{p.position}</div>
                      </div>
                      <span className="text-sm font-black text-amber-400 tabular-nums">{(p.tournamentStat?.rating ?? 0).toFixed(1)}</span>
                    </div>
                  ))}
                  {topRated.filter(p => (p.tournamentStat?.rating ?? 0) > 0).length === 0 && (
                    <div className="px-4 py-6 text-center text-slate-700 text-xs">No ratings yet</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cross-Metrics */}
        {crossMetricPlayers.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Activity size={13} className="text-brand-gold" />
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Novel Cross-Metrics™</span>
              <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
            </div>
            <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[540px]">
                  <thead>
                    <tr className="border-b border-brand-border bg-brand-dark/40">
                      <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Player</th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Min</th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-brand-gold uppercase tracking-widest">IPM™</th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-slate-300 uppercase tracking-widest">SEI™</th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-brand-green uppercase tracking-widest">DD™</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-slate-300 uppercase tracking-widest">CPS™</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border/30">
                    {crossMetricPlayers.map(p => (
                      <tr key={p.id} className="hover:bg-white/3 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-slate-200">{p.name}</div>
                          <div className="text-[10px] text-slate-600">{p.position}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-500">{p.tournamentStat?.minutesPlayed ?? 0}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-brand-gold">{fmt(p.ipm)}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-300">{fmt(p.sei)}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-brand-green">{fmt(p.dd)}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-300">{fmt(p.cps)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t border-brand-border/30 flex flex-wrap gap-4 text-[9px] text-slate-700">
                <span><span className="text-brand-gold font-bold">IPM™</span> Impact Per Minute</span>
                <span><span className="text-slate-300 font-bold">SEI™</span> Shot Efficiency Index</span>
                <span><span className="text-brand-green font-bold">DD™</span> Duel Dominance</span>
                <span><span className="text-slate-300 font-bold">CPS™</span> Complete Player Score</span>
              </div>
            </div>
          </div>
        )}

        {/* Matches + Squad grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Fixtures */}
          <div className="space-y-4">
            {liveMatches.length > 0 && (
              <div className="rounded-2xl bg-brand-card border border-brand-green/40 overflow-hidden">
                <div className="px-4 py-3 border-b border-brand-border flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Live Now</span>
                </div>
                <div className="divide-y divide-brand-border/50">
                  {liveMatches.map(m => <MatchRow key={m.id} m={m} teamTla={TLA} />)}
                </div>
              </div>
            )}

            {upcomingMatches.length > 0 && (
              <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
                <div className="px-4 py-3 border-b border-brand-border text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Upcoming
                </div>
                <div className="divide-y divide-brand-border/50">
                  {upcomingMatches.map(m => <MatchRow key={m.id} m={m} teamTla={TLA} />)}
                </div>
              </div>
            )}

            {pastMatches.length > 0 && (
              <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
                <div className="px-4 py-3 border-b border-brand-border text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Results
                </div>
                <div className="divide-y divide-brand-border/50">
                  {pastMatches.map(m => <MatchRow key={m.id} m={m} teamTla={TLA} />)}
                </div>
              </div>
            )}
          </div>

          {/* Squad with stats */}
          <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
            <div className="px-4 py-3 border-b border-brand-border flex items-center gap-2">
              <Users size={13} className="text-slate-500" />
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Squad</span>
              {hasStats && (
                <span className="ml-auto text-[9px] text-slate-700 font-mono">G · A · ★</span>
              )}
            </div>
            {players.length === 0 ? (
              <div className="px-4 py-10 text-center text-slate-600 text-sm">
                <Users size={32} className="mx-auto mb-3 opacity-30" />
                <p>Squad data not loaded for this team.</p>
                <p className="text-xs mt-1 text-slate-700">Only seeded squads are available.</p>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {POSITION_ORDER.map(pos => {
                  const pp = players.filter(p => p.position === pos);
                  if (!pp.length) return null;
                  return (
                    <div key={pos}>
                      <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2">
                        {POSITION_LABELS[pos]}
                      </div>
                      <div className="space-y-1">
                        {pp.map(p => {
                          const s = p.tournamentStat;
                          return (
                            <div key={p.id} className="flex items-center gap-3 py-1.5 px-3 rounded-lg hover:bg-white/5 transition-colors">
                              <span className="text-[11px] text-slate-600 w-5 text-right font-mono">{p.number}</span>
                              <span className="text-sm font-semibold text-slate-200 flex-1 truncate">{p.name}</span>
                              {s && s.matches > 0 ? (
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[10px] font-mono text-brand-gold w-4 text-right" title="Goals">
                                    {s.goals > 0 ? s.goals : "·"}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-300 w-4 text-right" title="Assists">
                                    {s.assists > 0 ? s.assists : "·"}
                                  </span>
                                  <span className="text-[10px] font-mono text-amber-400 w-7 text-right" title="Rating">
                                    {s.rating > 0 ? s.rating.toFixed(1) : "—"}
                                  </span>
                                </div>
                              ) : p.club ? (
                                <span className="text-[10px] text-slate-700 truncate max-w-[90px]">{p.club}</span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Deep stats for top players (shooting, passing, defensive) */}
        {withStats.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Shield size={13} className="text-slate-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Squad Stats Breakdown</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Shooting */}
              <div className="rounded-2xl bg-brand-card border border-brand-border p-4">
                <div className="text-[10px] font-bold text-brand-gold uppercase tracking-widest mb-3">Shooting</div>
                <div className="space-y-2">
                  {[...withStats]
                    .filter(p => (p.tournamentStat?.shotsTotal ?? 0) > 0)
                    .sort((a, b) => (b.tournamentStat?.shotsTotal ?? 0) - (a.tournamentStat?.shotsTotal ?? 0))
                    .slice(0, 5)
                    .map(p => (
                      <div key={p.id}>
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="text-[10px] text-slate-400 truncate max-w-[120px]">{p.name}</span>
                          <span className="text-[10px] font-mono text-slate-500 shrink-0 ml-2">
                            {p.tournamentStat?.shotsOnTarget ?? 0}/{p.tournamentStat?.shotsTotal ?? 0}
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-brand-border">
                          <div
                            className="h-1 rounded-full bg-brand-gold"
                            style={{ width: `${Math.min(((p.tournamentStat?.shotsTotal ?? 0) / Math.max(1, ...withStats.map(x => x.tournamentStat?.shotsTotal ?? 0))) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  {withStats.filter(p => (p.tournamentStat?.shotsTotal ?? 0) > 0).length === 0 && (
                    <p className="text-[10px] text-slate-700">No shot data</p>
                  )}
                </div>
              </div>

              {/* Passing */}
              <div className="rounded-2xl bg-brand-card border border-brand-border p-4">
                <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-3">Key Passes</div>
                <div className="space-y-2">
                  {[...withStats]
                    .filter(p => (p.tournamentStat?.passesKey ?? 0) > 0)
                    .sort((a, b) => (b.tournamentStat?.passesKey ?? 0) - (a.tournamentStat?.passesKey ?? 0))
                    .slice(0, 5)
                    .map(p => (
                      <div key={p.id}>
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="text-[10px] text-slate-400 truncate max-w-[120px]">{p.name}</span>
                          <span className="text-[10px] font-mono text-slate-500 shrink-0 ml-2">
                            {p.tournamentStat?.passesKey ?? 0}
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-brand-border">
                          <div
                            className="h-1 rounded-full bg-slate-400"
                            style={{ width: `${Math.min(((p.tournamentStat?.passesKey ?? 0) / Math.max(1, ...withStats.map(x => x.tournamentStat?.passesKey ?? 0))) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  {withStats.filter(p => (p.tournamentStat?.passesKey ?? 0) > 0).length === 0 && (
                    <p className="text-[10px] text-slate-700">No passing data</p>
                  )}
                </div>
              </div>

              {/* Defensive */}
              <div className="rounded-2xl bg-brand-card border border-brand-border p-4">
                <div className="text-[10px] font-bold text-brand-green uppercase tracking-widest mb-3">Tackles + Interceptions</div>
                <div className="space-y-2">
                  {[...withStats]
                    .filter(p => ((p.tournamentStat?.tacklesTotal ?? 0) + (p.tournamentStat?.interceptions ?? 0)) > 0)
                    .sort((a, b) =>
                      ((b.tournamentStat?.tacklesTotal ?? 0) + (b.tournamentStat?.interceptions ?? 0)) -
                      ((a.tournamentStat?.tacklesTotal ?? 0) + (a.tournamentStat?.interceptions ?? 0))
                    )
                    .slice(0, 5)
                    .map(p => {
                      const defTotal = (p.tournamentStat?.tacklesTotal ?? 0) + (p.tournamentStat?.interceptions ?? 0);
                      const maxDef = Math.max(1, ...withStats.map(x => (x.tournamentStat?.tacklesTotal ?? 0) + (x.tournamentStat?.interceptions ?? 0)));
                      return (
                        <div key={p.id}>
                          <div className="flex justify-between items-center mb-0.5">
                            <span className="text-[10px] text-slate-400 truncate max-w-[120px]">{p.name}</span>
                            <span className="text-[10px] font-mono text-slate-500 shrink-0 ml-2">
                              {p.tournamentStat?.tacklesTotal ?? 0}T {p.tournamentStat?.interceptions ?? 0}I
                            </span>
                          </div>
                          <div className="h-1 rounded-full bg-brand-border">
                            <div
                              className="h-1 rounded-full bg-brand-green"
                              style={{ width: `${Math.min((defTotal / maxDef) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  {withStats.filter(p => ((p.tournamentStat?.tacklesTotal ?? 0) + (p.tournamentStat?.interceptions ?? 0)) > 0).length === 0 && (
                    <p className="text-[10px] text-slate-700">No defensive data</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-16 border-t border-brand-border py-8 text-center text-xs text-slate-600">
        studio0x.io · footy26 stats engine · Data via api-football.com
      </footer>
    </div>
  );
}
