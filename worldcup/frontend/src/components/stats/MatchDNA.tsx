"use client";

import type { GoalEvent } from "@/app/api/matches/[id]/goals/route";

// ── Clutch Index computation ─────────────────────────────────────────────────
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
        if (prevH <= prevA) w = prevH === prevA ? 3 : 2.5; // took lead or equalised
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

// ── Match DNA timeline ───────────────────────────────────────────────────────
function DNATimeline({
  goals, teamName, side,
}: {
  goals: GoalEvent[];
  teamName: string;
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

// ── Main export ──────────────────────────────────────────────────────────────
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
  const ci = computeClutchIndex(goals, homeTeamName);
  const maxCI = Math.max(...ci.map(p => p.ci), 3);

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

      {/* Timeline */}
      <div className="px-4 py-4 space-y-4">
        <div className="space-y-3">
          <DNATimeline goals={homeGoals} teamName={homeTeamName} side="home" />
          <div className="flex items-center gap-2">
            <span className="w-6" />
            <div className="flex-1 flex justify-between text-[8px] text-slate-800 font-mono px-0.5">
              <span>0</span><span>15</span><span>30</span><span>45</span><span>60</span><span>75</span><span>90+</span>
            </div>
            <span className="w-3" />
          </div>
          <DNATimeline goals={awayGoals} teamName={awayTeamName} side="away" />
        </div>

        {/* Clutch Index */}
        {ci.length > 0 && (
          <div className="border-t border-brand-border/50 pt-3 mt-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Clutch Index™</span>
              <span className="text-[8px] text-slate-700">Lead-change weight × late-goal bonus</span>
            </div>
            <div className="space-y-1.5">
              {ci.map(p => (
                <div key={p.name} className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 w-24 truncate">{p.name.split(" ").map((w, i) => i === 0 ? w[0] + "." : w).join(" ")}</span>
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-brand-gold to-amber-300 rounded-full transition-all"
                      style={{ width: `${(p.ci / maxCI) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-black text-brand-gold tabular-nums w-6 text-right">{p.ci}</span>
                  <span className="text-[8px] text-slate-700 w-8 shrink-0">
                    {p.goals}G
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
