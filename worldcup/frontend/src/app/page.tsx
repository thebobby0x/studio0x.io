export const dynamic = "force-dynamic";

import { Suspense } from "react";
import Link from "next/link";
import { Trophy, CalendarDays, ChevronRight, LayoutGrid, List } from "lucide-react";
import LiveMatchCard from "@/components/match/LiveMatchCard";
import AppNav from "@/components/ui/AppNav";
import GroupWinnerTickers from "@/components/sentiment/GroupWinnerTickers";
import LiveWinMeter from "@/components/stats/LiveWinMeter";
import TournamentOddsPanel from "@/components/stats/TournamentOddsPanel";
import StadiumInfoCard from "@/components/venue/StadiumInfoCard";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import TournamentStories from "@/components/news/TournamentStories";
import type { Match } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { getFlag } from "@/lib/flags";
import FlagImg from "@/components/ui/FlagImg";
import { venueCity, getVenueInfo } from "@/lib/venues";
import type { ScheduleMatch } from "@/app/api/schedule/route";
import LiveRefresh from "@/components/ui/LiveRefresh";

async function getInitialData() {
  try {
    const [dbMatches, scheduleRes] = await Promise.all([
      prisma.match.findMany({
        include: { homeTeam: true, awayTeam: true },
        orderBy: { date: "asc" },
      }),
      import("@/app/api/schedule/route").then((m) => m.GET()).catch(() => null),
    ]);

    let liveByFixture = new Map<number, ScheduleMatch>();
    if (scheduleRes) {
      const live = (await scheduleRes.json()) as ScheduleMatch[];
      liveByFixture = new Map(live.map((m) => [m.id, m]));
    }

    const matches = dbMatches.map((m) => {
      const live = liveByFixture.get(m.fixture);
      if (!live) return m;
      return {
        ...m,
        status: live.status,
        homeScore: live.homeScore ?? m.homeScore,
        awayScore: live.awayScore ?? m.awayScore,
        elapsed: live.minute ?? m.elapsed,
      };
    });

    return { matches: matches as unknown as Match[] };
  } catch {
    return { matches: [] };
  }
}

async function getTodaySchedule(): Promise<ScheduleMatch[]> {
  try {
    const { GET } = await import("@/app/api/schedule/route");
    const res = await GET();
    const all = (await res.json()) as ScheduleMatch[];
    const today = new Date().toISOString().slice(0, 10);
    return all.filter((m) => m.utcDate.startsWith(today)).slice(0, 8);
  } catch {
    return [];
  }
}

function matchStatusLabel(status: string, elapsed: number) {
  if (status === "LIVE") return `${elapsed}'`;
  if (status === "HT") return "HT";
  if (status === "FT") return "FT";
  return "NS";
}

// ── List-view row ──────────────────────────────────────────────────────────────

function MatchListRow({ m, isFeatured }: { m: Match; isFeatured: boolean }) {
  const isLive = m.status === "LIVE" || m.status === "HT";
  return (
    <Link
      href={`/schedule/${m.fixture}`}
      className={`flex items-center gap-3 px-4 py-3 transition-colors rounded-xl group ${
        isFeatured ? "bg-brand-green/5 border border-brand-green/20" : "hover:bg-white/3 border border-transparent"
      }`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <FlagImg tla={m.homeTeam.code} size={24} className="shrink-0" />
        <span className="text-sm font-semibold text-slate-300 truncate group-hover:text-white transition-colors">
          {m.homeTeam.name}
        </span>
        <span
          className={`font-black text-sm tabular-nums shrink-0 ${
            isLive ? "text-white" : m.status === "FT" ? "text-slate-400" : "text-slate-600"
          }`}
        >
          {m.status !== "NS" ? `${m.homeScore}–${m.awayScore}` : "vs"}
        </span>
        <span className="text-sm font-semibold text-slate-300 truncate group-hover:text-white transition-colors">
          {m.awayTeam.name}
        </span>
        <FlagImg tla={m.awayTeam.code} size={24} className="shrink-0" />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isLive && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            isLive ? "bg-red-500/20 text-red-400" : "bg-slate-800 text-slate-500"
          }`}
        >
          {matchStatusLabel(m.status, m.elapsed)}
        </span>
        {isFeatured && (
          <span
            className={`text-[10px] font-semibold ${
              isLive ? "text-red-400" : m.status === "FT" ? "text-brand-green" : "text-amber-400"
            }`}
          >
            {isLive ? "Live" : m.status === "FT" ? "Latest" : "Next"}
          </span>
        )}
      </div>
    </Link>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  let params: { view?: string } = {};
  let matches: Match[] = [];
  let todayMatches: ScheduleMatch[] = [];

  try {
    [params, [{ matches }, todayMatches]] = await Promise.all([
      searchParams,
      Promise.all([getInitialData(), getTodaySchedule()]),
    ]);
  } catch (e) {
    console.error("[DashboardPage] top-level fetch failed:", e);
    params = {};
  }

  const viewMode = params?.view === "list" ? "list" : "tile";

  const liveMatches = matches.filter((m) => ["LIVE", "HT"].includes(m.status));
  const ftMatches = matches.filter((m) => m.status === "FT");
  const nsMatches = matches.filter((m) => m.status === "NS");

  const featuredMatch =
    liveMatches.length > 0
      ? liveMatches.reduce((a, b) => (new Date(a.date) > new Date(b.date) ? a : b))
      : ftMatches.length > 0
      ? ftMatches[ftMatches.length - 1]
      : (nsMatches[0] ?? matches[matches.length - 1]);

  const isMatchLiveNow =
    featuredMatch && (featuredMatch.status === "LIVE" || featuredMatch.status === "HT");

  const realVenue =
    featuredMatch?.venue && featuredMatch.venue !== "World Cup Stadium"
      ? featuredMatch.venue
      : null;
  const venueInfo = realVenue ? getVenueInfo(realVenue) : null;

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      <AppNav />
      <LiveRefresh isLive={!!isMatchLiveNow} />

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Page header + view toggle */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">
              FIFA World Cup <span className="text-brand-gold">2026</span>
            </h1>
            <p className="text-slate-500 mt-1 text-sm">
              Live scores · group winner odds · prediction markets
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* View toggle */}
            <div className="flex items-center bg-brand-card border border-brand-border rounded-xl overflow-hidden">
              <Link
                href="/?view=tile"
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors ${
                  viewMode === "tile"
                    ? "bg-white text-brand-dark"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <LayoutGrid size={12} />
                <span className="hidden sm:inline">Tiles</span>
              </Link>
              <Link
                href="/?view=list"
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors ${
                  viewMode === "list"
                    ? "bg-white text-brand-dark"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <List size={12} />
                <span className="hidden sm:inline">List</span>
              </Link>
            </div>

            <Link
              href="/schedule"
              className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-brand-border rounded-xl px-3 py-2 hover:border-slate-500 transition-all"
            >
              <CalendarDays size={12} />
              Schedule
              <ChevronRight size={11} />
            </Link>
          </div>
        </div>

        {/* Today's match strip */}
        {todayMatches.length > 0 && (
          <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Today at the World Cup
              </span>
              <Link
                href="/schedule"
                className="text-[10px] text-brand-gold hover:text-amber-300 transition-colors"
              >
                View all →
              </Link>
            </div>
            <div className="flex overflow-x-auto divide-x divide-brand-border/50">
              {todayMatches.map((m) => {
                const isLive = m.status === "LIVE" || m.status === "HT";
                const isDone = m.status === "FT";
                return (
                  <Link
                    key={m.id}
                    href={`/schedule/${m.id}`}
                    className="flex-shrink-0 flex flex-col items-center gap-1.5 px-5 py-4 hover:bg-white/5 transition-colors group min-w-[120px]"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span>{getFlag(m.homeTeam.tla)}</span>
                      <span
                        className={`font-black text-sm tabular-nums ${
                          isLive ? "text-white" : isDone ? "text-slate-400" : "text-slate-600"
                        }`}
                      >
                        {isLive || isDone ? `${m.homeScore ?? 0}–${m.awayScore ?? 0}` : "vs"}
                      </span>
                      <span>{getFlag(m.awayTeam.tla)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isLive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      )}
                      <span
                        className={`text-[10px] font-semibold ${
                          isLive ? "text-red-400" : isDone ? "text-slate-600" : "text-slate-500"
                        }`}
                      >
                        {isLive
                          ? m.status === "HT"
                            ? "HT"
                            : `${m.minute}'`
                          : isDone
                          ? "FT"
                          : "NS"}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* ── LIST VIEW ───────────────────────────────────────────────────── */}
        {viewMode === "list" && (
          <div className="space-y-4">
            {/* Live match card — same as tile view */}
            {featuredMatch && (
              <>
                {isMatchLiveNow && (
                  <div className="flex items-center gap-3 -mb-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <span className="text-sm font-black text-white uppercase tracking-wider">
                      Match In Progress
                    </span>
                    <div className="flex-1 h-px bg-red-900/40" />
                    <span className="text-xs text-red-400 font-semibold">
                      {featuredMatch.elapsed}&apos; played
                    </span>
                  </div>
                )}
                <Suspense
                  fallback={
                    <div
                      className={`rounded-2xl bg-brand-card border border-brand-border animate-pulse ${
                        isMatchLiveNow ? "h-96" : "h-80"
                      }`}
                    />
                  }
                >
                  <LiveMatchCard matchId={featuredMatch.id} hero={isMatchLiveNow ?? false} />
                </Suspense>
              </>
            )}

            {/* All matches list */}
            <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
              <div className="px-4 py-3 border-b border-brand-border text-xs font-semibold uppercase tracking-widest text-slate-500">
                All Matches
              </div>
              {matches.length === 0 ? (
                <div className="px-4 py-8 text-center text-slate-600 text-sm">
                  No matches loaded — run the seed endpoint.
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {matches.map((m) => (
                    <MatchListRow
                      key={m.id}
                      m={m}
                      isFeatured={featuredMatch?.id === m.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TILE VIEW ───────────────────────────────────────────────────── */}
        {viewMode === "tile" && (
          <>
            {/* Live match label */}
            {isMatchLiveNow && (
              <div className="flex items-center gap-3 -mb-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                <span className="text-sm font-black text-white uppercase tracking-wider">
                  Match In Progress
                </span>
                <div className="flex-1 h-px bg-red-900/40" />
                <span className="text-xs text-red-400 font-semibold">
                  {featuredMatch!.elapsed}&apos; played
                </span>
              </div>
            )}

            {featuredMatch ? (
              <div className="space-y-3">
                {!isMatchLiveNow && (
                  <div className="flex items-center gap-3">
                    {(() => {
                      const city = realVenue
                        ? venueCity(realVenue, featuredMatch.city)
                        : null;
                      const venuePart = realVenue
                        ? ` · ${realVenue}${city ? `, ${city}` : ""}`
                        : "";
                      const groupPart = `Group ${featuredMatch.homeTeam.groupStage}`;
                      if (["LIVE", "HT"].includes(featuredMatch.status))
                        return (
                          <>
                            <span className="w-2 h-2 rounded-full bg-red-500 live-dot" />
                            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                              Live · {groupPart}
                              {venuePart}
                            </span>
                          </>
                        );
                      if (featuredMatch.status === "FT")
                        return (
                          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                            Most Recent · {groupPart}
                            {venuePart}
                          </span>
                        );
                      return (
                        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                          Next Match · {groupPart}
                          {venuePart}
                        </span>
                      );
                    })()}
                  </div>
                )}

                {/* Live match card (always full-size) */}
                <Suspense
                  fallback={
                    <div
                      className={`rounded-2xl bg-brand-card border border-brand-border animate-pulse ${
                        isMatchLiveNow ? "h-96" : "h-80"
                      }`}
                    />
                  }
                >
                  <LiveMatchCard matchId={featuredMatch.id} hero={isMatchLiveNow ?? false} />
                </Suspense>

                {/* Sections below the hero */}
                {realVenue && venueInfo && (
                  <StadiumInfoCard venueName={realVenue} venueInfo={venueInfo} />
                )}

                <LiveWinMeter matchId={featuredMatch.id} />

                {featuredMatch.homeTeam.groupStage && (
                  <GroupWinnerTickers
                    group={featuredMatch.homeTeam.groupStage}
                    highlightTeams={[featuredMatch.homeTeam.name, featuredMatch.awayTeam.name]}
                  />
                )}

                <CollapsibleSection title="Tournament Odds">
                  <TournamentOddsPanel
                    highlightTlas={[featuredMatch.homeTeam.code, featuredMatch.awayTeam.code]}
                    limit={12}
                  />
                </CollapsibleSection>

                {/* AI-generated tournament news */}
                <CollapsibleSection title="Tournament News">
                  <Suspense fallback={<div className="h-48 rounded-xl bg-brand-card border border-brand-border animate-pulse" />}>
                    <TournamentStories />
                  </Suspense>
                </CollapsibleSection>

                {/* All matches compact list */}
                {matches.length > 1 && (
                  <CollapsibleSection title="All Matches">
                    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
                      <div className="p-2 space-y-1">
                        {matches.map((m) => (
                          <MatchListRow
                            key={m.id}
                            m={m}
                            isFeatured={featuredMatch.id === m.id}
                          />
                        ))}
                      </div>
                    </div>
                  </CollapsibleSection>
                )}
              </div>
            ) : (
              <div className="text-center py-20 text-slate-500">
                <Trophy size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-lg font-semibold">No matches loaded.</p>
                <p className="text-sm mt-2 text-slate-600">
                  Run the seed endpoint to populate match data.
                </p>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="mt-16 border-t border-brand-border py-8 text-center text-xs text-slate-600">
        studio0x.io · FIFA World Cup 2026 · Data refreshes every 5 seconds
      </footer>
    </div>
  );
}
