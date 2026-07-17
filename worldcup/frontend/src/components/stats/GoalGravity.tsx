"use client";

/**
 * Goal Gravity™ (studio0x proprietary)
 *
 * A tournament-wide leaderboard of the most "gravitational" goals:
 * goals that changed the match trajectory the most, ranked by a weighted
 * impact score derived from timing, score context, and match importance.
 *
 * Impact weights:
 *   - Lead-taking goal (from level or behind): ×2.5
 *   - Goal that made it 1-0:                  ×2.0
 *   - Late goal (≥ 80'):                       ×1.8 multiplier
 *   - Equaliser:                               ×2.0
 *   - Insurance goal (extending 2+ lead):      ×0.5
 *   - Own goal:                                ×0.8
 */

import { useEffect, useState } from "react";
import InfoTip from "@/components/ui/InfoTip";

export interface GravityGoal {
  scorer: string;
  team: string;
  minute: number;
  impact: number;
  context: string;
  matchLabel: string;
}

interface Props {
  goals: GravityGoal[];
  homeTeamName: string;
  awayTeamName: string;
}

export default function GoalGravity({ goals, homeTeamName, awayTeamName }: Props) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? goals : goals.slice(0, 5);
  const maxImpact = Math.max(...goals.map(g => g.impact), 5);

  if (goals.length === 0) return null;

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Goal Gravity™</span>
          <InfoTip metric="goalGravity" />
          <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
        </div>
        <span className="text-[9px] text-slate-700 uppercase tracking-wider">Match-changing impact score</span>
      </div>

      <div className="px-4 py-3 space-y-2">
        {visible.map((g, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-slate-600 w-4 text-right font-mono tabular-nums">{i + 1}</span>
            <span className="text-[10px] text-slate-400 w-20 truncate">
              {g.scorer.split(" ").map((w, j) => j === 0 ? w[0] + "." : w).join(" ")}
            </span>
            <span className="text-[9px] text-slate-600 w-8 font-mono text-center">{g.minute}&apos;</span>
            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-500 to-orange-400 rounded-full"
                style={{ width: `${(g.impact / maxImpact) * 100}%` }}
              />
            </div>
            <span className="text-[10px] font-black text-red-400 tabular-nums w-6 text-right">{g.impact.toFixed(1)}</span>
            <span className="text-[8px] text-slate-700 w-16 truncate text-right hidden sm:block">{g.context}</span>
          </div>
        ))}
      </div>

      {goals.length > 5 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full border-t border-brand-border/50 py-2 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
        >
          {expanded ? "Show less" : `+${goals.length - 5} more goals`}
        </button>
      )}
    </div>
  );
}

// ── Server-side computation helper (imported into match detail page) ──────────
export interface GoalEventForGravity {
  minute: number;
  team: string;
  scorer: string;
  isOwnGoal: boolean;
  isPenalty: boolean;
}

export function computeGoalGravity(
  goals: GoalEventForGravity[],
  homeTeam: string,
  matchLabel: string,
): GravityGoal[] {
  const sorted = [...goals].sort((a, b) => a.minute - b.minute);
  let h = 0, a = 0;
  const result: GravityGoal[] = [];

  for (const g of sorted) {
    const isHome = !g.isOwnGoal ? g.team === homeTeam : g.team !== homeTeam;
    const prevH = h, prevA = a;
    if (isHome) h++; else a++;

    let impact = 1.0;
    let context = "Standard";

    if (!g.isOwnGoal) {
      const prevDiff = prevH - prevA;
      const currDiff = h - a;

      if (prevDiff === 0 && currDiff !== 0) {
        // Lead-taking from level
        impact = 2.5;
        context = "Lead Breaker";
      } else if ((isHome && prevH < prevA) || (!isHome && prevA < prevH)) {
        // Lead-taking from behind (comeback goal)
        impact = 3.0;
        context = "Comeback";
      } else if (prevDiff !== 0 && currDiff === 0) {
        // Equaliser
        impact = 2.0;
        context = "Equaliser";
      } else if (Math.abs(currDiff) === 1 && prevH === 0 && prevA === 0) {
        // Opener
        impact = 2.0;
        context = "Opener";
      } else if (Math.abs(currDiff) >= 3) {
        // Killing the game
        impact = 0.5;
        context = "Insurance";
      }

      // Late-goal multiplier
      if (g.minute >= 80) {
        impact *= 1.8;
        context += " (Late)";
      } else if (g.minute >= 70) {
        impact *= 1.3;
        context += " (70+)";
      }

      if (g.isPenalty) {
        impact *= 0.85;
        context += " [P]";
      }
    } else {
      impact = 0.8;
      context = "Own Goal";
    }

    result.push({
      scorer: g.scorer,
      team: g.team,
      minute: g.minute,
      impact: Math.round(impact * 10) / 10,
      context: context.trim(),
      matchLabel,
    });
  }

  return result.sort((a, b) => b.impact - a.impact);
}
