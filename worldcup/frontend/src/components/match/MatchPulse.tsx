"use client";

// Live match-metrics wrapper for the match detail page. Polls the goals and
// live endpoints so Match DNA™, Momentum Pulse™, Score Volatility™ and
// Clutch Index™ move throughout a live match — even at 0-0, where real team
// stats (possession, shots, corners via api-football) drive the movement.
// Goal-derived leaderboards (Goal Gravity™, Transition Danger™) appear once
// confirmed goal events exist.

import { useEffect, useState, useCallback } from "react";
import MatchDNA from "@/components/stats/MatchDNA";
import GoalGravity, { computeGoalGravity } from "@/components/stats/GoalGravity";
import TransitionDangerRating from "@/components/stats/TransitionDangerRating";
import type { GoalEvent } from "@/app/api/matches/[id]/goals/route";
import type { LiveData, LiveMetrics } from "@/lib/types";
import type { TeamLiveStats } from "@/lib/liveStats";

function toTeamLiveStats(m: LiveMetrics[string] | undefined): TeamLiveStats {
  return {
    possession:   m?.possession ?? null,
    totalShots:   m?.total_shots ?? null,
    shotsOn:      m?.shots_on ?? null,
    shotsOff:     m?.shots_off ?? null,
    blockedShots: m?.blocked_shots ?? null,
    corners:      m?.corners ?? null,
    fouls:        m?.fouls ?? null,
    offsides:     m?.offsides ?? null,
    yellowCards:  m?.yellow_cards ?? null,
    redCards:     m?.red_cards ?? null,
    saves:        m?.saves ?? null,
    passes:       m?.passes ?? null,
    passAccuracy: m?.pass_accuracy ?? null,
    xg:           m?.xg ?? null,
  };
}

export default function MatchPulse({
  matchId,
  homeTeamName,
  awayTeamName,
  homeTeamCode,
  awayTeamCode,
}: {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamCode: string;
  awayTeamCode: string;
}) {
  const [goals, setGoals] = useState<GoalEvent[] | null>(null);
  const [live, setLive] = useState<LiveData | null>(null);

  const load = useCallback(async () => {
    try {
      const [goalsRes, liveRes] = await Promise.all([
        fetch(`/api/matches/${matchId}/goals`),
        fetch(`/api/matches/${matchId}/live`),
      ]);
      if (goalsRes.ok) {
        const g = await goalsRes.json() as { goals?: GoalEvent[] };
        setGoals(g.goals ?? []);
      }
      if (liveRes.ok) setLive(await liveRes.json() as LiveData);
    } catch {
      // transient network error — keep last good data on screen
    }
  }, [matchId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [load]);

  if (!goals || !live) return null;

  const status = live.match.status;
  const isLive = status === "LIVE" || status === "HT";
  const isDone = status === "FT";
  if (!isLive && !isDone) return null;

  const homeCode = live.match.homeTeam.code;
  const awayCode = live.match.awayTeam.code;
  const statsReal = live.dataSources?.stats === "api-football";
  const dnaStats = statsReal
    ? { home: toTeamLiveStats(live.metrics[homeCode]), away: toTeamLiveStats(live.metrics[awayCode]) }
    : null;

  // Goal-derived leaderboards only use CONFIRMED events — reconstructed
  // (pending) goals have no verified scorer or exact minute.
  const confirmed = goals.filter(g => !g.pending);

  // Nothing to show at all (e.g. finished 0-0 with no stats feed)
  if (goals.length === 0 && !dnaStats && !isLive) return null;

  return (
    <div className="space-y-4">
      <MatchDNA
        goals={goals}
        homeTeamName={homeTeamName}
        awayTeamName={awayTeamName}
        homeTeamCode={homeTeamCode}
        awayTeamCode={awayTeamCode}
        matchStatus={status}
        currentMinute={live.match.elapsed}
        stats={dnaStats}
      />
      {confirmed.length > 0 && (
        <>
          <GoalGravity
            goals={computeGoalGravity(confirmed, homeTeamName, `${homeTeamName} vs ${awayTeamName}`)}
            homeTeamName={homeTeamName}
            awayTeamName={awayTeamName}
          />
          <TransitionDangerRating
            goals={confirmed}
            homeTeamName={homeTeamName}
            awayTeamName={awayTeamName}
          />
        </>
      )}
    </div>
  );
}
