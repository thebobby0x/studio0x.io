export const dynamic = "force-dynamic";

import Link from "next/link";
import { Trophy, CalendarDays, ArrowLeft, MapPin, Clock, Users } from "lucide-react";
import AppNav from "@/components/ui/AppNav";
import { getFlag } from "@/lib/flags";
import type { ScheduleMatch } from "@/app/api/schedule/route";
import GroupWinnerTickers from "@/components/sentiment/GroupWinnerTickers";
import LiveWinMeter from "@/components/stats/LiveWinMeter";
import StadiumInfoCard from "@/components/venue/StadiumInfoCard";
import MatchDNA from "@/components/stats/MatchDNA";
import type { GoalEvent } from "@/app/api/matches/[id]/goals/route";
import { prisma } from "@/lib/prisma";
import { getVenueInfo } from "@/lib/venues";

async function fetchSchedule(): Promise<ScheduleMatch[]> {
  try {
    const { GET } = await import("@/app/api/schedule/route");
    const res = await GET();
    return res.json() as Promise<ScheduleMatch[]>;
  } catch {
    return [];
  }
}

function statusBadge(m: ScheduleMatch) {
  if (m.status === "LIVE") return <span className="flex items-center gap-1.5 text-sm font-bold text-red-400 bg-red-500/10 px-3 py-1 rounded-full"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />LIVE {m.minute}&apos;</span>;
  if (m.status === "HT")   return <span className="text-sm font-bold text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full">Half Time</span>;
  if (m.status === "FT")   return <span className="text-sm font-bold text-slate-400 bg-slate-700/50 px-3 py-1 rounded-full">Full Time</span>;
  const dt = new Date(m.utcDate);
  return (
    <span suppressHydrationWarning className="text-sm text-slate-400">
      {dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
    </span>
  );
}

interface GroupEntry {
  tla: string;
  name: string;
  p: number; w: number; d: number; l: number;
  gf: number; ga: number; pts: number;
}

function buildGroupTable(matches: ScheduleMatch[], group: string): GroupEntry[] {
  const teams = new Map<string, GroupEntry>();

  const ensure = (tla: string, name: string) => {
    if (!teams.has(tla)) teams.set(tla, { tla, name, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
    return teams.get(tla)!;
  };

  for (const m of matches) {
    if (m.group !== group || m.status !== "FT") continue;
    const h = ensure(m.homeTeam.tla, m.homeTeam.name);
    const a = ensure(m.awayTeam.tla, m.awayTeam.name);
    const hg = m.homeScore ?? 0;
    const ag = m.awayScore ?? 0;
    h.p++; h.gf += hg; h.ga += ag;
    a.p++; a.gf += ag; a.ga += hg;
    if (hg > ag)      { h.w++; h.pts += 3; a.l++; }
    else if (hg < ag) { a.w++; a.pts += 3; h.l++; }
    else              { h.d++; h.pts++; a.d++; a.pts++; }
  }

  // Ensure all teams in group appear even with 0 games
  for (const m of matches) {
    if (m.group !== group) continue;
    ensure(m.homeTeam.tla, m.homeTeam.name);
    ensure(m.awayTeam.tla, m.awayTeam.name);
  }

  return [...teams.values()].sort((a, b) =>
    b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf
  );
}

export default async function MatchDetailPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const allMatches = await fetchSchedule();
  const m = allMatches.find(x => String(x.id) === matchId);

  if (!m) {
    return (
      <div className="min-h-screen bg-brand-dark text-slate-200 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Trophy size={48} className="mx-auto opacity-20" />
          <p className="text-slate-400 font-semibold">Match not found.</p>
          <Link href="/schedule" className="text-brand-gold hover:text-amber-300 text-sm">← Back to schedule</Link>
        </div>
      </div>
    );
  }

  const isLive = m.status === "LIVE" || m.status === "HT";
  const isDone = m.status === "FT";
  const groupLabel = m.group ? `Group ${m.group}` : m.stageLabel;

  // Group context
  const groupMatches = m.group
    ? allMatches.filter(x => x.group === m.group && x.id !== m.id)
    : [];
  const table = m.group ? buildGroupTable(allMatches, m.group) : [];

  // Venue info from static lookup (football-data free tier has no venue data)
  const venueFromDB = await prisma.match.findFirst({ where: { fixture: m.id }, select: { venue: true } }).catch(() => null);
  const venueInfo = venueFromDB?.venue ? getVenueInfo(venueFromDB.venue) : null;

  // Other fixtures involving either team
  const homeOtherMatches = allMatches
    .filter(x => x.id !== m.id && (x.homeTeam.tla === m.homeTeam.tla || x.awayTeam.tla === m.homeTeam.tla))
    .slice(0, 3);
  const awayOtherMatches = allMatches
    .filter(x => x.id !== m.id && (x.homeTeam.tla === m.awayTeam.tla || x.awayTeam.tla === m.awayTeam.tla))
    .slice(0, 3);

  const localDt = new Date(m.utcDate);

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      <AppNav />

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Back */}
        <Link href="/schedule" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={14} />
          Back to schedule
        </Link>

        {/* Match hero card */}
        <div className={`rounded-3xl bg-brand-card border overflow-hidden ${
          isLive ? "border-brand-green/40 shadow-xl shadow-brand-green/5" :
          isDone ? "border-brand-border/50" :
          "border-brand-border"
        }`}>
          {/* Header gradient */}
          <div className="bg-gradient-to-r from-brand-green/10 via-transparent to-amber-500/10 px-6 py-4 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">{groupLabel}</span>
            {statusBadge(m)}
          </div>

          {/* Teams and score */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-8 py-10">
            {/* Home */}
            <Link href={`/team/${m.homeTeam.tla}`} className="text-center group block">
              <div className="text-6xl mb-3 select-none">{getFlag(m.homeTeam.tla)}</div>
              <div className="text-xl font-black text-white group-hover:text-brand-gold transition-colors leading-tight">
                {m.homeTeam.name}
              </div>
              <div className="text-xs text-slate-500 uppercase tracking-widest mt-1">{m.homeTeam.tla}</div>
              <div className="mt-3 text-xs text-brand-gold opacity-0 group-hover:opacity-100 transition-opacity">View team →</div>
            </Link>

            {/* Score */}
            <div className="text-center min-w-[120px]">
              {(isLive || isDone) ? (
                <div className={`text-7xl font-black tabular-nums tracking-tighter ${isDone ? "text-slate-400" : "text-white"}`}>
                  {m.homeScore ?? 0}
                  <span className="text-brand-border mx-3">–</span>
                  {m.awayScore ?? 0}
                </div>
              ) : (
                <div className="text-5xl font-black text-brand-border tracking-widest">vs</div>
              )}
              {isLive && (
                <div className="flex items-center justify-center gap-1.5 mt-3">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm font-semibold text-slate-300">
                    {m.status === "HT" ? "Half Time" : `${m.minute}'`}
                  </span>
                </div>
              )}
            </div>

            {/* Away */}
            <Link href={`/team/${m.awayTeam.tla}`} className="text-center group block">
              <div className="text-6xl mb-3 select-none">{getFlag(m.awayTeam.tla)}</div>
              <div className="text-xl font-black text-white group-hover:text-brand-gold transition-colors leading-tight">
                {m.awayTeam.name}
              </div>
              <div className="text-xs text-slate-500 uppercase tracking-widest mt-1">{m.awayTeam.tla}</div>
              <div className="mt-3 text-xs text-brand-gold opacity-0 group-hover:opacity-100 transition-opacity">View team →</div>
            </Link>
          </div>

          {/* Match metadata */}
          <div className="border-t border-brand-border/50 px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <MapPin size={12} />
              {m.stageLabel} · Matchday {m.matchday}
              {venueInfo && <span className="text-slate-600">· {venueInfo.city} · Cap. {venueInfo.capacity.toLocaleString()}</span>}
            </span>
            <span suppressHydrationWarning className="flex items-center gap-1.5">
              <Clock size={12} />
              {localDt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {localDt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
            {m.group && (
              <Link href={`/schedule?group=${m.group}`} className="flex items-center gap-1.5 text-brand-gold hover:text-amber-300 transition-colors">
                <CalendarDays size={12} />
                Group {m.group} fixtures
              </Link>
            )}
          </div>
        </div>

        {/* Stadium info + live weather */}
        {venueInfo && venueFromDB?.venue && (
          <StadiumInfoCard venueName={venueFromDB.venue} venueInfo={venueInfo} />
        )}

        {/* Match DNA™ + Clutch Index™ — only for played/live matches */}
        {(isDone || isLive) && (
          <MatchDNAPanel fixtureId={m.id} homeTeamName={m.homeTeam.name} awayTeamName={m.awayTeam.name} homeTeamCode={m.homeTeam.tla} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Group standings */}
          {table.length > 0 && (
            <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
              <div className="px-4 py-3 border-b border-brand-border text-xs font-semibold uppercase tracking-widest text-slate-500">
                Group {m.group} Standings
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-slate-600 uppercase tracking-wider">
                    <th className="text-left px-4 py-2">Team</th>
                    <th className="px-2 py-2 text-center">P</th>
                    <th className="px-2 py-2 text-center">W</th>
                    <th className="px-2 py-2 text-center">D</th>
                    <th className="px-2 py-2 text-center">L</th>
                    <th className="px-2 py-2 text-center">GD</th>
                    <th className="px-4 py-2 text-center font-bold text-slate-400">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((row, i) => {
                    const isHighlighted = row.tla === m.homeTeam.tla || row.tla === m.awayTeam.tla;
                    return (
                      <tr key={row.tla} className={`border-t border-brand-border/50 ${isHighlighted ? "bg-brand-green/5" : ""}`}>
                        <td className="px-4 py-2.5">
                          <Link href={`/team/${row.tla}`} className="flex items-center gap-2 hover:text-brand-gold transition-colors">
                            <span className="text-slate-600 w-3">{i + 1}</span>
                            <span className="text-base">{getFlag(row.tla)}</span>
                            <span className={`font-semibold ${isHighlighted ? "text-white" : "text-slate-300"}`}>{row.name}</span>
                          </Link>
                        </td>
                        <td className="px-2 py-2.5 text-center text-slate-500">{row.p}</td>
                        <td className="px-2 py-2.5 text-center text-slate-400">{row.w}</td>
                        <td className="px-2 py-2.5 text-center text-slate-500">{row.d}</td>
                        <td className="px-2 py-2.5 text-center text-slate-500">{row.l}</td>
                        <td className="px-2 py-2.5 text-center text-slate-500">{row.gf - row.ga > 0 ? "+" : ""}{row.gf - row.ga}</td>
                        <td className="px-4 py-2.5 text-center font-black text-white">{row.pts}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Group fixtures */}
          {groupMatches.length > 0 && (
            <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
              <div className="px-4 py-3 border-b border-brand-border text-xs font-semibold uppercase tracking-widest text-slate-500">
                Other Group {m.group} Fixtures
              </div>
              <div className="divide-y divide-brand-border/50">
                {groupMatches.map(gm => (
                  <Link key={gm.id} href={`/schedule/${gm.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                      <span>{getFlag(gm.homeTeam.tla)}</span>
                      <span>{gm.homeTeam.tla}</span>
                    </div>
                    <div className="text-xs font-bold tabular-nums text-center min-w-[60px]">
                      {gm.status === "FT" || gm.status === "LIVE" || gm.status === "HT"
                        ? <span className={gm.status === "LIVE" || gm.status === "HT" ? "text-brand-green" : "text-slate-400"}>{gm.homeScore ?? 0} – {gm.awayScore ?? 0}</span>
                        : <span suppressHydrationWarning className="text-slate-600">{new Date(gm.utcDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                      }
                    </div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 flex-row-reverse">
                      <span>{getFlag(gm.awayTeam.tla)}</span>
                      <span>{gm.awayTeam.tla}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Live win probability meter — DB match needed for matchId */}
        <MatchWinMeter fixtureId={m.id} />

        {/* Group winner prediction markets */}
        {m.group && (
          <GroupWinnerTickers
            group={m.group}
            highlightTeams={[m.homeTeam.name, m.awayTeam.name]}
          />
        )}

        {/* Starting lineups from DB */}
        <MatchLineupCard fixtureId={m.id} homeName={m.homeTeam.name} awayName={m.awayTeam.name} />

        {/* Team fixtures */}
        {(homeOtherMatches.length > 0 || awayOtherMatches.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              { team: m.homeTeam, fixtures: homeOtherMatches },
              { team: m.awayTeam, fixtures: awayOtherMatches },
            ].map(({ team, fixtures }) => (
              <div key={team.tla} className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
                <Link href={`/team/${team.tla}`} className="flex items-center gap-3 px-4 py-3 border-b border-brand-border hover:bg-white/5 transition-colors group">
                  <span className="text-2xl">{getFlag(team.tla)}</span>
                  <span className="text-sm font-bold text-white group-hover:text-brand-gold transition-colors">{team.name}</span>
                  <span className="ml-auto text-[10px] text-brand-gold opacity-0 group-hover:opacity-100 transition-opacity">View →</span>
                </Link>
                <div className="divide-y divide-brand-border/50">
                  {fixtures.map(fx => {
                    const isHome = fx.homeTeam.tla === team.tla;
                    const opp = isHome ? fx.awayTeam : fx.homeTeam;
                    return (
                      <Link key={fx.id} href={`/schedule/${fx.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span>{getFlag(opp.tla)}</span>
                          <span className="font-semibold text-slate-300">{opp.name}</span>
                          <span className="text-slate-600">{isHome ? "H" : "A"}</span>
                        </div>
                        <div className="text-xs font-bold tabular-nums">
                          {fx.status === "FT" ? (
                            <span className="text-slate-400">{fx.homeScore} – {fx.awayScore}</span>
                          ) : fx.status === "LIVE" || fx.status === "HT" ? (
                            <span className="text-brand-green">{fx.homeScore} – {fx.awayScore}</span>
                          ) : (
                            <span suppressHydrationWarning className="text-slate-600">{new Date(fx.utcDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTA to dashboard */}
        <div className="rounded-2xl bg-gradient-to-r from-brand-green/10 to-amber-500/10 border border-brand-green/20 p-6 text-center">
          <p className="text-slate-400 text-sm mb-3">Live scores, group winner odds & prediction markets</p>
          <Link href="/" className="inline-flex items-center gap-2 bg-brand-gold text-brand-dark font-bold text-sm px-5 py-2.5 rounded-full hover:bg-amber-300 transition-colors">
            <Trophy size={14} />
            Open Dashboard
          </Link>
        </div>
      </main>

      <footer className="mt-16 border-t border-brand-border py-8 text-center text-xs text-slate-600">
        studio0x.io · FIFA World Cup 2026 · Data via api-football.com
      </footer>
    </div>
  );
}

async function MatchDNAPanel({
  fixtureId, homeTeamName, awayTeamName, homeTeamCode,
}: {
  fixtureId: number;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamCode: string;
}) {
  try {
    const dbMatch = await prisma.match.findFirst({ where: { fixture: fixtureId }, select: { id: true } });
    if (!dbMatch) return null;

    const apiKey = process.env.API_FOOTBALL_KEY;
    if (!apiKey) return null;

    const res = await fetch(
      `https://v3.football.api-sports.io/fixtures/events?fixture=${fixtureId}`,
      { headers: { "x-apisports-key": apiKey }, next: { revalidate: 60 } }
    );
    if (!res.ok) return null;

    const json = await res.json();
    const goals: GoalEvent[] = (json.response ?? [])
      .filter((e: { type: string }) => e.type === "Goal")
      .map((e: { time: { elapsed: number }; team: { name: string }; player: { name: string }; assist: { name: string | null }; detail: string }) => ({
        minute: e.time.elapsed,
        team: e.team.name,
        scorer: e.player.name,
        assist: e.assist?.name ?? null,
        isOwnGoal: e.detail === "Own Goal",
        isPenalty: e.detail === "Penalty",
      }));

    if (goals.length === 0) return null;

    return (
      <MatchDNA
        goals={goals}
        homeTeamName={homeTeamName}
        awayTeamName={awayTeamName}
        homeTeamCode={homeTeamCode}
      />
    );
  } catch {
    return null;
  }
}

async function MatchWinMeter({ fixtureId }: { fixtureId: number }) {
  try {
    const dbMatch = await prisma.match.findFirst({ where: { fixture: fixtureId }, select: { id: true } });
    if (!dbMatch) return null;
    return <LiveWinMeter matchId={dbMatch.id} />;
  } catch {
    return null;
  }
}

const POSITION_ORDER = ["GK", "DEF", "MID", "FWD"];
const POSITION_LABELS: Record<string, string> = { GK: "Goalkeeper", DEF: "Defenders", MID: "Midfielders", FWD: "Forwards" };

async function MatchLineupCard({ fixtureId, homeName, awayName }: { fixtureId: number; homeName: string; awayName: string }) {
  try {
    const dbMatch = await prisma.match.findFirst({
      where: { fixture: fixtureId },
      include: {
        homeTeam: { include: { homePlayers: true } },
        awayTeam: { include: { homePlayers: true } },
      },
    });
    if (!dbMatch) return null;

    const sides = [
      { team: dbMatch.homeTeam, name: homeName },
      { team: dbMatch.awayTeam, name: awayName },
    ] as const;

    const hasPlayers = sides.some(s => (s.team as { homePlayers?: unknown[] }).homePlayers && (s.team as { homePlayers: unknown[] }).homePlayers.length > 0);
    if (!hasPlayers) return null;

    return (
      <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-brand-border">
          <Users size={13} className="text-slate-500" />
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Starting Lineups</span>
          <span className="ml-auto text-[10px] text-slate-600">Subs coming with paid API</span>
        </div>
        <div className="grid grid-cols-2 divide-x divide-brand-border">
          {sides.map(({ team, name }) => {
            const players = ((team as { homePlayers: Array<{ id: string; number: number; name: string; position: string }> }).homePlayers ?? [])
              .sort((a, b) => {
                const pi = POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position);
                return pi !== 0 ? pi : a.number - b.number;
              });
            return (
              <div key={team.id} className="p-3">
                <Link href={`/team/${team.code}`} className="text-xs font-bold text-white mb-3 block hover:text-brand-gold transition-colors">
                  {name}
                </Link>
                {POSITION_ORDER.map(pos => {
                  const pp = players.filter(p => p.position === pos);
                  if (!pp.length) return null;
                  return (
                    <div key={pos} className="mb-3">
                      <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">{POSITION_LABELS[pos]}</div>
                      {pp.map(p => (
                        <div key={p.id} className="flex items-center gap-2 py-1">
                          <span className="text-[10px] text-slate-600 w-4 text-right font-mono tabular-nums">{p.number}</span>
                          <span className="text-xs text-slate-300">{p.name}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  } catch {
    return null;
  }
}
