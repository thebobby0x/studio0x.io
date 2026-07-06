"use client";

import { useEffect, useState } from "react";
import { preMatchWinProbFromTournamentOdds } from "@/lib/probabilities";
import type { LiveData } from "@/lib/types";

interface UpsetStats {
  factor: number;      // 0–100 how surprising the result was
  label: string;
  description: string;
  isUpset: boolean;
  favoriteProb: number;
  winner: string | null;
}

function computeUpsetFactor(data: LiveData): UpsetStats | null {
  const { match, tournamentOdds } = data;
  if (match.status !== "FT") return null;
  if (!tournamentOdds || tournamentOdds.home === null || tournamentOdds.away === null) return null;
  if (match.homeScore === null || match.awayScore === null) return null;

  const homeWinProb = preMatchWinProbFromTournamentOdds(
    tournamentOdds.home ?? 0.02,
    tournamentOdds.away ?? 0.02,
  );
  const drawProb = 0.26;
  const awayWinProb = Math.max(0.02, 1 - homeWinProb - drawProb);

  const diff = match.homeScore - match.awayScore;
  const result: "home" | "draw" | "away" = diff > 0 ? "home" : diff < 0 ? "away" : "draw";
  const actualProb = result === "home" ? homeWinProb : result === "away" ? awayWinProb : drawProb;
  const factor = Math.round((1 - actualProb) * 100);

  const isUpset = (result === "away" && homeWinProb > 0.6) || (result === "home" && awayWinProb > 0.6);
  const winner = result === "home" ? match.homeTeam.name : result === "away" ? match.awayTeam.name : null;
  const favorite = homeWinProb >= awayWinProb ? match.homeTeam.name : match.awayTeam.name;
  const favoriteProb = Math.max(homeWinProb, awayWinProb);

  const label =
    factor >= 80 ? "Massive Upset" :
    factor >= 65 ? "Major Surprise" :
    factor >= 50 ? "Mild Surprise" :
    factor >= 35 ? "Expected" :
    "Dominant Win";

  // Probabilities are OUR model (derived from Polymarket tournament odds),
  // not a quoted market price — say "modelled" so it never reads as one.
  const description = isUpset && winner
    ? `${winner} upset ${favorite} (modelled ${Math.round(favoriteProb * 100)}% pre-match favorite)`
    : result === "draw"
    ? `Draw — modelled at ${Math.round(drawProb * 100)}% pre-match`
    : `${favorite} won as expected`;

  return { factor, label, description, isUpset, favoriteProb, winner };
}

export default function UpsetMeter({ matchId }: { matchId: string }) {
  const [stats, setStats] = useState<UpsetStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/matches/${matchId}/live`)
      .then(r => r.json())
      .then((data: LiveData) => {
        setStats(computeUpsetFactor(data));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [matchId]);

  if (loading) return <div className="h-24 rounded-2xl bg-brand-card border border-brand-border animate-pulse" />;
  if (!stats) return null;

  const barColor =
    stats.factor >= 65 ? "from-red-500 to-orange-400" :
    stats.factor >= 50 ? "from-amber-500 to-yellow-400" :
    "from-brand-green to-emerald-400";

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Upset Factor™</span>
          <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
        </div>
        <span className="text-[9px] text-slate-700 uppercase tracking-wider">modelled from Polymarket tournament odds</span>
      </div>

      <div className="px-4 py-4 space-y-3">
        {/* Score and label */}
        <div className="flex items-center gap-4">
          <div className="text-4xl font-black text-white tabular-nums leading-none w-14">
            {stats.factor}
          </div>
          <div>
            <div className={`text-sm font-black ${stats.isUpset ? "text-red-400" : "text-slate-300"}`}>
              {stats.label}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">{stats.description}</div>
          </div>
        </div>

        {/* Bar */}
        <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${barColor} rounded-full transition-all`}
            style={{ width: `${stats.factor}%` }}
          />
        </div>

        {/* Scale labels */}
        <div className="flex justify-between text-[8px] text-slate-700 font-mono">
          <span>Expected</span>
          <span>Surprise</span>
          <span>Massive Upset</span>
        </div>
      </div>
    </div>
  );
}
