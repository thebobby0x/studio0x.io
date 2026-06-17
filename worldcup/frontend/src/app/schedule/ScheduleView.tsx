"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { getFlag } from "@/lib/flags";
import type { ScheduleMatch } from "@/app/api/schedule/route";

// ─── Local-date helpers ──────────────────────────────────────────────────────

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function utcToLocalDateStr(utcDate: string): string {
  return localDateStr(new Date(utcDate));
}

// ─── Countdown helpers ───────────────────────────────────────────────────────

function fmt2(n: number) { return String(n).padStart(2, "0"); }

function countdown(utcDate: string, now: number): { top: string; sub: string; urgent: boolean } {
  const diff = new Date(utcDate).getTime() - now;
  if (diff <= 0) return { top: "Kick off", sub: "", urgent: false };

  const totalSecs = Math.floor(diff / 1000);
  const d = Math.floor(totalSecs / 86400);
  const h = Math.floor((totalSecs % 86400) / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;

  if (d >= 7) {
    const dt = new Date(utcDate);
    return {
      top: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      sub: dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      urgent: false,
    };
  }
  if (d > 0) return { top: `${d}d ${h}h`, sub: `${fmt2(m)}m`, urgent: false };
  if (h > 0) return { top: `${h}h ${fmt2(m)}m`, sub: "kicks off", urgent: false };
  return { top: `${fmt2(m)}:${fmt2(s)}`, sub: "kicks off", urgent: true };
}

// ─── Match Card ──────────────────────────────────────────────────────────────

function MatchCard({ m, now }: { m: ScheduleMatch; now: number }) {
  const isLive = m.status === "LIVE" || m.status === "HT";
  const isDone = m.status === "FT";
  const isNS   = m.status === "NS";

  const { top, sub, urgent } = isNS ? countdown(m.utcDate, now) : { top: "", sub: "", urgent: false };

  const borderClass = isLive
    ? "border-brand-green/40 shadow-lg shadow-brand-green/5"
    : isDone
    ? "border-brand-border/50 opacity-60"
    : urgent
    ? "border-amber-500/40 shadow-amber-500/5 shadow-md"
    : "border-brand-border";

  const groupLabel = m.group ? `Group ${m.group}` : m.stageLabel;

  return (
    <div className={`relative rounded-2xl bg-brand-card border overflow-hidden transition-all duration-200 hover:scale-[1.01] hover:shadow-xl ${borderClass}`}>
      {/* Card-level link to match detail (below interactive team links) */}
      <Link
        href={`/schedule/${m.id}`}
        className="absolute inset-0 z-0"
        aria-label={`${m.homeTeam.name} vs ${m.awayTeam.name} match details`}
      />

      {/* Content layer — pointer-events-none so clicks fall through to card link */}
      <div className="relative z-10 pointer-events-none">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-brand-border/50">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {groupLabel}
          </span>
          <StatusBadge m={m} urgent={urgent} />
        </div>

        {/* Main content */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-5">
          {/* Home team — team page link re-enables pointer events */}
          <Link
            href={`/team/${m.homeTeam.tla}`}
            className="pointer-events-auto text-center block group/team transition-opacity hover:opacity-80"
          >
            <div className="text-4xl select-none">{getFlag(m.homeTeam.tla)}</div>
            <div className="mt-1.5 text-xs font-bold text-white leading-tight line-clamp-1 group-hover/team:text-brand-gold transition-colors">
              {m.homeTeam.name}
            </div>
            <div className="text-[9px] text-slate-600 uppercase tracking-wider mt-0.5">
              {m.homeTeam.tla}
            </div>
          </Link>

          {/* Center — score or countdown (passes clicks through to card link) */}
          <div className="text-center min-w-[90px]">
            {isLive && (
              <>
                <div className="text-4xl font-black tabular-nums text-white tracking-tighter">
                  {m.homeScore ?? 0}<span className="text-brand-border mx-1">—</span>{m.awayScore ?? 0}
                </div>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[11px] text-slate-400">
                    {m.status === "HT" ? "HT" : `${m.minute}'`}
                  </span>
                </div>
              </>
            )}
            {isDone && (
              <>
                <div className="text-4xl font-black tabular-nums text-slate-400 tracking-tighter">
                  {m.homeScore ?? 0}<span className="text-brand-border/60 mx-1">—</span>{m.awayScore ?? 0}
                </div>
                <div className="text-[10px] text-slate-600 mt-1 uppercase tracking-widest">Full Time</div>
              </>
            )}
            {isNS && (
              <>
                <div suppressHydrationWarning className={`font-black tabular-nums tracking-tight leading-none ${
                  urgent ? "text-3xl font-mono text-amber-400" : "text-2xl text-white"
                }`}>
                  {top}
                </div>
                {sub && (
                  <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">{sub}</div>
                )}
              </>
            )}
          </div>

          {/* Away team */}
          <Link
            href={`/team/${m.awayTeam.tla}`}
            className="pointer-events-auto text-center block group/team transition-opacity hover:opacity-80"
          >
            <div className="text-4xl select-none">{getFlag(m.awayTeam.tla)}</div>
            <div className="mt-1.5 text-xs font-bold text-white leading-tight line-clamp-1 group-hover/team:text-brand-gold transition-colors">
              {m.awayTeam.name}
            </div>
            <div className="text-[9px] text-slate-600 uppercase tracking-wider mt-0.5">
              {m.awayTeam.tla}
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ m, urgent }: { m: ScheduleMatch; urgent: boolean }) {
  if (m.status === "LIVE") {
    return (
      <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />LIVE
      </span>
    );
  }
  if (m.status === "HT") {
    return <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">HT</span>;
  }
  if (m.status === "FT") {
    return <span className="text-[10px] text-slate-600 bg-slate-800/50 px-2 py-0.5 rounded-full">FT</span>;
  }
  if (urgent) {
    return <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">Soon</span>;
  }
  const dt = new Date(m.utcDate);
  return (
    <span suppressHydrationWarning className="text-[10px] text-slate-500">
      {dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
    </span>
  );
}

// ─── Filter bar ──────────────────────────────────────────────────────────────

type Filter = "all" | "live" | "today" | "week" | "upcoming" | "played";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all",      label: "All" },
  { key: "live",     label: "Live" },
  { key: "today",    label: "Today" },
  { key: "week",     label: "This Week" },
  { key: "upcoming", label: "Upcoming" },
  { key: "played",   label: "Played" },
];

// ─── Main schedule view ──────────────────────────────────────────────────────

export default function ScheduleView({ initialMatches }: { initialMatches: ScheduleMatch[] }) {
  const [matches, setMatches]   = useState(initialMatches);
  const [filter, setFilter]     = useState<Filter>("all");
  const [now, setNow]           = useState(() => Date.now());

  // Tick every second for countdowns
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Refresh schedule every 30 seconds
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/schedule");
        if (res.ok) setMatches(await res.json());
      } catch { /* ignore */ }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const todayStr = localDateStr(new Date(now));

  const liveCount = matches.filter(m => m.status === "LIVE" || m.status === "HT").length;

  const filtered = useMemo(() => {
    const weekFromNow = new Date(now + 7 * 24 * 60 * 60 * 1000);
    const weekStr = localDateStr(weekFromNow);
    switch (filter) {
      case "live":     return matches.filter(m => m.status === "LIVE" || m.status === "HT");
      case "today":    return matches.filter(m => utcToLocalDateStr(m.utcDate) === todayStr);
      case "week":     return matches.filter(m => {
        const d = utcToLocalDateStr(m.utcDate);
        return d >= todayStr && d <= weekStr;
      });
      case "upcoming": return matches.filter(m => m.status === "NS" && utcToLocalDateStr(m.utcDate) !== todayStr);
      case "played":   return matches.filter(m => m.status === "FT");
      default:         return matches;
    }
  }, [matches, filter, todayStr, now]);

  // Group by local calendar date; newest-first for "all" and "played" views
  const groups = useMemo(() => {
    const map = new Map<string, ScheduleMatch[]>();
    for (const m of filtered) {
      const day = utcToLocalDateStr(m.utcDate);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(m);
    }
    const entries = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
    return (filter === "played" || filter === "all") ? entries.reverse() : entries;
  }, [filtered, filter]);

  function formatDayHeader(localDate: string) {
    const [y, mo, d] = localDate.split("-").map(Number);
    const dt = new Date(y, mo - 1, d, 12, 0, 0);
    const todayLocal = new Date(now);
    const isToday =
      dt.getFullYear() === todayLocal.getFullYear() &&
      dt.getMonth()    === todayLocal.getMonth() &&
      dt.getDate()     === todayLocal.getDate();
    const label = dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    return { label, isToday };
  }

  return (
    <div>
      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-6 text-sm text-slate-500">
        <span>
          <span className="text-slate-300 font-semibold">{matches.filter(m => m.status === "FT").length}</span>
          <span className="ml-1">played</span>
        </span>
        <span className="text-brand-border">·</span>
        <span>
          <span className="text-slate-300 font-semibold">{matches.filter(m => m.status === "NS").length}</span>
          <span className="ml-1">group stage remaining</span>
        </span>
        <span className="text-brand-border">·</span>
        <span className="text-slate-600">32 knockout TBD</span>
        <span className="text-brand-border">·</span>
        <span className="text-slate-600">104 total</span>
        {liveCount > 0 && (
          <>
            <span className="text-brand-border">·</span>
            <span className="flex items-center gap-1.5 text-red-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {liveCount} live now
            </span>
          </>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 mb-8 overflow-x-auto pb-1">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`
              relative shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all
              ${filter === key
                ? "bg-white text-brand-dark shadow"
                : "text-slate-400 hover:text-white hover:bg-brand-card"}
            `}
          >
            {key === "live" && liveCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
            {label}
          </button>
        ))}
      </div>

      {/* Match groups */}
      {groups.length === 0 && (
        <div className="text-center py-20 text-slate-600">
          <div className="text-4xl mb-4">📅</div>
          <p>No matches for this filter.</p>
        </div>
      )}

      <div className="space-y-10">
        {groups.map(([dateStr, dayMatches]) => {
          const { label, isToday } = formatDayHeader(dateStr);
          return (
            <section key={dateStr}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-4">
                <h2 suppressHydrationWarning className="text-sm font-bold text-slate-400 uppercase tracking-widest">{label}</h2>
                {isToday && (
                  <span className="text-[10px] font-bold text-brand-green bg-brand-green/10 px-2 py-0.5 rounded-full uppercase tracking-widest">
                    Today
                  </span>
                )}
                <div className="flex-1 h-px bg-brand-border" />
                <span className="text-xs text-slate-600">{dayMatches.length} match{dayMatches.length !== 1 ? "es" : ""}</span>
              </div>

              {/* Cards grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {dayMatches.map(m => (
                  <MatchCard key={m.id} m={m} now={now} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
