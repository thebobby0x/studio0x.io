"use client";

import type { GoalEvent } from "@/app/api/matches/[id]/goals/route";

// ── Clutch Index™ ─────────────────────────────────────────────────────────────
// Weight per goal: lead-changing = 3, equalising = 2.5, extending = 1, OG = 0.5
// Late-goal multiplier: ×1.5 if minute ≥ 80
function computeClutchIndex(goals: GoalEvent[], homeTeam: string) {
  const sorted = [...goals].sort((a, b) => a.minute - b.minute);
  let h = 0, a = 0;
  const scores = new Map<string, { ci: number; n: number; team: string }>();

  for (const g of sorted) {
    const isHome = g.team === homeTeam;
    const prevH = h, prevA = a;

    if (g.isOwnGoal) { isHome ? a++ : h++; }
    else              { isHome ? h++ : a++; }

    if (!g.isOwnGoal) {
      let w = 1;
      if (isHome) {
        if (prevH <= prevA) w = prevH === prevA ? 3 : 2.5;
      } else {
        if (prevA <= prevH) w = prevA === prevH ? 3 : 2.5;
      }
      if (g.minute >= 80) w *= 1.5;

      const key = g.scorer;
      const e = scores.get(key) ?? { ci: 0, n: 0, team: g.team };
      scores.set(key, { ci: e.ci + w, n: e.n + 1, team: e.team });
    }
  }

  return [...scores.entries()]
    .map(([name, d]) => ({ name, team: d.team, goals: d.n, ci: +(d.ci / d.n).toFixed(1) }))
    .sort((a, b) => b.ci - a.ci || b.goals - a.goals);
}

// ── Strike Clock™ ─────────────────────────────────────────────────────────────
// Measures goal timing patterns: first strike minute, avg gap, rhythm label
function computeStrikeClock(goals: GoalEvent[]) {
  if (goals.length === 0) return null;
  const sorted = [...goals].sort((a, b) => a.minute - b.minute);
  const first = sorted[0].minute;
  const last = sorted[sorted.length - 1].minute;

  let avgGap: number | null = null;
  if (sorted.length > 1) {
    const gaps = sorted.slice(1).map((g, i) => g.minute - sorted[i].minute);
    avgGap = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
  }

  const rhythm =
    first <= 10           ? "Explosive"    :
    sorted.length >= 4    ? "High-Scoring" :
    last >= 85            ? "Late Drama"   : "Steady";
  const rhythmEmoji =
    first <= 10           ? "⚡" :
    sorted.length >= 4    ? "🎯" :
    last >= 85            ? "🔥" : "⏱";

  return { first, last, avgGap, rhythm, rhythmEmoji, total: sorted.length };
}

// ── Score Volatility™ ─────────────────────────────────────────────────────────
// Counts lead changes and equalisers to quantify match drama
function computeScoreVolatility(goals: GoalEvent[], homeTeam: string) {
  const sorted = [...goals].sort((a, b) => a.minute - b.minute);
  let h = 0, a = 0, leadChanges = 0, equalisers = 0;
  let prevLead: "home" | "away" | "level" = "level";

  for (const g of sorted) {
    const isHome = !g.isOwnGoal ? g.team === homeTeam : g.team !== homeTeam;
    if (isHome) h++; else a++;

    const lead: "home" | "away" | "level" = h > a ? "home" : a > h ? "away" : "level";
    if (lead === "level" && prevLead !== "level") equalisers++;
    if (lead !== "level" && prevLead !== "level" && lead !== prevLead) leadChanges++;
    prevLead = lead;
  }

  const dramaLabel =
    leadChanges >= 2 ? "High Drama"  :
    equalisers >= 2  ? "Tense"       :
    leadChanges === 1 ? "Shifted"    : "Dominant";
  const dramaEmoji =
    leadChanges >= 2 ? "🎭" :
    equalisers >= 2  ? "😤" :
    leadChanges === 1 ? "↔️" : "⬛";

  return { leadChanges, equalisers, dramaLabel, dramaEmoji };
}

// ── Momentum Pulse™ ──────────────────────────────────────────────────────────
// Reconstructs the score at each 15-minute checkpoint to show momentum swings
function computeMomentumPulse(goals: GoalEvent[], homeTeam: string) {
  const CHECKPOINTS = [15, 30, 45, 60, 75, 90];
  const sorted = [...goals].sort((a, b) => a.minute - b.minute);

  return CHECKPOINTS.map(checkpoint => {
    let h = 0, a = 0;
    for (const g of sorted) {
      if (g.minute > checkpoint) break;
      const isHome = !g.isOwnGoal ? g.team === homeTeam : g.team !== homeTeam;
      if (isHome) h++; else a++;
    }
    return { checkpoint, h, a };
  });
}

// ── Match DNA timeline ────────────────────────────────────────────────────────
function DNATimeline({
  goals, side,
}: {
  goals: GoalEvent[];
  side: "home" | "away";
}) {
  const MAX_MIN = 95;
  const pct = (m: number) => `${Math.min((m / MAX_MIN) * 100, 100).toFixed(1)}%`;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] font-bold text-slate-500 w-6 shrink-0 text-right">
        {side === "home" ? "H" : "A"}
      </span>
      <div className="relative flex-1 h-1 bg-slate-800 rounded-full overflow-visible">
        {/* Half-time marker */}
        <div className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 bg-slate-700" style={{ left: `${(45 / MAX_MIN) * 100}%` }} />
        {/* Goal markers */}
        {goals.map((g, i) => (
          <div
            key={i}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
            style={{ left: pct(g.minute) }}
          >
            <span className="text-[11px] leading-none">{g.isOwnGoal ? "🙈" : "⚽"}</span>
            <span className={`text-[8px] font-mono mt-0.5 whitespace-nowrap ${side === "home" ? "text-brand-green" : "text-amber-400"}`}>
              {g.minute}&apos;{g.minute > 90 ? "+" : ""}
            </span>
          </div>
        ))}
      </div>
      <span className="text-[9px] font-bold text-white tabular-nums shrink-0 w-3 text-center">
        {goals.length}
      </span>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
interface Props {
  goals: GoalEvent[];
  homeTeamName: string;
  awayTeamName: string;
  homeTeamCode: string;
}

export default function MatchDNA({ goals, homeTeamName, awayTeamName, homeTeamCode }: Props) {
  if (goals.length === 0) return null;

  const homeGoals = goals.filter(g => !g.isOwnGoal ? g.team === homeTeamName : g.team !== homeTeamName);
  const awayGoals = goals.filter(g => !g.isOwnGoal ? g.team !== homeTeamName : g.team === homeTeamName);
  const ci  = computeClutchIndex(goals, homeTeamName);
  const maxCI = Math.max(...ci.map(p => p.ci), 3);
  const sc  = computeStrikeClock(goals);
  const sv  = computeScoreVolatility(goals, homeTeamName);
  const mp  = computeMomentumPulse(goals, homeTeamName);
  const hasVolatility = sv.leadChanges > 0 || sv.equalisers > 0;
  const hasMovement = mp.some(p => p.h > 0 || p.a > 0);

  void homeTeamCode;

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Match DNA™</span>
          <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
        </div>
        <span className="text-[9px] text-slate-700 uppercase tracking-wider">Goal timeline · 0–95&apos;</span>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Timeline */}
        <div className="space-y-3">
          <DNATimeline goals={homeGoals} side="home" />
          <div className="flex items-center gap-2">
            <span className="w-6" />
            <div className="flex-1 flex justify-between text-[8px] text-slate-800 font-mono px-0.5">
              <span>0</span><span>15</span><span>30</span><span>45</span><span>60</span><span>75</span><span>90+</span>
            </div>
            <span className="w-3" />
          </div>
          <DNATimeline goals={awayGoals} side="away" />
        </div>

        {/* Momentum Pulse™ */}
        {hasMovement && (
          <div className="border-t border-brand-border/50 pt-3">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Momentum Pulse™</span>
              <span className="text-[8px] text-slate-600">Score at each 15-min checkpoint</span>
            </div>
            <div className="flex items-stretch gap-1">
              {mp.map(({ checkpoint, h, a }) => {
                const lead = h > a ? "home" : a > h ? "away" : "level";
                const bg =
                  lead === "home"  ? "bg-brand-green/15 border-brand-green/25" :
                  lead === "away"  ? "bg-amber-500/15 border-amber-500/25" :
                  checkpoint === 15 && h === 0 && a === 0
                    ? "bg-slate-900/30 border-brand-border/20"
                    : "bg-slate-800/40 border-brand-border/40";
                const scoreColor =
                  lead === "home"  ? "text-brand-green" :
                  lead === "away"  ? "text-amber-400"   : "text-slate-500";

                return (
                  <div key={checkpoint} className={`flex-1 rounded-lg border px-1 py-2 text-center ${bg}`}>
                    <div className={`text-xs font-black tabular-nums leading-none ${scoreColor}`}>
                      {h}–{a}
                    </div>
                    <div className="text-[8px] text-slate-700 mt-0.5 font-mono">{checkpoint}&apos;</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Strike Clock™ */}
        {sc && (
          <div className="border-t border-brand-border/50 pt-3">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Strike Clock™</span>
              <span className="text-[8px] text-slate-600">Goal timing patterns</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-900/60 rounded-xl p-2.5 text-center">
                <div className="text-xl font-black text-white tabular-nums leading-none">{sc.first}&apos;</div>
                <div className="text-[8px] text-slate-500 uppercase tracking-wider mt-1">First Strike</div>
              </div>
              <div className="bg-slate-900/60 rounded-xl p-2.5 text-center">
                <div className="text-xl font-black text-white tabular-nums leading-none">
                  {sc.avgGap !== null ? `${sc.avgGap}m` : `${sc.total}G`}
                </div>
                <div className="text-[8px] text-slate-500 uppercase tracking-wider mt-1">
                  {sc.avgGap !== null ? "Avg Gap" : "Goals"}
                </div>
              </div>
              <div className="bg-slate-900/60 rounded-xl p-2.5 text-center">
                <div className="text-xl leading-none">{sc.rhythmEmoji}</div>
                <div className="text-[8px] text-slate-500 uppercase tracking-wider mt-1">{sc.rhythm}</div>
              </div>
            </div>
          </div>
        )}

        {/* Score Volatility™ */}
        {hasVolatility && (
          <div className="border-t border-brand-border/50 pt-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Score Volatility™</span>
              <span className="text-[8px] text-slate-600">{sv.dramaEmoji} {sv.dramaLabel}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between bg-slate-900/40 rounded-lg px-3 py-2">
                <span className="text-[10px] text-slate-400">Lead changes</span>
                <span className="text-sm font-black text-white tabular-nums">{sv.leadChanges}</span>
              </div>
              <div className="flex items-center justify-between bg-slate-900/40 rounded-lg px-3 py-2">
                <span className="text-[10px] text-slate-400">Equalisers</span>
                <span className="text-sm font-black text-white tabular-nums">{sv.equalisers}</span>
              </div>
            </div>
          </div>
        )}

        {/* Clutch Index™ */}
        {ci.length > 0 && (
          <div className="border-t border-brand-border/50 pt-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Clutch Index™</span>
              <span className="text-[8px] text-slate-600">Lead-change weight × late-goal bonus</span>
            </div>
            <div className="space-y-1.5">
              {ci.map(p => (
                <div key={p.name} className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 w-24 truncate">
                    {p.name.split(" ").map((w, i) => i === 0 ? w[0] + "." : w).join(" ")}
                  </span>
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-brand-gold to-amber-300 rounded-full transition-all"
                      style={{ width: `${(p.ci / maxCI) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-black text-brand-gold tabular-nums w-6 text-right">{p.ci}</span>
                  <span className="text-[8px] text-slate-700 w-8 shrink-0">{p.goals}G</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
