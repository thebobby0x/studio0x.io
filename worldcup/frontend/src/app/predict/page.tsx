"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Trophy, CalendarDays, Radio, Check, Lock, Wifi, Star } from "lucide-react";
import type { PredictMatch } from "@/app/api/matches/route";
import type { ScheduleMatch } from "@/app/api/schedule/route";
import { getFlag } from "@/lib/flags";
import LiveClock from "@/components/ui/LiveClock";

interface Prediction { home: number; away: number }
type Preds = Record<number, Prediction>;

interface ScoreResult {
  total: number;
  breakdown: { label: string; pts: number }[];
}

function calcPoints(pred: Prediction, homeScore: number, awayScore: number): ScoreResult {
  const rows: { label: string; pts: number }[] = [];
  const po = pred.home > pred.away ? "H" : pred.home < pred.away ? "A" : "D";
  const ao = homeScore > awayScore ? "H" : homeScore < awayScore ? "A" : "D";
  if (po === ao) rows.push({ label: "Correct outcome", pts: 10 });
  if (pred.home === homeScore) rows.push({ label: "Home goals correct", pts: 5 });
  if (pred.away === awayScore) rows.push({ label: "Away goals correct", pts: 5 });
  const predDiff   = pred.home - pred.away;
  const actualDiff = homeScore - awayScore;
  if (predDiff === actualDiff && !(pred.home === homeScore && pred.away === awayScore))
    rows.push({ label: "Correct goal difference", pts: 5 });
  if (pred.home === homeScore && pred.away === awayScore)
    rows.push({ label: "Exact score bonus", pts: 5 });
  return { total: rows.reduce((s, r) => s + r.pts, 0), breakdown: rows };
}

function ScorePicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <button
        onClick={e => { e.stopPropagation(); onChange(Math.max(0, value - 1)); }}
        className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all font-bold text-lg flex items-center justify-center leading-none"
      >−</button>
      <span className="w-8 text-center text-2xl font-black text-white tabular-nums select-none">{value}</span>
      <button
        onClick={e => { e.stopPropagation(); onChange(value + 1); }}
        className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all font-bold text-lg flex items-center justify-center leading-none"
      >+</button>
    </div>
  );
}

type FormResult = "W" | "D" | "L";

const FORM_COLORS: Record<FormResult, string> = {
  W: "bg-brand-green/20 text-brand-green",
  D: "bg-amber-500/20 text-amber-400",
  L: "bg-red-500/20 text-red-400",
};

function FormDots({ results }: { results: FormResult[] }) {
  if (results.length === 0) return null;
  return (
    <div className="flex gap-0.5">
      {results.map((r, i) => (
        <span key={i} className={`text-[8px] font-black w-3.5 h-3.5 flex items-center justify-center rounded-sm ${FORM_COLORS[r]}`}>{r}</span>
      ))}
    </div>
  );
}

function formatDay(isoDate: string) {
  return new Date(isoDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(isoDate: string) {
  return new Date(isoDate).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function PredictPage() {
  const [matches,  setMatches]  = useState<PredictMatch[]>([]);
  const [schedule, setSchedule] = useState<ScheduleMatch[]>([]);
  const [preds,    setPreds]    = useState<Preds>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/matches").then(r => r.json()),
      fetch("/api/schedule").then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([dbMatches, scheduleData]) => {
      setMatches((dbMatches as PredictMatch[]).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
      setSchedule(scheduleData as ScheduleMatch[]);
    }).finally(() => setLoading(false));
  }, []);

  // Refresh live schedule every 60s
  useEffect(() => {
    const t = setInterval(() => {
      fetch("/api/schedule").then(r => r.ok ? r.json() : []).then(setSchedule).catch(() => {});
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("wc26_preds");
      if (raw) setPreds(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  function save(fixture: number, pred: Prediction) {
    const next = { ...preds, [fixture]: pred };
    setPreds(next);
    try { localStorage.setItem("wc26_preds", JSON.stringify(next)); } catch { /* ignore */ }
  }

  // Map schedule by match ID (= fixture number in DB)
  const scheduleMap = useMemo(() => {
    const m = new Map<number, ScheduleMatch>();
    schedule.forEach(s => m.set(s.id, s));
    return m;
  }, [schedule]);

  // Merge DB team data with live statuses/scores
  const liveMatches = useMemo(() =>
    matches.map(m => {
      const live = scheduleMap.get(m.fixture);
      if (!live) return m;
      return {
        ...m,
        status: live.status as string,
        homeScore: live.homeScore ?? m.homeScore,
        awayScore: live.awayScore ?? m.awayScore,
      };
    }),
    [matches, scheduleMap]
  );

  // Compute form (last N results per team TLA) from live schedule
  const teamForm = useMemo(() => {
    const form: Record<string, FormResult[]> = {};
    const ftMatches = [...schedule]
      .filter(s => s.status === "FT" && s.homeScore !== null && s.awayScore !== null
        && s.homeTeam.tla && s.awayTeam.tla)
      .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());

    for (const s of ftMatches) {
      const h = s.homeTeam.tla.toUpperCase();
      const a = s.awayTeam.tla.toUpperCase();
      if (!form[h]) form[h] = [];
      if (!form[a]) form[a] = [];
      const hs = s.homeScore!;
      const as_ = s.awayScore!;
      if (hs > as_) { form[h].push("W"); form[a].push("L"); }
      else if (hs < as_) { form[h].push("L"); form[a].push("W"); }
      else { form[h].push("D"); form[a].push("D"); }
    }
    return form;
  }, [schedule]);

  // Compute group standings positions
  const { groupPositions, groupPts, groupGD } = useMemo(() => {
    const pts: Record<string, number>  = {};
    const gd:  Record<string, number>  = {};
    const gf:  Record<string, number>  = {};
    const grp: Record<string, string>  = {};

    for (const s of schedule) {
      if (s.status !== "FT" || s.homeScore === null || s.awayScore === null || !s.group) continue;
      const h = s.homeTeam.tla?.toUpperCase();
      const a = s.awayTeam.tla?.toUpperCase();
      if (!h || !a || h === "TBD" || a === "TBD") continue;

      if (pts[h] === undefined) { pts[h] = 0; gd[h] = 0; gf[h] = 0; }
      if (pts[a] === undefined) { pts[a] = 0; gd[a] = 0; gf[a] = 0; }
      grp[h] = s.group; grp[a] = s.group;

      const hs = s.homeScore, as_ = s.awayScore;
      gf[h] += hs; gd[h] += (hs - as_);
      gf[a] += as_; gd[a] += (as_ - hs);

      if (hs > as_) { pts[h] += 3; }
      else if (hs < as_) { pts[a] += 3; }
      else { pts[h]++; pts[a]++; }
    }

    const byGroup: Record<string, string[]> = {};
    for (const [tla, g] of Object.entries(grp)) {
      if (!byGroup[g]) byGroup[g] = [];
      byGroup[g].push(tla);
    }

    const positions: Record<string, number> = {};
    for (const teams of Object.values(byGroup)) {
      teams.sort((x, y) => {
        if ((pts[y] ?? 0) !== (pts[x] ?? 0)) return (pts[y] ?? 0) - (pts[x] ?? 0);
        if ((gd[y] ?? 0) !== (gd[x] ?? 0)) return (gd[y] ?? 0) - (gd[x] ?? 0);
        return (gf[y] ?? 0) - (gf[x] ?? 0);
      });
      teams.forEach((t, i) => { positions[t] = i + 1; });
    }

    return { groupPositions: positions, groupPts: pts, groupGD: gd };
  }, [schedule]);

  // Group by calendar day
  const byDay = liveMatches.reduce<Record<string, typeof liveMatches>>((acc, m) => {
    const day = new Date(m.date).toISOString().slice(0, 10);
    (acc[day] ??= []).push(m);
    return acc;
  }, {});

  const ftWithPred    = liveMatches.filter(m => m.status === "FT" && preds[m.fixture]);
  const totalPts      = ftWithPred.reduce((s, m) => s + calcPoints(preds[m.fixture], m.homeScore, m.awayScore).total, 0);
  const locked        = Object.keys(preds).length;
  const nsCount       = liveMatches.filter(m => m.status === "NS").length;
  const maxPossible   = nsCount * 30;

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-brand-border bg-brand-dark/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-brand-gold" />
            <span className="font-black text-white tracking-tight">WC 2026</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Dashboard</Link>
            <Link href="/schedule" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
              <CalendarDays size={13} />Schedule
            </Link>
            <Link href="/pulse" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
              <Radio size={13} />Pulse
            </Link>
            <Link href="/predict" className="flex items-center gap-1.5 text-xs font-semibold text-brand-gold">
              <Star size={12} />Predict
            </Link>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <Wifi size={11} className="text-brand-green" />
              <span className="hidden sm:inline">Live</span>
            </div>
            <LiveClock />
          </div>
        </div>
      </nav>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Points banner */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, #1a1200 0%, #0f1420 60%)", border: "1px solid #f5a62330" }}>
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-amber-500/70 mb-1">My predictions</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black text-white">{totalPts}</span>
                  <span className="text-brand-gold text-lg font-bold">pts</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {ftWithPred.length} graded · {locked} locked in
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-600 mb-1">still available</div>
                <div className="text-xl font-black text-slate-500">{maxPossible.toLocaleString()}</div>
                <div className="text-[10px] text-slate-600">pts up for grabs</div>
              </div>
            </div>
          </div>
          <div className="flex divide-x divide-amber-900/30 border-t border-amber-900/30 text-center text-[10px]">
            {[["10","Outcome"],["5","Each score"],["5","Goal diff"],["5","Exact"]].map(([p, l]) => (
              <div key={l} className="flex-1 py-2 text-amber-700/70">
                <div className="font-black text-amber-500">{p}</div>
                <div>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Match groups */}
        {loading ? (
          <div className="text-center text-slate-500 text-sm py-12 animate-pulse">Loading matches…</div>
        ) : matches.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-12">
            No matches found — run the seed first at <code className="text-brand-gold">/api/seed?secret=wc2026studio0x</code>
          </div>
        ) : (
          Object.entries(byDay).map(([day, dayMatches]) => (
            <div key={day} className="space-y-3">
              <div className="flex items-center gap-3 pt-1">
                <span className="text-[10px] uppercase tracking-widest font-semibold text-slate-600 shrink-0">
                  {formatDay(day + "T12:00:00")}
                </span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>

              {dayMatches.map(m => {
                const pred   = preds[m.fixture];
                const isFT   = m.status === "FT";
                const isLive = m.status === "LIVE" || m.status === "HT";
                const isExp  = expanded === m.fixture;
                const groupLabel = `Group ${m.group}`;
                const homeForm = (teamForm[m.homeTeam.tla.toUpperCase()] ?? []).slice(-3);
                const awayForm = (teamForm[m.awayTeam.tla.toUpperCase()] ?? []).slice(-3);
                const homePos  = groupPositions[m.homeTeam.tla.toUpperCase()];
                const awayPos  = groupPositions[m.awayTeam.tla.toUpperCase()];
                const homePts  = groupPts[m.homeTeam.tla.toUpperCase()];
                const awayPts  = groupPts[m.awayTeam.tla.toUpperCase()];
                const homeGD   = groupGD[m.homeTeam.tla.toUpperCase()];
                const awayGD   = groupGD[m.awayTeam.tla.toUpperCase()];

                /* ── Completed + predicted ── */
                if (isFT && pred) {
                  const { total: pts, breakdown } = calcPoints(pred, m.homeScore, m.awayScore);
                  const exact = pred.home === m.homeScore && pred.away === m.awayScore;
                  return (
                    <div
                      key={m.fixture}
                      onClick={() => setExpanded(isExp ? null : m.fixture)}
                      className={`rounded-2xl overflow-hidden cursor-pointer transition-colors ${
                        pts > 0
                          ? "border border-brand-gold/25 bg-[#0f1208]"
                          : "border border-slate-800 bg-brand-card"
                      }`}
                    >
                      <div className={`flex items-center justify-between px-4 py-2 border-b text-[10px] ${
                        pts > 0 ? "border-brand-gold/20 bg-brand-gold/8" : "border-slate-800 bg-slate-900/40"
                      }`}>
                        <span className="uppercase tracking-widest text-slate-500">{groupLabel}</span>
                        <span className="text-slate-600">{formatTime(m.date)}</span>
                      </div>

                      <div className="px-4 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{getFlag(m.homeTeam.tla)}</span>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-bold text-slate-400">{m.homeTeam.tla}</span>
                              {homePos && <span className="text-[9px] text-slate-600">P{homePos} · {homePts ?? 0}pts</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900">
                            <span className={`text-xl font-black tabular-nums ${m.homeScore === pred.home ? "text-brand-green" : "text-white"}`}>
                              {m.homeScore}
                            </span>
                            <span className="text-slate-700 text-sm mx-0.5">–</span>
                            <span className={`text-xl font-black tabular-nums ${m.awayScore === pred.away ? "text-brand-green" : "text-white"}`}>
                              {m.awayScore}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-row-reverse">
                            <span className="text-2xl">{getFlag(m.awayTeam.tla)}</span>
                            <div className="flex flex-col gap-0.5 items-end">
                              <span className="text-xs font-bold text-slate-400">{m.awayTeam.tla}</span>
                              {awayPos && <span className="text-[9px] text-slate-600">P{awayPos} · {awayPts ?? 0}pts</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="text-[11px] text-slate-500">
                            Your pick: <span className={`font-semibold ${exact ? "text-brand-green" : "text-slate-300"}`}>
                              {pred.home}–{pred.away}
                            </span>{exact && " ✓"}
                          </div>
                          <div className={`flex items-center gap-1.5 font-black text-sm ${pts > 0 ? "text-brand-gold" : "text-slate-600"}`}>
                            {pts > 0 && <Check size={13} />}
                            {pts} pts
                          </div>
                        </div>

                        {isExp && (
                          <div className="mt-3 pt-3 border-t border-slate-800">
                            {breakdown.length === 0 ? (
                              <p className="text-[11px] text-slate-600">No points this match — keep going!</p>
                            ) : (
                              <div className="space-y-1.5">
                                {breakdown.map(r => (
                                  <div key={r.label} className="flex justify-between text-[11px]">
                                    <span className="text-slate-500">{r.label}</span>
                                    <span className="text-brand-green font-semibold">+{r.pts}</span>
                                  </div>
                                ))}
                                <div className="flex justify-between text-[11px] pt-1.5 border-t border-slate-800 font-black">
                                  <span className="text-slate-400">Total</span>
                                  <span className="text-brand-gold">+{pts} pts</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {!isExp && <p className="text-[9px] text-slate-700 mt-1.5 text-right">tap for breakdown</p>}
                      </div>
                    </div>
                  );
                }

                /* ── Completed without prediction ── */
                if (isFT) {
                  return (
                    <div key={m.fixture} className="rounded-2xl overflow-hidden border border-slate-800/60 bg-brand-card opacity-60">
                      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 text-[10px]">
                        <span className="uppercase tracking-widest text-slate-600">{groupLabel}</span>
                        <span className="text-slate-700 italic">no prediction</span>
                      </div>
                      <div className="px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{getFlag(m.homeTeam.tla)}</span>
                          <span className="text-xs font-bold text-slate-500">{m.homeTeam.tla}</span>
                        </div>
                        <span className="text-lg font-black text-slate-500">{m.homeScore}–{m.awayScore}</span>
                        <div className="flex items-center gap-2 flex-row-reverse">
                          <span className="text-xl">{getFlag(m.awayTeam.tla)}</span>
                          <span className="text-xs font-bold text-slate-500">{m.awayTeam.tla}</span>
                        </div>
                      </div>
                    </div>
                  );
                }

                /* ── Live match ── */
                if (isLive) {
                  return (
                    <div key={m.fixture} className="rounded-2xl overflow-hidden border border-red-900/40 bg-brand-card">
                      <div className="flex items-center gap-2 px-4 py-2 bg-red-950/30 border-b border-red-900/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-[10px] text-red-400 font-semibold uppercase tracking-widest">
                          Live · {m.status === "HT" ? "HT" : "In play"}
                        </span>
                      </div>
                      <div className="px-4 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{getFlag(m.homeTeam.tla)}</span>
                          <span className="text-xs font-bold text-slate-400">{m.homeTeam.tla}</span>
                        </div>
                        <span className="text-xl font-black text-white px-3 py-1.5 rounded-xl bg-slate-900">
                          {m.homeScore}–{m.awayScore}
                        </span>
                        <div className="flex items-center gap-2 flex-row-reverse">
                          <span className="text-2xl">{getFlag(m.awayTeam.tla)}</span>
                          <span className="text-xs font-bold text-slate-400">{m.awayTeam.tla}</span>
                        </div>
                      </div>
                      {pred && (
                        <div className="px-4 pb-3 text-[11px] text-slate-500 text-center">
                          Your pick: <span className="text-slate-300 font-semibold">{pred.home}–{pred.away}</span>
                        </div>
                      )}
                    </div>
                  );
                }

                /* ── Upcoming (NS) — score picker ── */
                const cur = pred ?? { home: 0, away: 0 };
                return (
                  <div key={m.fixture} className="rounded-2xl overflow-hidden bg-brand-card border border-brand-border">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-brand-border">
                      <span className="text-[10px] uppercase tracking-widest text-slate-500">{groupLabel}</span>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-600">{formatTime(m.date)}</span>
                        {m.venue && <span className="text-[9px] text-slate-700 ml-2">{m.city || m.venue}</span>}
                      </div>
                    </div>

                    {/* Team context strip */}
                    <div className="flex items-center justify-between px-4 pt-3 pb-1 text-[10px] text-slate-600">
                      <div className="flex flex-col gap-1 items-start">
                        {homePos != null && (
                          <span className={`font-semibold ${homePos <= 2 ? "text-brand-green" : "text-slate-600"}`}>
                            P{homePos} · {homePts ?? 0}pts {homeGD != null && homeGD !== 0 ? (homeGD > 0 ? `+${homeGD}` : homeGD) + " GD" : ""}
                          </span>
                        )}
                        <FormDots results={homeForm} />
                      </div>
                      <span className="text-slate-700 text-[9px]">vs</span>
                      <div className="flex flex-col gap-1 items-end">
                        {awayPos != null && (
                          <span className={`font-semibold ${awayPos <= 2 ? "text-brand-green" : "text-slate-600"}`}>
                            P{awayPos} · {awayPts ?? 0}pts {awayGD != null && awayGD !== 0 ? (awayGD > 0 ? `+${awayGD}` : awayGD) + " GD" : ""}
                          </span>
                        )}
                        <FormDots results={awayForm} />
                      </div>
                    </div>

                    <div className="px-4 py-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col items-center gap-1.5 min-w-0 w-16">
                          <span className="text-3xl leading-none">{getFlag(m.homeTeam.tla)}</span>
                          <span className="text-[11px] font-bold text-slate-300">{m.homeTeam.tla}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-1 justify-center">
                          <ScorePicker value={cur.home} onChange={v => save(m.fixture, { ...cur, home: v })} />
                          <span className="text-slate-700 font-bold text-lg mx-0.5">–</span>
                          <ScorePicker value={cur.away} onChange={v => save(m.fixture, { ...cur, away: v })} />
                        </div>
                        <div className="flex flex-col items-center gap-1.5 min-w-0 w-16">
                          <span className="text-3xl leading-none">{getFlag(m.awayTeam.tla)}</span>
                          <span className="text-[11px] font-bold text-slate-300">{m.awayTeam.tla}</span>
                        </div>
                      </div>
                      {pred ? (
                        <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-brand-green">
                          <Lock size={10} />
                          <span>Saved · tap +/− to edit</span>
                        </div>
                      ) : (
                        <p className="mt-3 text-center text-[10px] text-slate-600">tap +/− to lock in your pick</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </main>

      <footer className="mt-16 border-t border-brand-border py-8 text-center text-xs text-slate-600">
        studio0x.io · Predictions saved locally · Max 30 pts per match
      </footer>
    </div>
  );
}
