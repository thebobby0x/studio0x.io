export const dynamic = "force-dynamic";

import Link from "next/link";
import { Trophy, CalendarDays, ArrowLeft, MapPin, Clock } from "lucide-react";
import AppNav from "@/components/ui/AppNav";
import { getFlag } from "@/lib/flags";
import type { ScheduleMatch } from "@/app/api/schedule/route";
import { KNOCKOUT_START } from "@/lib/tournament";
import GroupWinnerTickers from "@/components/sentiment/GroupWinnerTickers";
import LiveWinMeter from "@/components/stats/LiveWinMeter";
import StadiumInfoCard from "@/components/venue/StadiumInfoCard";
import HeroWeather from "@/components/venue/HeroWeather";
import UpsetMeter from "@/components/stats/UpsetMeter";
import PressingIntensityIndex from "@/components/stats/PressingIntensityIndex";
import FormMeter from "@/components/stats/FormMeter";
import FatigueFactor from "@/components/stats/FatigueFactor";
import MatchLineups from "@/components/match/MatchLineups";
import MatchPlayerStats from "@/components/match/MatchPlayerStats";
import MatchCommentary from "@/components/match/MatchCommentary";
import MatchPulse from "@/components/match/MatchPulse";
import MatchMarkets from "@/components/match/MatchMarkets";
import ShareButton from "@/components/ui/ShareButton";
import LiveAnthemButtons from "@/components/match/LiveAnthemButtons";
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
    // Group-stage games only — knockout matches carry an inherited `group` from
    // the home team and must never count toward a group table.
    if (m.group !== group || m.status !== "FT" || new Date(m.utcDate) >= KNOCKOUT_START) continue;
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

  // Ensure all teams in group appear even with 0 games (group-stage only)
  for (const m of matches) {
    if (m.group !== group || new Date(m.utcDate) >= KNOCKOUT_START) continue;
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

  // Knockout matches inherit a `group` from the home team, but they are NOT
  // group matches: group standings are final, group-winner markets are settled,
  // and filtering fixtures by that group would sweep in knockout results and
  // drag non-group opponents into the table (wrong info). So: no group
  // furniture on knockout pages — the round label tells the real story.
  const isKnockout = new Date(m.utcDate) >= KNOCKOUT_START;
  const showGroupContext = !!m.group && !isKnockout;
  const groupLabel = showGroupContext ? `Group ${m.group}` : m.stageLabel;

  // Group context (group-stage matches only)
  const groupMatches = showGroupContext
    ? allMatches.filter(x => x.group === m.group && x.id !== m.id && new Date(x.utcDate) < KNOCKOUT_START)
    : [];
  const table = showGroupContext ? buildGroupTable(allMatches, m.group!) : [];

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

  // Fetch anthems for both teams (show anthem buttons on live matches)
  const anthemStreams = await prisma.audioStream.findMany({
    where: { team: { code: { in: [m.homeTeam.tla, m.awayTeam.tla] } } },
    include: { team: true },
  }).catch(() => []);

  const toAnthemTrack = (s: typeof anthemStreams[0]) => s.team ? {
    id: s.id,
    title: s.title,
    audioUrl: s.audioUrl,
    durationSecs: s.durationSecs ?? 180,
    teamName: s.team.name,
    teamCode: s.team.code,
    flagEmoji: s.team.flagEmoji ?? "🏳",
  } : null;

  const homeAnthem = anthemStreams.find(s => s.team?.code === m.homeTeam.tla);
  const awayAnthem = anthemStreams.find(s => s.team?.code === m.awayTeam.tla);

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
          <div className="bg-gradient-to-r from-brand-green/10 via-transparent to-amber-500/10 px-6 py-4 flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">{groupLabel}</span>
            <div className="flex items-center gap-3">
              {statusBadge(m)}
              <ShareButton
                text={
                  isLive ? `LIVE: ${m.homeTeam.name} ${m.homeScore ?? 0}–${m.awayScore ?? 0} ${m.awayTeam.name} (${m.status === "HT" ? "HT" : `${m.minute}'`}) · ${groupLabel} · studio0x.io` :
                  isDone ? `FT: ${m.homeTeam.name} ${m.homeScore ?? 0}–${m.awayScore ?? 0} ${m.awayTeam.name} · ${groupLabel} · studio0x.io` :
                  `${m.homeTeam.name} vs ${m.awayTeam.name} · ${groupLabel} · cup26 · studio0x.io`
                }
                url={`/schedule/${m.id}`}
                title={`${m.homeTeam.name} vs ${m.awayTeam.name}`}
              />
            </div>
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

          {/* Anthem buttons — shown on all matches that have songs */}
          {(homeAnthem || awayAnthem) && (
            <div className="border-t border-brand-border/30 px-6 py-3">
              <LiveAnthemButtons
                homeAnthem={homeAnthem ? toAnthemTrack(homeAnthem) : null}
                awayAnthem={awayAnthem ? toAnthemTrack(awayAnthem) : null}
                homeTeamName={m.homeTeam.name}
                awayTeamName={m.awayTeam.name}
              />
            </div>
          )}

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
              <span className="text-slate-700 text-[10px]">local</span>
            </span>
            {venueInfo && venueFromDB?.venue && (
              <HeroWeather venueName={venueFromDB.venue} />
            )}
            {showGroupContext && (
              <Link href={`/schedule?group=${m.group}`} className="flex items-center gap-1.5 text-brand-gold hover:text-amber-300 transition-colors">
                <CalendarDays size={12} />
                Group {m.group} fixtures
              </Link>
            )}
          </div>
        </div>

        {/* Live prediction market — every match with a real Kalshi market */}
        <MatchMarketsPanel fixtureId={m.id} />

        {/* Stadium info + live weather */}
        {venueInfo && venueFromDB?.venue && (
          <StadiumInfoCard venueName={venueFromDB.venue} venueInfo={venueInfo} />
        )}

        {/* AI Commentary — shown for live and finished matches */}
        {(isLive || isDone) && <CommentaryPanel fixtureId={m.id} />}

        {/* Match DNA™ + Clutch Index™ — live-polling, moves even at 0-0 */}
        {(isDone || isLive) && (
          <MatchDNAPanel fixtureId={m.id} homeTeamName={m.homeTeam.name} awayTeamName={m.awayTeam.name} homeTeamCode={m.homeTeam.tla} awayTeamCode={m.awayTeam.tla} />
        )}

        {/* Upset Factor™ — only for FT matches with Polymarket odds available */}
        {isDone && <UpsetMeterForMatch fixtureId={m.id} />}

        {/* Team form guides — side-by-side under a shared label */}
        <div className="space-y-1.5">
          <div className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-600">Form Guide</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormMeter teamTla={m.homeTeam.tla} teamName={m.homeTeam.name} />
            <FormMeter teamTla={m.awayTeam.tla} teamName={m.awayTeam.name} />
          </div>
        </div>

        {/* Fatigue Factor™ — rest + travel between games (owner 7/9) */}
        <FatigueFactor fixtureId={m.id} />

        {/* Live win probability meter — DB match needed for matchId */}
        <MatchWinMeter fixtureId={m.id} />

        {/* Group winner prediction markets — group stage only (settled once knockouts begin) */}
        {showGroupContext && (
          <GroupWinnerTickers
            group={m.group!}
            highlightTeams={[m.homeTeam.name, m.awayTeam.name]}
          />
        )}

        {/* Group standings + other fixtures — context, not headline, so at bottom */}
        {(table.length > 0 || groupMatches.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
        )}

        {/* Starting lineups + subs via api-football */}
        <MatchLineupsPanel fixtureId={m.id} />

        {/* Per-player match stats — only for played/live matches */}
        {(isDone || isLive) && <MatchPlayerStatsPanel fixtureId={m.id} />}

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
        studio0x.io · cup26 · Data via api-football.com
      </footer>
    </div>
  );
}

async function MatchDNAPanel({
  fixtureId, homeTeamName, awayTeamName, homeTeamCode, awayTeamCode,
}: {
  fixtureId: number;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamCode: string;
  awayTeamCode: string;
}) {
  try {
    const dbMatch = await prisma.match.findFirst({ where: { fixture: fixtureId }, select: { id: true } });
    if (!dbMatch) return null;

    // Client component polls goals + live stats so the metric panels keep
    // moving through a live match (possession/shots drive them even at 0-0).
    return (
      <div className="space-y-4">
        <MatchPulse
          matchId={dbMatch.id}
          homeTeamName={homeTeamName}
          awayTeamName={awayTeamName}
          homeTeamCode={homeTeamCode}
          awayTeamCode={awayTeamCode}
        />
        <PressingIntensityIndex
          matchId={dbMatch.id}
          homeTeamName={homeTeamName}
          awayTeamName={awayTeamName}
        />
      </div>
    );
  } catch {
    return null;
  }
}

async function MatchMarketsPanel({ fixtureId }: { fixtureId: number }) {
  try {
    const dbMatch = await prisma.match.findFirst({ where: { fixture: fixtureId }, select: { id: true } });
    if (!dbMatch) return null;
    return <MatchMarkets matchId={dbMatch.id} />;
  } catch {
    return null;
  }
}

async function UpsetMeterForMatch({ fixtureId }: { fixtureId: number }) {
  try {
    const dbMatch = await prisma.match.findFirst({ where: { fixture: fixtureId }, select: { id: true } });
    if (!dbMatch) return null;
    return <UpsetMeter matchId={dbMatch.id} />;
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

async function MatchLineupsPanel({ fixtureId }: { fixtureId: number }) {
  try {
    const dbMatch = await prisma.match.findFirst({ where: { fixture: fixtureId }, select: { id: true } });
    if (!dbMatch) return null;
    return <MatchLineups matchId={dbMatch.id} />;
  } catch {
    return null;
  }
}

async function MatchPlayerStatsPanel({ fixtureId }: { fixtureId: number }) {
  try {
    const dbMatch = await prisma.match.findFirst({ where: { fixture: fixtureId }, select: { id: true } });
    if (!dbMatch) return null;
    return <MatchPlayerStats matchId={dbMatch.id} />;
  } catch {
    return null;
  }
}

async function CommentaryPanel({ fixtureId }: { fixtureId: number }) {
  try {
    const dbMatch = await prisma.match.findFirst({ where: { fixture: fixtureId }, select: { id: true } });
    if (!dbMatch) return null;
    return <MatchCommentary matchId={dbMatch.id} />;
  } catch {
    return null;
  }
}
