"use client";

import { useEffect, useState } from "react";
import { getFlag } from "@/lib/flags";
import type { GroupStanding, TeamStanding } from "@/app/api/standings/route";

interface Props {
  group: string;
}

function gdString(gd: number): string {
  if (gd > 0) return `+${gd}`;
  return String(gd);
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 animate-pulse">
      <div className="w-4 h-3 rounded bg-brand-border/40" />
      <div className="w-6 h-5 rounded bg-brand-border/40" />
      <div className="flex-1 h-3 rounded bg-brand-border/40" />
      <div className="w-24 h-3 rounded bg-brand-border/40" />
    </div>
  );
}

export default function GroupStandingsPanel({ group }: Props) {
  const [standing, setStanding] = useState<GroupStanding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(false);
        const res = await fetch("/api/standings");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: GroupStanding[] = await res.json();
        if (!cancelled) {
          const match = data.find((g) => g.group === group.toUpperCase());
          setStanding(match ?? null);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [group]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
        <div className="px-4 py-3 border-b border-brand-border animate-pulse">
          <div className="h-4 w-24 rounded bg-brand-border/40" />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (error || !standing) {
    return (
      <div className="rounded-2xl bg-brand-card border border-brand-border px-4 py-6 text-center text-slate-500 text-sm">
        {error ? "Failed to load standings" : `No standings for Group ${group}`}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-brand-border">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-gold/10 text-brand-gold text-xs font-black">
          {standing.group}
        </span>
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Group {standing.group}
        </span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[auto_1fr_repeat(6,auto)] gap-x-3 px-4 py-1.5 border-b border-brand-border/50 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
        <span className="w-4 text-center">#</span>
        <span>Team</span>
        <span className="w-5 text-center">P</span>
        <span className="w-5 text-center">W</span>
        <span className="w-5 text-center">D</span>
        <span className="w-5 text-center">L</span>
        <span className="w-7 text-center">GD</span>
        <span className="w-8 text-right">Pts</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-brand-border/30">
        {standing.teams.map((team: TeamStanding, idx: number) => {
          const isQualifying = idx < 2;
          const isBubble = idx === 2;

          return (
            <div
              key={team.tla}
              className={`relative grid grid-cols-[auto_1fr_repeat(6,auto)] gap-x-3 items-center px-4 py-2.5 transition-colors ${
                isQualifying ? "bg-brand-green/5 hover:bg-brand-green/10" :
                isBubble     ? "bg-amber-500/3 hover:bg-amber-500/7" :
                               "hover:bg-white/3"
              }`}
            >
              {isQualifying && (
                <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-brand-green rounded-r" />
              )}
              {isBubble && (
                <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-amber-500/40 rounded-r" />
              )}

              <span className="w-4 text-center text-xs font-semibold text-slate-600 tabular-nums">
                {idx + 1}
              </span>

              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base leading-none shrink-0">{team.flag}</span>
                <span className={`text-sm font-semibold truncate ${isQualifying ? "text-white" : "text-slate-300"}`}>
                  {team.name}
                </span>
                <span className="text-[10px] text-slate-600 font-mono shrink-0 hidden sm:inline">
                  {team.tla}
                </span>
              </div>

              <span className="w-5 text-center text-xs text-slate-400 tabular-nums">{team.p}</span>
              <span className="w-5 text-center text-xs text-slate-400 tabular-nums">{team.w}</span>
              <span className="w-5 text-center text-xs text-slate-400 tabular-nums">{team.d}</span>
              <span className="w-5 text-center text-xs text-slate-400 tabular-nums">{team.l}</span>
              <span className={`w-7 text-center text-xs font-medium tabular-nums ${
                team.gd > 0 ? "text-brand-green" :
                team.gd < 0 ? "text-red-400" :
                "text-slate-500"
              }`}>
                {gdString(team.gd)}
              </span>
              <span className="w-8 text-right text-sm font-black text-white tabular-nums">
                {team.pts}
              </span>
            </div>
          );
        })}
      </div>

      {standing.teams.length > 0 && (
        <div className="flex items-center gap-4 px-4 py-2 border-t border-brand-border/30 text-[10px] text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-brand-green/30 border-l-2 border-brand-green" />
            Qualifying
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/10 border-l-2 border-amber-500/50" />
            Potential play-off
          </span>
        </div>
      )}
    </div>
  );
}
