export const dynamic = "force-dynamic";

import Link from "next/link";
import { Trophy, Music2, Wifi, CalendarDays, ArrowLeft, Users, ChevronRight } from "lucide-react";
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

interface Player {
  id: string;
  number: number;
  name: string;
  position: string;
}

const POSITION_ORDER = ["GK", "DEF", "MID", "FWD"];
const POSITION_LABELS: Record<string, string> = {
  GK: "Goalkeeper",
  DEF: "Defenders",
  MID: "Midfielders",
  FWD: "Forwards",
};

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
          <p className="text-slate-400 font-semibold">Team not found in the 2026 World Cup schedule.</p>
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

  // Load players from DB
  let players: Player[] = [];
  try {
    const dbTeam = await prisma.team.findFirst({
      where: { code: TLA },
      include: { homePlayers: true },
    });
    if (dbTeam?.homePlayers) {
      players = (dbTeam.homePlayers as Player[]).sort((a, b) => {
        const pi = POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position);
        return pi !== 0 ? pi : a.number - b.number;
      });
    }
  } catch {
    // DB unavailable — squad shown as empty
  }

  // Split matches
  const liveMatches     = teamMatches.filter(m => m.status === "LIVE" || m.status === "HT");
  const upcomingMatches = teamMatches.filter(m => m.status === "NS");
  const pastMatches     = teamMatches.filter(m => m.status === "FT").reverse();

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-brand-border bg-brand-dark/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Trophy size={20} className="text-brand-gold" />
            <Link href="/" className="font-bold text-white tracking-tight hover:text-brand-gold transition-colors">Studio0x</Link>
            <span className="text-brand-border">·</span>
            <span className="text-sm text-slate-400">World Cup 2026</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/schedule" className="flex items-center gap-1.5 text-xs font-semibold text-brand-gold hover:text-amber-300 transition-colors">
              <CalendarDays size={13} />Schedule
            </Link>
            <Link href="/anthems" className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
              <Music2 size={13} />Anthems
            </Link>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Wifi size={12} className="text-brand-green" />
              <span className="hidden sm:inline">Live data feed active</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
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
              <div className="flex items-center gap-1 mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-600">Record</div>
              <div className="grid grid-cols-7 gap-2 text-center">
                {[
                  { label: "P", value: ftMatches.length, color: "text-slate-300" },
                  { label: "W", value: w,   color: "text-brand-green" },
                  { label: "D", value: d,   color: "text-amber-400" },
                  { label: "L", value: l,   color: "text-red-400" },
                  { label: "GF", value: gf, color: "text-slate-300" },
                  { label: "GA", value: ga, color: "text-slate-300" },
                  { label: "Pts", value: pts, color: "text-white" },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div className={`text-2xl font-black tabular-nums ${color}`}>{value}</div>
                    <div className="text-[10px] text-slate-600 uppercase tracking-wider mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

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

          {/* Squad */}
          <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
            <div className="px-4 py-3 border-b border-brand-border flex items-center gap-2">
              <Users size={13} className="text-slate-500" />
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Squad</span>
            </div>
            {players.length === 0 ? (
              <div className="px-4 py-10 text-center text-slate-600 text-sm">
                <Users size={32} className="mx-auto mb-3 opacity-30" />
                <p>Squad data not loaded for this team.</p>
                <p className="text-xs mt-1 text-slate-700">Only seeded squads are available in the MVP.</p>
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
                        {pp.map(p => (
                          <div key={p.id} className="flex items-center gap-3 py-1.5 px-3 rounded-lg hover:bg-white/5 transition-colors">
                            <span className="text-[11px] text-slate-600 w-5 text-right font-mono">{p.number}</span>
                            <span className="text-sm font-semibold text-slate-200">{p.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="mt-16 border-t border-brand-border py-8 text-center text-xs text-slate-600">
        Studio0x.io · World Cup 2026 Stats Engine · Data via api-football.com
      </footer>
    </div>
  );
}
