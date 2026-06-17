"use client";

import { useEffect, useState } from "react";
import type { LineupsResponse, PlayerEntry, SubstitutionEvent } from "@/app/api/matches/[id]/lineups/route";

const POS_ORDER = ["G", "D", "M", "F"];
const POS_LABEL: Record<string, string> = { G: "GK", D: "DEF", M: "MID", F: "FWD" };

function groupByPosition(players: PlayerEntry[]) {
  const groups = new Map<string, PlayerEntry[]>();
  for (const p of players) {
    const pos = p.position?.[0] ?? "F";
    if (!groups.has(pos)) groups.set(pos, []);
    groups.get(pos)!.push(p);
  }
  return groups;
}

function TeamColumn({
  side,
  subs,
  align,
}: {
  side: LineupsResponse["home"];
  subs: SubstitutionEvent[];
  align: "left" | "right";
}) {
  const grouped = groupByPosition(side.starters);
  const teamSubs = subs.filter(s => s.team === side.team);

  return (
    <div className={`flex-1 min-w-0 ${align === "right" ? "text-right" : ""}`}>
      <div className={`flex items-center gap-2 mb-3 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <span className="text-xs font-black text-white">{side.team}</span>
        {side.formation && (
          <span className="text-[10px] font-mono text-brand-gold border border-brand-gold/30 rounded px-1.5 py-0.5">
            {side.formation}
          </span>
        )}
      </div>

      {/* Starters by position */}
      {POS_ORDER.map(pos => {
        const pp = grouped.get(pos) ?? [];
        if (!pp.length) return null;
        return (
          <div key={pos} className="mb-2.5">
            <div className={`text-[9px] text-slate-600 uppercase tracking-widest mb-1 ${align === "right" ? "text-right" : ""}`}>
              {POS_LABEL[pos]}
            </div>
            {pp.map(p => (
              <div key={p.id} className={`flex items-center gap-1.5 py-0.5 ${align === "right" ? "flex-row-reverse" : ""}`}>
                <span className="text-[10px] text-slate-600 tabular-nums w-4 text-center font-mono">{p.number}</span>
                <span className="text-xs text-slate-300 truncate">{p.name}</span>
              </div>
            ))}
          </div>
        );
      })}

      {/* Substitutes */}
      {side.subs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-brand-border/40">
          <div className={`text-[9px] text-slate-600 uppercase tracking-widest mb-1 ${align === "right" ? "text-right" : ""}`}>
            Substitutes
          </div>
          {side.subs.map(p => {
            const subEvent = teamSubs.find(s => s.playerIn === p.name);
            return (
              <div key={p.id} className={`flex items-center gap-1.5 py-0.5 ${align === "right" ? "flex-row-reverse" : ""}`}>
                <span className="text-[10px] text-slate-700 tabular-nums w-4 text-center font-mono">{p.number}</span>
                <span className="text-[11px] text-slate-500 truncate flex-1">{p.name}</span>
                {subEvent && (
                  <span className="text-[9px] text-brand-green font-mono shrink-0">↑{subEvent.minute}&apos;</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function MatchLineups({ matchId }: { matchId: string }) {
  const [data, setData] = useState<LineupsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/matches/${matchId}/lineups`)
      .then(r => r.json())
      .then((d: LineupsResponse) => {
        if (d.home?.starters?.length || d.away?.starters?.length) setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [matchId]);

  if (loading) return <div className="h-32 rounded-2xl bg-brand-card border border-brand-border animate-pulse" />;
  if (!data) return null;

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-brand-border">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Lineups</span>
        <span className="text-[9px] text-slate-700 ml-auto">Starting XI + subs</span>
      </div>

      <div className="grid grid-cols-2 divide-x divide-brand-border/50 px-4 py-4 gap-4">
        <TeamColumn side={data.home} subs={data.substitutions} align="left" />
        <div className="pl-4">
          <TeamColumn side={data.away} subs={data.substitutions} align="right" />
        </div>
      </div>
    </div>
  );
}
