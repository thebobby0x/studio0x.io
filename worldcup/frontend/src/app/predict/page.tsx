"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, CalendarDays, Radio, Check, Lock, Wifi, Star } from "lucide-react";
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
  if (pred.home === homeScore) rows.push({ label: `${pred.home > pred.away ? "Home" : "Away"} goals (home)`, pts: 5 });
  if (pred.away === awayScore) rows.push({ label: `${pred.away > pred.home ? "Home" : "Away"} goals (away)`, pts: 5 });
  if (pred.home - pred.away === homeScore - awayScore && !(pred.home === homeScore && pred.away === awayScore))
    rows.push({ label: "Correct goal diff", pts: 5 });
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

function formatMatchTime(utcDate: string) {
  const d = new Date(utcDate);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function PredictPage() {
  const [matches,  setMatches]  = useState<ScheduleMatch[]>([]);
  const [preds,    setPreds]    = useState<Preds>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    fetch("/api/schedule")
      .then(r => r.json())
      .then((all: ScheduleMatch[]) =>
        setMatches(all.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime()))
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("wc26_preds");
      if (raw) setPreds(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  function save(id: number, pred: Prediction) {
    const next = { ...preds, [id]: pred };
    setPreds(next);
    try { localStorage.setItem("wc26_preds", JSON.stringify(next)); } catch { /* ignore */ }
  }

  const byDay = matches.reduce<Record<number, ScheduleMatch[]>>((acc, m) => {
    const d = m.matchday ?? 1;
    (acc[d] ??= []).push(m);
    return acc;
  }, {});

  const ftWithPred = matches.filter(m => m.status === "FT" && preds[m.id] && m.homeScore != null);
  const totalPts   = ftWithPred.reduce((s, m) => s + calcPoints(preds[m.id], m.homeScore!, m.awayScore!).total, 0);
  const locked     = Object.keys(preds).length;
  const maxPossible = matches.filter(m => m.status === "NS").length * 30;

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
          {/* Scoring rules strip */}
          <div className="flex divide-x divide-amber-900/30 border-t border-amber-900/30 text-center text-[10px]">
            {[
              ["10", "Outcome"],
              ["5",  "Each score"],
              ["5",  "Goal diff"],
              ["5",  "Exact score"],
            ].map(([p, l]) => (
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
        ) : (
          Object.entries(byDay).map(([day, dayMatches]) => (
            <div key={day} className="space-y-3">
              <div className="flex items-center gap-3 pt-1">
                <span className="text-[10px] uppercase tracking-widest font-semibold text-slate-600">Matchday {day}</span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>

              {dayMatches.map(m => {
                const pred     = preds[m.id];
                const isFT     = m.status === "FT";
                const isLive   = m.status === "LIVE" || m.status === "HT";
                const isExp    = expanded === m.id;

                /* ── Completed + predicted ── */
                if (isFT && pred && m.homeScore != null) {
                  const { total: pts, breakdown } = calcPoints(pred, m.homeScore, m.awayScore!);
                  const exact = pred.home === m.homeScore && pred.away === m.awayScore;
                  return (
                    <div
                      key={m.id}
                      onClick={() => setExpanded(isExp ? null : m.id)}
                      className={`rounded-2xl overflow-hidden cursor-pointer transition-all ${
                        pts > 0 ? "border border-brand-gold/25 bg-[#0f1208]" : "border border-slate-800 bg-brand-card"
                      }`}
                    >
                      {/* Result header */}
                      <div className={`flex items-center justify-between px-4 py-2 border-b text-[10px] ${
                        pts > 0 ? "border-brand-gold/20 bg-brand-gold/8" : "border-slate-800 bg-slate-900/40"
                      }`}>
                        <span className="uppercase tracking-widest text-slate-500">{m.stageLabel} · MD{m.matchday}</span>
                        <span className="text-slate-600">{formatMatchTime(m.utcDate)}</span>
                      </div>

                      <div className="px-4 py-4">
                        {/* Score row */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-2xl">{getFlag(m.homeTeam.tla)}</span>
                            <span className="text-xs font-bold text-slate-400">{m.homeTeam.tla}</span>
                          </div>

                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900">
                            <span className={`text-xl font-black tabular-nums ${m.homeScore === pred.home ? "text-brand-green" : "text-white"}`}>
                              {m.homeScore}
                            </span>
                            <span className="text-slate-700 text-sm">–</span>
                            <span className={`text-xl font-black tabular-nums ${m.awayScore === pred.away ? "text-brand-green" : "text-white"}`}>
                              {m.awayScore}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 min-w-0 flex-row-reverse">
                            <span className="text-2xl">{getFlag(m.awayTeam.tla)}</span>
                            <span className="text-xs font-bold text-slate-400">{m.awayTeam.tla}</span>
                          </div>
                        </div>

                        {/* Your pick + points */}
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] text-slate-500">
                            Your pick: <span className={`font-semibold ${exact ? "text-brand-green" : "text-slate-300"}`}>
                              {pred.home}–{pred.away}
                            </span>
                            {exact && " ✓"}
                          </div>
                          <div className={`flex items-center gap-1.5 font-black text-sm ${pts > 0 ? "text-brand-gold" : "text-slate-600"}`}>
                            {pts > 0 && <Check size={13} />}
                            {pts} pts
                          </div>
                        </div>

                        {/* Breakdown (expanded) */}
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
                        {!isExp && (
                          <p className="text-[9px] text-slate-700 mt-1.5 text-right">tap to {isExp ? "collapse" : "expand"}</p>
                        )}
                      </div>
                    </div>
                  );
                }

                /* ── Live match ── */
                if (isLive) {
                  return (
                    <div key={m.id} className="rounded-2xl overflow-hidden border border-red-900/40 bg-brand-card">
                      <div className="flex items-center gap-2 px-4 py-2 bg-red-950/30 border-b border-red-900/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-[10px] text-red-400 font-semibold uppercase tracking-widest">
                          Live · {m.status === "HT" ? "Half Time" : `${m.minute}'`}
                        </span>
                      </div>
                      <div className="px-4 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{getFlag(m.homeTeam.tla)}</span>
                          <span className="text-xs font-bold text-slate-400">{m.homeTeam.tla}</span>
                        </div>
                        <span className="text-xl font-black text-white px-3 py-1.5 rounded-xl bg-slate-900">
                          {m.homeScore ?? 0}–{m.awayScore ?? 0}
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
                  <div key={m.id} className="rounded-2xl overflow-hidden bg-brand-card border border-brand-border">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-brand-border">
                      <span className="text-[10px] uppercase tracking-widest text-slate-500">{m.stageLabel} · MD{m.matchday}</span>
                      <span className="text-[10px] text-slate-600">{formatMatchTime(m.utcDate)} local</span>
                    </div>
                    <div className="px-4 py-5">
                      <div className="flex items-center justify-between gap-2">
                        {/* Home */}
                        <div className="flex flex-col items-center gap-1.5 min-w-0">
                          <span className="text-3xl leading-none">{getFlag(m.homeTeam.tla)}</span>
                          <span className="text-[11px] font-bold text-slate-400">{m.homeTeam.tla}</span>
                        </div>

                        {/* Pickers */}
                        <div className="flex items-center gap-1.5">
                          <ScorePicker value={cur.home} onChange={v => save(m.id, { ...cur, home: v })} />
                          <span className="text-slate-700 font-bold text-lg mx-1">–</span>
                          <ScorePicker value={cur.away} onChange={v => save(m.id, { ...cur, away: v })} />
                        </div>

                        {/* Away */}
                        <div className="flex flex-col items-center gap-1.5 min-w-0">
                          <span className="text-3xl leading-none">{getFlag(m.awayTeam.tla)}</span>
                          <span className="text-[11px] font-bold text-slate-400">{m.awayTeam.tla}</span>
                        </div>
                      </div>

                      {pred ? (
                        <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-brand-green">
                          <Lock size={10} />
                          <span>Prediction saved · tap +/− to edit</span>
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
