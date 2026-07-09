"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import FlagImg from "@/components/ui/FlagImg";
import { formatKickoffCountdown, isMatchInProgress } from "@/lib/tournament";

// Serializable match shape passed from the dashboard server component.
export interface HeroMatch {
  id: string;
  fixture: number;
  date: string; // ISO
  status: string; // NS | LIVE | HT | FT
  home: { name: string; code: string };
  away: { name: string; code: string };
  homeScore: number;
  awayScore: number;
  elapsed: number;
  group?: string;
  /** Knockout round label ("Round of 16", "Quarter Final"…). When set, it wins
   *  over `group` — knockout games must never be labeled "Group X". */
  stage?: string;
}

// ── Live time / status pill ──────────────────────────────────────────────────
function liveMinute(m: HeroMatch, now: number): string {
  if (m.status === "HT") return "HT";
  if (m.status === "LIVE") return `${m.elapsed || 1}'`;
  // Kicked off but feed still says NS
  if (m.status === "NS" && isMatchInProgress(m.status, new Date(m.date).getTime(), now)) return "LIVE";
  return "";
}

// ── The big center card — a live game, the next kickoff, or a recent result ──
type BigMode = "live" | "next" | "result";

function BigMatchCard({ m, now, mode }: { m: HeroMatch; now: number; mode: BigMode }) {
  const isLive = mode === "live";
  const isResult = mode === "result";
  const minute = liveMinute(m, now);
  const ct = mode === "next" ? formatKickoffCountdown(m.date, now, { withPrefix: false }) : null;

  return (
    <Link
      href={`/schedule/${m.fixture || m.id}`}
      className={`group relative flex flex-col justify-center rounded-2xl border bg-brand-card px-5 py-6 sm:py-8 transition-all hover:shadow-2xl ${
        isLive
          ? "border-brand-green/50 shadow-lg shadow-brand-green/10"
          : isResult
          ? "border-brand-border"
          : "border-brand-gold/30 shadow-md shadow-brand-gold/5"
      }`}
    >
      {/* top label */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          {m.stage ?? (m.group ? `Group ${m.group}` : "World Cup")}
        </span>
        {isLive ? (
          <span className="flex items-center gap-1.5 text-[11px] font-black text-red-400">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {minute || "LIVE"}
          </span>
        ) : isResult ? (
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Full Time</span>
        ) : (
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Next Up</span>
        )}
      </div>

      {/* teams + score/countdown */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5">
        {/* home */}
        <div className="flex flex-col items-center text-center gap-2 min-w-0">
          <FlagImg tla={m.home.code} size={56} className="shadow-lg" />
          <div className="text-sm sm:text-base font-bold text-white truncate max-w-full group-hover:text-brand-gold transition-colors">
            {m.home.name}
          </div>
        </div>

        {/* center */}
        <div className="text-center min-w-[92px]">
          {mode === "next" ? (
            <>
              <div
                suppressHydrationWarning
                className={`font-black tabular-nums tracking-tight leading-none ${
                  ct?.urgent ? "text-3xl sm:text-4xl font-mono text-amber-400" : "text-2xl sm:text-3xl text-white"
                }`}
              >
                {ct?.label}
              </div>
              <div className="text-[10px] text-slate-500 mt-2 uppercase tracking-widest">
                {ct?.urgent ? "kicks off" : "countdown"}
              </div>
            </>
          ) : (
            <>
              <div
                className={`text-4xl sm:text-6xl font-black tabular-nums tracking-tighter leading-none ${
                  isResult ? "text-slate-300" : "text-white"
                }`}
              >
                {m.homeScore ?? 0}
                <span className="text-brand-border mx-1.5 sm:mx-2.5">–</span>
                {m.awayScore ?? 0}
              </div>
              {isResult && (
                <div className="text-[10px] text-slate-500 mt-2 uppercase tracking-widest">Full Time</div>
              )}
            </>
          )}
        </div>

        {/* away */}
        <div className="flex flex-col items-center text-center gap-2 min-w-0">
          <FlagImg tla={m.away.code} size={56} className="shadow-lg" />
          <div className="text-sm sm:text-base font-bold text-white truncate max-w-full group-hover:text-brand-gold transition-colors">
            {m.away.name}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Compact side-column row ──────────────────────────────────────────────────
function SideRow({ m, now, kind }: { m: HeroMatch; now: number; kind: "upcoming" | "result" }) {
  const ct = kind === "upcoming" ? formatKickoffCountdown(m.date, now, { withPrefix: false }) : null;
  const isTbd = m.home.code === "TBD";
  return (
    <Link
      href={isTbd ? "/bracket" : `/schedule/${m.fixture || m.id}`}
      className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
    >
      <FlagImg tla={m.home.code} size={18} className="shrink-0" />
      <span className="text-xs font-bold text-slate-300 w-9 shrink-0">{m.home.code}</span>
      {kind === "result" ? (
        <span className="text-xs font-black tabular-nums text-white shrink-0">
          {m.homeScore}–{m.awayScore}
        </span>
      ) : (
        <span className="text-[10px] text-slate-600 shrink-0">v</span>
      )}
      <span className="text-xs font-bold text-slate-300 w-9 shrink-0">{m.away.code}</span>
      <FlagImg tla={m.away.code} size={18} className="shrink-0" />
      <span
        suppressHydrationWarning
        className={`ml-auto text-[11px] tabular-nums shrink-0 ${
          kind === "result" ? "text-slate-600 font-semibold uppercase" : ct?.urgent ? "text-amber-400 font-mono" : "text-slate-500"
        }`}
      >
        {kind === "result" ? "FT" : ct?.label}
      </span>
    </Link>
  );
}

function ColumnHeader({ label }: { label: string }) {
  return (
    <div className="px-3 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
      {label}
    </div>
  );
}

// ── The 3-zone hero ──────────────────────────────────────────────────────────
export default function LiveHero({
  live,
  upcoming,
  results,
}: {
  live: HeroMatch[];
  upcoming: HeroMatch[];
  results: HeroMatch[];
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Center: big cards ──
  //  · 2+ live  → both live games
  //  · 1 live   → next-up (left) + live (right)   ← "now + next"
  //  · 0 live   → the NEXT game is the hero (owner 7/9: results are context,
  //               not the headline — they live in the Results list). A recent
  //               result only takes the big slot when nothing is upcoming.
  const liveGames = live.slice(0, 2);
  // TBD placeholders pad the Upcoming list but must NEVER take the hero slot —
  // the big card is always a real fixture.
  const nextGame = upcoming.find((m) => m.home.code !== "TBD") ?? null;
  const recentResult = results[0] ?? null;

  const centerSlots: { m: HeroMatch; mode: BigMode }[] = [];
  if (liveGames.length >= 2) {
    centerSlots.push({ m: liveGames[0], mode: "live" }, { m: liveGames[1], mode: "live" });
  } else if (liveGames.length === 1) {
    if (nextGame) centerSlots.push({ m: nextGame, mode: "next" });
    else if (recentResult) centerSlots.push({ m: recentResult, mode: "result" });
    centerSlots.push({ m: liveGames[0], mode: "live" });
  } else if (nextGame) {
    centerSlots.push({ m: nextGame, mode: "next" });
  } else if (recentResult) {
    centerSlots.push({ m: recentResult, mode: "result" });
  }

  // Don't repeat a big-card match in the side lists.
  const bigIds = new Set(centerSlots.map((s) => s.m.id));
  const upcomingList = upcoming.filter((m) => !bigIds.has(m.id)).slice(0, 6);
  const resultsList = results.filter((m) => !bigIds.has(m.id)).slice(0, 6);

  return (
    <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.1fr)_minmax(0,1fr)] gap-4">
      {/* CENTER first in the DOM so it stacks on top on mobile */}
      <div className="order-1 lg:order-2 flex flex-col gap-4">
        {centerSlots.length > 0 ? (
          <div className={`grid gap-4 ${centerSlots.length > 1 ? "sm:grid-cols-2" : "grid-cols-1"}`}>
            {centerSlots.map((s) => (
              <BigMatchCard key={s.m.id} m={s.m} now={now} mode={s.mode} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-brand-border bg-brand-card px-5 py-10 text-center text-sm text-slate-600">
            No matches scheduled.
          </div>
        )}
      </div>

      {/* LEFT: Upcoming */}
      <div className="order-2 lg:order-1 rounded-2xl border border-brand-border bg-brand-card/60 py-3">
        <ColumnHeader label="Upcoming Matches" />
        <div className="space-y-0.5">
          {upcomingList.length ? (
            upcomingList.map((m) => <SideRow key={m.id} m={m} now={now} kind="upcoming" />)
          ) : (
            <div className="px-3 py-4 text-xs text-slate-600">Nothing upcoming.</div>
          )}
        </div>
      </div>

      {/* RIGHT: Results */}
      <div className="order-3 rounded-2xl border border-brand-border bg-brand-card/60 py-3">
        <ColumnHeader label="Results" />
        <div className="space-y-0.5">
          {resultsList.length ? (
            resultsList.map((m) => <SideRow key={m.id} m={m} now={now} kind="result" />)
          ) : (
            <div className="px-3 py-4 text-xs text-slate-600">No results yet.</div>
          )}
        </div>
      </div>
    </section>
  );
}
