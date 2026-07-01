"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { getFlag } from "@/lib/flags";
import FlagImg from "@/components/ui/FlagImg";
import type { ScheduleMatch } from "@/app/api/schedule/route";
import { isMatchInProgress } from "@/lib/tournament";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function utcToLocal(utcDate: string): string {
  return localDateStr(new Date(utcDate));
}

function fmt2(n: number) { return String(n).padStart(2, "0"); }

function countdown(utcDate: string, now: number): { label: string; urgent: boolean } {
  const diff = new Date(utcDate).getTime() - now;
  if (diff <= 0) return { label: "Kick off", urgent: false };
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d >= 7) {
    const dt = new Date(utcDate);
    return { label: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }), urgent: false };
  }
  if (d > 0) return { label: `${d}d ${h}h`, urgent: false };
  if (h > 0) return { label: `${h}h ${fmt2(m)}m`, urgent: false };
  return { label: `${fmt2(m)}:${fmt2(sec)}`, urgent: true };
}

function localTime(utcDate: string): string {
  return new Date(utcDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDayLabel(dateStr: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, mo - 1, d, 12);
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// ─── Featured Hero Card ───────────────────────────────────────────────────────

function FeaturedCard({ m, now, label }: { m: ScheduleMatch; now: number; label?: string }) {
  // A match whose kickoff has passed but still reads NS (feed lag) is really
  // underway — treat it as live so it heroes correctly and shows a LIVE state.
  const kickedOff = m.status === "NS" && isMatchInProgress(m.status, new Date(m.utcDate).getTime(), now);
  const isLive = m.status === "LIVE" || m.status === "HT" || kickedOff;
  const isDone = m.status === "FT";
  const { label: ctLabel, urgent } = m.status === "NS" && !kickedOff ? countdown(m.utcDate, now) : { label: "", urgent: false };

  return (
    <Link
      href={`/schedule/${m.id}`}
      className={`group block rounded-2xl bg-brand-card border overflow-hidden transition-all hover:shadow-2xl mb-6 ${
        isLive
          ? "border-brand-green/50 shadow-lg shadow-brand-green/10"
          : isDone
          ? "border-brand-border/50"
          : urgent
          ? "border-amber-500/40 shadow-md shadow-amber-500/10"
          : "border-brand-border"
      }`}
    >
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-brand-border/40">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {label ?? (m.group ? `Group ${m.group}` : m.stageLabel)}
          {m.matchday > 0 ? ` · MD ${m.matchday}` : ""}
        </span>
        {isLive && (
          <span className="flex items-center gap-1.5 text-[10px] font-black text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            LIVE
          </span>
        )}
        {isDone && <span className="text-[10px] text-slate-500">Full Time</span>}
        {!isLive && !isDone && (
          <span suppressHydrationWarning className="text-[10px] text-slate-500">
            {localTime(m.utcDate)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-8">
        {/* Home */}
        <div className="text-center">
          <div className="flex justify-center mb-3"><FlagImg tla={m.homeTeam.tla} size={80} className="shadow-lg" /></div>
          <div className="text-sm sm:text-base font-bold text-white group-hover:text-brand-gold transition-colors">
            {m.homeTeam.name}
          </div>
          <div className="text-[10px] text-slate-600 uppercase tracking-wider mt-0.5">
            {m.homeTeam.tla}
          </div>
        </div>

        {/* Score / countdown */}
        <div className="text-center min-w-[110px]">
          {isLive && (
            <>
              <div className="text-5xl font-black tabular-nums text-white tracking-tighter">
                {m.homeScore ?? 0}
                <span className="text-brand-border mx-2">–</span>
                {m.awayScore ?? 0}
              </div>
              <div className="flex items-center justify-center gap-1.5 mt-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-mono text-red-400">
                  {m.status === "HT" ? "HT" : kickedOff ? "Kicking off" : `${m.minute}'`}
                </span>
              </div>
            </>
          )}
          {isDone && (
            <>
              <div className="text-5xl font-black tabular-nums text-slate-300 tracking-tighter">
                {m.homeScore ?? 0}
                <span className="text-brand-border/60 mx-2">–</span>
                {m.awayScore ?? 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-2 uppercase tracking-widest">Full Time</div>
            </>
          )}
          {m.status === "NS" && !kickedOff && (
            <>
              <div
                suppressHydrationWarning
                className={`font-black tabular-nums tracking-tight ${
                  urgent ? "text-4xl font-mono text-amber-400" : "text-3xl text-white"
                }`}
              >
                {ctLabel}
              </div>
              <div className="text-[11px] text-slate-500 mt-1.5 uppercase tracking-wider">
                {urgent ? "kicks off" : "countdown"}
              </div>
            </>
          )}
        </div>

        {/* Away */}
        <div className="text-center">
          <div className="flex justify-center mb-3"><FlagImg tla={m.awayTeam.tla} size={80} className="shadow-lg" /></div>
          <div className="text-sm sm:text-base font-bold text-white group-hover:text-brand-gold transition-colors">
            {m.awayTeam.name}
          </div>
          <div className="text-[10px] text-slate-600 uppercase tracking-wider mt-0.5">
            {m.awayTeam.tla}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── Compact Match Row ────────────────────────────────────────────────────────

function MatchRow({ m, now }: { m: ScheduleMatch; now: number }) {
  const isLive = m.status === "LIVE" || m.status === "HT";
  const isDone = m.status === "FT";
  const { label: ctLabel, urgent } = m.status === "NS" ? countdown(m.utcDate, now) : { label: "", urgent: false };

  return (
    <Link
      href={`/schedule/${m.id}`}
      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-brand-card border border-brand-border hover:border-slate-600 transition-all group"
    >
      {/* Home */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <FlagImg tla={m.homeTeam.tla} size={24} className="shrink-0" />
        <span className="text-sm font-semibold text-slate-300 truncate group-hover:text-white transition-colors">
          {m.homeTeam.name}
        </span>
      </div>

      {/* Score / time */}
      <div className="shrink-0 text-center min-w-[72px]">
        {isLive && (
          <span className="flex items-center justify-center gap-1.5">
            <span className="text-sm font-black text-white tabular-nums">
              {m.homeScore ?? 0}–{m.awayScore ?? 0}
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          </span>
        )}
        {isDone && (
          <span className="text-sm font-black text-slate-400 tabular-nums">
            {m.homeScore ?? 0}–{m.awayScore ?? 0}
          </span>
        )}
        {m.status === "NS" && (
          <span
            suppressHydrationWarning
            className={`text-xs font-semibold ${urgent ? "text-amber-400" : "text-slate-400"}`}
          >
            {ctLabel}
          </span>
        )}
      </div>

      {/* Away */}
      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
        <span className="text-sm font-semibold text-slate-300 truncate text-right group-hover:text-white transition-colors">
          {m.awayTeam.name}
        </span>
        <FlagImg tla={m.awayTeam.tla} size={24} className="shrink-0" />
      </div>
    </Link>
  );
}

// ─── Sub-filter bar (Remaining + Results) ────────────────────────────────────

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

interface SubFilters {
  group: string;
  matchday: number;
  team: string;
}

function SubFilterBar({
  filters,
  onChange,
  teams,
}: {
  filters: SubFilters;
  onChange: (f: SubFilters) => void;
  teams: string[];
}) {
  return (
    <div className="space-y-2 mb-6">
      {/* Group chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-slate-600 uppercase tracking-widest w-12 shrink-0">Group</span>
        {["", ...GROUPS].map((g) => (
          <button
            key={g || "all"}
            onClick={() => onChange({ ...filters, group: g })}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
              filters.group === g
                ? "bg-brand-gold text-brand-dark"
                : "bg-brand-card border border-brand-border text-slate-400 hover:text-white hover:border-slate-500"
            }`}
          >
            {g || "All"}
          </button>
        ))}
      </div>

      {/* Matchday + team row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-slate-600 uppercase tracking-widest w-12 shrink-0">MD</span>
        {[0, 1, 2, 3].map((d) => (
          <button
            key={d}
            onClick={() => onChange({ ...filters, matchday: d })}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
              filters.matchday === d
                ? "bg-brand-gold text-brand-dark"
                : "bg-brand-card border border-brand-border text-slate-400 hover:text-white hover:border-slate-500"
            }`}
          >
            {d === 0 ? "All" : d}
          </button>
        ))}

        <select
          value={filters.team}
          onChange={(e) => onChange({ ...filters, team: e.target.value })}
          className="ml-auto text-xs bg-brand-card border border-brand-border text-slate-400 rounded-full px-3 py-1.5 hover:border-slate-500 focus:outline-none focus:border-brand-gold cursor-pointer"
        >
          <option value="">All Teams</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ─── Simultaneous game grouping ───────────────────────────────────────────────
// Groups matches that kick off within 30 minutes of each other as "simultaneous"

function groupSimultaneous(matches: ScheduleMatch[]): ScheduleMatch[][] {
  if (matches.length === 0) return [];
  const groups: ScheduleMatch[][] = [];
  let current: ScheduleMatch[] = [matches[0]];
  for (let i = 1; i < matches.length; i++) {
    const prev = new Date(matches[i - 1].utcDate).getTime();
    const curr = new Date(matches[i].utcDate).getTime();
    if (curr - prev <= 30 * 60 * 1000) {
      current.push(matches[i]);
    } else {
      groups.push(current);
      current = [matches[i]];
    }
  }
  groups.push(current);
  return groups;
}

// ─── Date group section ───────────────────────────────────────────────────────

function DateSection({
  dateStr,
  isToday,
  matches,
  now,
}: {
  dateStr: string;
  isToday: boolean;
  matches: ScheduleMatch[];
  now: number;
}) {
  const kickoffGroups = groupSimultaneous(matches);

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <h2
          suppressHydrationWarning
          className="text-xs font-bold text-slate-400 uppercase tracking-widest shrink-0"
        >
          {formatDayLabel(dateStr)}
        </h2>
        {isToday && (
          <span className="text-[10px] font-bold text-brand-green bg-brand-green/10 px-2 py-0.5 rounded-full uppercase tracking-widest shrink-0">
            Today
          </span>
        )}
        <div className="flex-1 h-px bg-brand-border" />
        <span className="text-xs text-slate-600 shrink-0">{matches.length}</span>
      </div>
      <div className="space-y-2">
        {kickoffGroups.map((group, gi) =>
          group.length >= 2 ? (
            <div key={gi} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-semibold text-amber-500/70 uppercase tracking-widest">
                  Simultaneous
                </span>
                <div className="flex-1 h-px bg-amber-500/20" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {group.map((m) => (
                  <MatchRow key={m.id} m={m} now={now} />
                ))}
              </div>
            </div>
          ) : (
            group.map((m) => <MatchRow key={m.id} m={m} now={now} />)
          )
        )}
      </div>
    </section>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

type View = "today" | "remaining" | "results";

export default function ScheduleView({ initialMatches }: { initialMatches: ScheduleMatch[] }) {
  const [matches, setMatches] = useState(initialMatches);
  const [view, setView] = useState<View>("today");
  const [now, setNow] = useState(() => Date.now());
  const [filters, setFilters] = useState<SubFilters>({ group: "", matchday: 0, team: "" });

  // Tick every second for live countdowns
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Refresh schedule every 30s
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
  const liveCount = matches.filter((m) => m.status === "LIVE" || m.status === "HT").length;
  const playedCount = matches.filter((m) => m.status === "FT").length;
  const remainingCount = matches.filter((m) => m.status === "NS").length;

  // All unique team TLAs for dropdown
  const allTeams = useMemo(() => {
    const set = new Set<string>();
    matches.forEach((m) => {
      if (m.homeTeam.tla) set.add(m.homeTeam.tla);
      if (m.awayTeam.tla) set.add(m.awayTeam.tla);
    });
    return [...set].filter(Boolean).sort();
  }, [matches]);

  // Today's matches sorted ascending
  const todayMatches = useMemo(
    () =>
      matches
        .filter((m) => utcToLocal(m.utcDate) === todayStr)
        .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime()),
    [matches, todayStr]
  );

  // Featured: in-progress (incl. just-kicked-off) → next today → next any day → most recent FT
  const featured = useMemo(() => {
    // True live first, then a game whose kickoff just passed (feed still catching up).
    const trulyLive = matches.find((m) => m.status === "LIVE" || m.status === "HT");
    if (trulyLive) return trulyLive;
    const justStarted = matches
      .filter((m) => m.status === "NS" && isMatchInProgress(m.status, new Date(m.utcDate).getTime(), now))
      .sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime());
    if (justStarted.length) return justStarted[0];
    const nextToday = todayMatches.find((m) => m.status === "NS");
    if (nextToday) return nextToday;
    const allNS = matches
      .filter((m) => m.status === "NS")
      .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
    if (allNS.length) return allNS[0];
    return (
      matches
        .filter((m) => m.status === "FT")
        .sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime())[0] ?? null
    );
  }, [matches, todayMatches, now]);

  const featuredLabel = useMemo(() => {
    if (!featured) return undefined;
    if (isMatchInProgress(featured.status, new Date(featured.utcDate).getTime(), now)) return "Live Now";
    if (featured.status === "FT") return "Most Recent Result";
    return utcToLocal(featured.utcDate) === todayStr ? "Next Up Today" : "Next Match";
  }, [featured, todayStr, now]);

  const otherToday = useMemo(
    () => todayMatches.filter((m) => m.id !== featured?.id),
    [todayMatches, featured]
  );

  // Sub-filter function
  const applyFilters = useCallback(
    (list: ScheduleMatch[]) =>
      list.filter((m) => {
        if (filters.group && m.group !== filters.group) return false;
        if (filters.matchday && m.matchday !== filters.matchday) return false;
        if (
          filters.team &&
          m.homeTeam.tla !== filters.team &&
          m.awayTeam.tla !== filters.team
        )
          return false;
        return true;
      }),
    [filters]
  );

  // Group list by local date → [[dateStr, matches[]]]
  const groupByDate = useCallback(
    (list: ScheduleMatch[]): [string, ScheduleMatch[]][] => {
      const map = new Map<string, ScheduleMatch[]>();
      list.forEach((m) => {
        const d = utcToLocal(m.utcDate);
        if (!map.has(d)) map.set(d, []);
        map.get(d)!.push(m);
      });
      return [...map.entries()];
    },
    []
  );

  const remainingGroups = useMemo(
    () =>
      groupByDate(
        applyFilters(
          matches
            .filter((m) => m.status === "NS")
            .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())
        )
      ),
    [matches, applyFilters, groupByDate]
  );

  const resultsGroups = useMemo(
    () =>
      groupByDate(
        applyFilters(
          matches
            .filter((m) => m.status === "FT")
            .sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime())
        )
      ),
    [matches, applyFilters, groupByDate]
  );

  return (
    <div>
      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-6 text-sm text-slate-500">
        <span>
          <span className="font-semibold text-slate-300">{playedCount}</span> played
        </span>
        <span className="text-brand-border">·</span>
        <span>
          <span className="font-semibold text-slate-300">{remainingCount}</span> remaining
        </span>
        {liveCount > 0 && (
          <>
            <span className="text-brand-border">·</span>
            <span className="flex items-center gap-1.5 font-semibold text-red-400">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {liveCount} live now
            </span>
          </>
        )}
      </div>

      {/* View tabs */}
      <div className="bg-brand-card border border-brand-border rounded-2xl p-1 inline-flex gap-1 mb-8">
        {(["today", "remaining", "results"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`relative px-5 py-1.5 rounded-xl text-sm font-semibold transition-all ${
              view === v ? "bg-white text-brand-dark shadow" : "text-slate-400 hover:text-white"
            }`}
          >
            {v === "today" && liveCount > 0 && view !== "today" && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
            {v === "today" ? "Today" : v === "remaining" ? "Remaining" : "Results"}
          </button>
        ))}
      </div>

      {/* ── TODAY ──────────────────────────────────────────────────────────── */}
      {view === "today" && (
        <div>
          {featured ? (
            <FeaturedCard m={featured} now={now} label={featuredLabel} />
          ) : (
            <div className="text-center py-20 text-slate-600">
              <div className="text-4xl mb-4">📅</div>
              <p>No matches scheduled.</p>
            </div>
          )}

          {otherToday.length > 0 && (
            <>
              <div className="flex items-center gap-3 mb-3 mt-8">
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest shrink-0">
                  Also today
                </h2>
                <div className="flex-1 h-px bg-brand-border" />
                <span className="text-xs text-slate-600">{otherToday.length}</span>
              </div>
              <div className="space-y-2">
                {otherToday.map((m) => (
                  <MatchRow key={m.id} m={m} now={now} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── REMAINING ──────────────────────────────────────────────────────── */}
      {view === "remaining" && (
        <div>
          <SubFilterBar filters={filters} onChange={setFilters} teams={allTeams} />
          {remainingGroups.length === 0 ? (
            <div className="text-center py-20 text-slate-600">
              <div className="text-4xl mb-4">✅</div>
              <p>No upcoming matches match your filters.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {remainingGroups.map(([dateStr, dayMatches]) => (
                <DateSection
                  key={dateStr}
                  dateStr={dateStr}
                  isToday={dateStr === todayStr}
                  matches={dayMatches}
                  now={now}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── RESULTS ────────────────────────────────────────────────────────── */}
      {view === "results" && (
        <div>
          <SubFilterBar filters={filters} onChange={setFilters} teams={allTeams} />
          {resultsGroups.length === 0 ? (
            <div className="text-center py-20 text-slate-600">
              <div className="text-4xl mb-4">📋</div>
              <p>No results yet.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {resultsGroups.map(([dateStr, dayMatches]) => (
                <DateSection
                  key={dateStr}
                  dateStr={dateStr}
                  isToday={dateStr === todayStr}
                  matches={dayMatches}
                  now={now}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
