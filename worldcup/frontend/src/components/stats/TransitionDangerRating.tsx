"use client";

import type { GoalEvent } from "@/app/api/matches/[id]/goals/route";

// Counter-attack window: goal scored within this many minutes of the previous goal
const COUNTER_WINDOW_MIN = 4;

interface TeamTDR {
  name: string;
  totalGoals: number;
  counterGoals: number;
  burstGoals: number; // goals in 10-min bursts (2+ in same window)
  tdr: number; // 0–100 Transition Danger Rating
  label: string;
  labelColor: string;
}

function computeTDR(
  goals: GoalEvent[],
  teamName: string,
  homeTeam: string,
): TeamTDR {
  const sorted = [...goals].sort((a, b) => a.minute - b.minute);
  const teamGoals = sorted.filter(g => {
    const scoringTeam = g.isOwnGoal ? (g.team === homeTeam ? teamName : homeTeam) : g.team;
    return scoringTeam === teamName;
  });

  let counterGoals = 0;
  let burstGoals = 0;

  for (let i = 0; i < sorted.length; i++) {
    const g = sorted[i];
    const isTeamGoal = g.isOwnGoal
      ? (g.team === homeTeam && teamName !== homeTeam) || (g.team !== homeTeam && teamName === homeTeam)
      : g.team === teamName;

    if (!isTeamGoal) continue;

    // Check if any PREVIOUS goal (by either team) was within counter window
    const prevGoal = sorted[i - 1];
    if (prevGoal && g.minute - prevGoal.minute <= COUNTER_WINDOW_MIN) {
      counterGoals++;
    }

    // Burst: multiple goals in a 10-minute window
    const windowGoals = teamGoals.filter(t => Math.abs(t.minute - g.minute) <= 10).length;
    if (windowGoals >= 2) burstGoals++;
  }

  const totalGoals = teamGoals.length;
  // TDR: counter-attacks as % of goals + burst attack bonus
  const counterRatio = totalGoals > 0 ? counterGoals / totalGoals : 0;
  const burstBonus = Math.min(20, burstGoals * 5);
  const tdr = Math.min(100, Math.round(counterRatio * 80 + burstBonus));

  const label =
    tdr >= 65 ? "Lightning Counter" :
    tdr >= 45 ? "Counter Threat" :
    tdr >= 25 ? "Transition Ready" :
    tdr >= 10 ? "Methodical" :
    "Low Transition";

  const labelColor =
    tdr >= 65 ? "text-red-400" :
    tdr >= 45 ? "text-orange-400" :
    tdr >= 25 ? "text-amber-400" :
    "text-slate-400";

  return { name: teamName, totalGoals, counterGoals, burstGoals, tdr, label, labelColor };
}

interface Props {
  goals: GoalEvent[];
  homeTeamName: string;
  awayTeamName: string;
}

export default function TransitionDangerRating({ goals, homeTeamName, awayTeamName }: Props) {
  if (goals.length < 2) return null;

  const homeTDR = computeTDR(goals, homeTeamName, homeTeamName);
  const awayTDR = computeTDR(goals, awayTeamName, homeTeamName);

  if (homeTDR.tdr === 0 && awayTDR.tdr === 0) return null;

  const maxTDR = Math.max(homeTDR.tdr, awayTDR.tdr, 1);

  // Detect notable transition events
  const sorted = [...goals].sort((a, b) => a.minute - b.minute);
  const rapidExchanges: { minute: number; gap: number; team: string }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].minute - sorted[i - 1].minute;
    if (gap <= COUNTER_WINDOW_MIN) {
      rapidExchanges.push({ minute: sorted[i].minute, gap, team: sorted[i].team });
    }
  }

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Transition Danger Rating™</span>
          <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
        </div>
        <span className="text-[9px] text-slate-500 uppercase tracking-wider">Counter-attack efficiency</span>
      </div>

      <div className="px-4 py-4 space-y-3">
        {[homeTDR, awayTDR].map(t => (
          <div key={t.name} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 truncate max-w-[140px]">{t.name}</span>
              <div className="flex items-center gap-3 text-[10px] shrink-0">
                {t.counterGoals > 0 && (
                  <span className="text-slate-500">⚡ {t.counterGoals} counter{t.counterGoals !== 1 ? "s" : ""}</span>
                )}
                <span className={`font-black ${t.labelColor}`}>{t.label}</span>
              </div>
            </div>
            <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all"
                style={{ width: `${(t.tdr / maxTDR) * 100}%` }}
              />
            </div>
            <div className="text-[9px] text-slate-700 font-mono">TDR {t.tdr}</div>
          </div>
        ))}

        {/* Rapid exchange moments */}
        {rapidExchanges.length > 0 && (
          <div className="mt-2 pt-3 border-t border-brand-border/40">
            <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-2">Rapid Exchanges</div>
            <div className="flex flex-wrap gap-2">
              {rapidExchanges.map((e, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] text-indigo-400">
                  <span className="font-mono">{e.minute}&apos;</span>
                  <span className="text-indigo-600">·</span>
                  <span className="text-slate-400">{e.gap}min gap</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
