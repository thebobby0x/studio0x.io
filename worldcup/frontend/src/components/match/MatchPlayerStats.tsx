"use client";

import { useEffect, useState } from "react";
import type { PlayerMatchStats } from "@/app/api/matches/[id]/players/route";

function StatCell({ value, label, highlight }: { value: number | string; label: string; highlight?: boolean }) {
  return (
    <div className="text-center">
      <div className={`text-sm font-black tabular-nums ${highlight ? "text-brand-gold" : "text-slate-300"}`}>{value}</div>
      <div className="text-[9px] text-slate-600 uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

function RatingBadge({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-[10px] text-slate-700 font-mono">—</span>;
  const color =
    rating >= 8   ? "text-brand-gold bg-brand-gold/10 border-brand-gold/30" :
    rating >= 7   ? "text-brand-green bg-brand-green/10 border-brand-green/30" :
    rating >= 6   ? "text-slate-300 bg-slate-700/50 border-brand-border" :
                    "text-slate-500 bg-slate-800/50 border-brand-border/50";
  return (
    <span className={`text-[10px] font-black border rounded px-1.5 py-0.5 font-mono ${color}`}>
      {rating.toFixed(1)}
    </span>
  );
}

function PlayerRow({ p, isTop }: { p: PlayerMatchStats; isTop: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 ${isTop ? "bg-brand-gold/5" : "hover:bg-white/3"} transition-colors`}>
      {/* Number */}
      <span className="text-[10px] text-slate-600 font-mono tabular-nums w-4 text-center shrink-0">{p.number || "—"}</span>

      {/* Name + cards */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-200 truncate">{p.name}</span>
          {p.yellowCard && <span className="w-2.5 h-3.5 bg-yellow-400 rounded-sm shrink-0" title="Yellow card" />}
          {p.redCard && <span className="w-2.5 h-3.5 bg-red-500 rounded-sm shrink-0" title="Red card" />}
        </div>
        <div className="text-[9px] text-slate-600 font-mono">{p.position} · {p.minutesPlayed}&apos;</div>
      </div>

      {/* Goals */}
      {p.goals > 0 && (
        <span className="text-[10px] font-bold text-brand-green shrink-0">⚽ {p.goals}</span>
      )}
      {p.assists > 0 && (
        <span className="text-[10px] font-bold text-brand-gold shrink-0">🅐 {p.assists}</span>
      )}

      {/* Rating */}
      <div className="shrink-0">
        <RatingBadge rating={p.rating} />
      </div>
    </div>
  );
}

function TeamSection({ players, teamName, isRight }: { players: PlayerMatchStats[]; teamName: string; isRight?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...players].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const topRated = sorted[0];
  const shown = expanded ? sorted : sorted.slice(0, 8);

  const totalGoals = players.reduce((s, p) => s + p.goals, 0);
  const totalShots = players.reduce((s, p) => s + p.shots, 0);
  const avgRating = players.filter(p => p.rating).reduce((s, p, _, arr) =>
    s + (p.rating ?? 0) / arr.length, 0);

  return (
    <div className={`flex-1 min-w-0 ${isRight ? "border-l border-brand-border/50" : ""}`}>
      {/* Team header */}
      <div className="px-3 py-2.5 border-b border-brand-border/50 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-black text-white truncate">{teamName}</span>
        <div className="flex items-center gap-2 ml-auto text-[9px] text-slate-600">
          {avgRating > 0 && <span>Avg <span className="text-slate-400 font-mono">{avgRating.toFixed(1)}</span></span>}
          <span>⚽ {totalGoals}</span>
          <span>{totalShots} shots</span>
        </div>
      </div>

      {/* Best performer callout */}
      {topRated?.rating && topRated.rating >= 7 && (
        <div className="px-3 py-1.5 bg-brand-gold/5 border-b border-brand-gold/10 flex items-center gap-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-brand-gold">Top Performer</span>
          <span className="text-[10px] text-slate-300 truncate">{topRated.name}</span>
          <RatingBadge rating={topRated.rating} />
        </div>
      )}

      {/* Player rows */}
      <div className="divide-y divide-brand-border/20">
        {shown.map(p => (
          <PlayerRow key={p.id} p={p} isTop={p.id === topRated?.id} />
        ))}
      </div>

      {sorted.length > 8 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full px-3 py-2 text-[10px] text-slate-600 hover:text-slate-400 transition-colors text-center border-t border-brand-border/30"
        >
          {expanded ? "Show less" : `+${sorted.length - 8} more`}
        </button>
      )}
    </div>
  );
}

export default function MatchPlayerStats({ matchId }: { matchId: string }) {
  const [data, setData] = useState<{ players: PlayerMatchStats[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/matches/${matchId}/players`)
      .then(r => r.json())
      .then((d: { players: PlayerMatchStats[] }) => {
        if (d.players?.length) setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [matchId]);

  if (loading) return <div className="h-32 rounded-2xl bg-brand-card border border-brand-border animate-pulse" />;
  if (!data) return null;

  const teams = [...new Set(data.players.map(p => p.team))];
  if (teams.length === 0) return null;

  const [homeTeam, awayTeam] = teams;
  const homePlayers = data.players.filter(p => p.team === homeTeam);
  const awayPlayers = data.players.filter(p => p.team === awayTeam);

  // Tournament-level highlights across both teams
  const allGoalScorers = data.players.filter(p => p.goals > 0);
  const allAssistMakers = data.players.filter(p => p.assists > 0);
  const topRated = [...data.players].filter(p => p.rating).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-brand-border">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Player Stats</span>
        <span className="text-[9px] text-slate-700 ml-auto">Sorted by rating · via api-football</span>
      </div>

      {/* Quick highlights bar */}
      {(allGoalScorers.length > 0 || allAssistMakers.length > 0 || topRated) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 border-b border-brand-border/50 bg-brand-card/50">
          {allGoalScorers.map(p => (
            <span key={p.id} className="text-[10px] text-slate-400">
              ⚽ <span className="text-slate-200 font-semibold">{p.name}</span>
              {p.goals > 1 && <span className="text-brand-green"> ×{p.goals}</span>}
            </span>
          ))}
          {allAssistMakers.map(p => (
            <span key={p.id} className="text-[10px] text-slate-500">
              🅐 <span className="text-slate-300">{p.name}</span>
            </span>
          ))}
        </div>
      )}

      {/* Two-column player lists */}
      <div className="flex divide-x divide-brand-border/50">
        <TeamSection players={homePlayers} teamName={homeTeam} />
        <TeamSection players={awayPlayers} teamName={awayTeam} isRight />
      </div>

      {/* Footer stats row */}
      <div className="grid grid-cols-2 divide-x divide-brand-border/50 border-t border-brand-border/50">
        {[homePlayers, awayPlayers].map((players, i) => {
          const totalPasses = players.reduce((s, p) => s + p.passes, 0);
          const totalTackles = players.reduce((s, p) => s + p.tackles, 0);
          const totalFouls = players.reduce((s, p) => s + p.fouls, 0);
          const totalShots = players.reduce((s, p) => s + p.shots, 0);
          const totalOnTarget = players.reduce((s, p) => s + p.shotsOnTarget, 0);
          return (
            <div key={i} className="flex items-center justify-around px-2 py-3 gap-2">
              <StatCell value={totalPasses} label="Passes" />
              <StatCell value={totalShots > 0 ? `${totalOnTarget}/${totalShots}` : "0"} label="On Target" />
              <StatCell value={totalTackles} label="Tackles" />
              <StatCell value={totalFouls} label="Fouls" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
