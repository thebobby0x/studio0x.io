"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import type { ScheduleMatch } from "@/app/api/schedule/route";

interface TeamRisk {
  tla: string;
  name: string;
  group: string;
  position: number;
  pts: number;
  played: number;
  remaining: number;
  maxPossible: number;
  danger: "Safe" | "Pressure" | "Critical" | "Eliminated";
  dangerScore: number; // 0–100
}

function computeElimRisk(matches: ScheduleMatch[]): TeamRisk[] {
  // Build group standings
  const groupTeams = new Map<string, Map<string, { name: string; pts: number; played: number; gd: number }>>();

  const allGroups = new Set(matches.map(m => m.group).filter(Boolean) as string[]);

  for (const g of allGroups) {
    groupTeams.set(g, new Map());
  }

  const groupMatchCount = new Map<string, number>();

  for (const m of matches) {
    if (!m.group) continue;
    const groupMap = groupTeams.get(m.group)!;

    const ensure = (tla: string, name: string) => {
      if (!groupMap.has(tla)) groupMap.set(tla, { name, pts: 0, played: 0, gd: 0 });
    };
    ensure(m.homeTeam.tla, m.homeTeam.name);
    ensure(m.awayTeam.tla, m.awayTeam.name);

    if (m.status === "FT") {
      const h = groupMap.get(m.homeTeam.tla)!;
      const a = groupMap.get(m.awayTeam.tla)!;
      const hg = m.homeScore ?? 0;
      const ag = m.awayScore ?? 0;
      h.played++; h.gd += hg - ag;
      a.played++; a.gd += ag - hg;
      if (hg > ag) { h.pts += 3; }
      else if (hg < ag) { a.pts += 3; }
      else { h.pts++; a.pts++; }
      groupMatchCount.set(m.group, (groupMatchCount.get(m.group) ?? 0) + 1);
    }
  }

  const result: TeamRisk[] = [];

  for (const [group, teamMap] of groupTeams) {
    const sorted = [...teamMap.entries()]
      .map(([tla, d]) => ({ tla, ...d }))
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd);

    const totalGroupGames = 6; // 4 teams × 3 games / 2
    const playedGroupGames = groupMatchCount.get(group) ?? 0;
    const maxGamesPerTeam = 3;

    sorted.forEach((t, idx) => {
      const position = idx + 1;
      const remaining = maxGamesPerTeam - t.played;
      const maxPossible = t.pts + remaining * 3;

      const danger: TeamRisk["danger"] =
        t.played === 3 && position >= 3 ? "Eliminated" :
        position >= 3 && remaining === 0 ? "Eliminated" :
        position === 4 && remaining === 1 && t.pts < 3 ? "Critical" :
        position >= 3 && remaining <= 1 ? "Pressure" :
        position <= 2 && t.pts >= 6 ? "Safe" :
        "Pressure";

      const dangerScore =
        danger === "Eliminated" ? 100 :
        danger === "Critical"   ? 80 :
        danger === "Pressure"   ? 50 :
        Math.max(0, 30 - t.pts * 5);

      result.push({ tla: t.tla, name: t.name, group, position, pts: t.pts, played: t.played, remaining, maxPossible, danger, dangerScore });
    });

    // If fewer than 4 teams have data, add unseen teams from match data
    if (sorted.length < 4) {
      for (const m of matches) {
        if (m.group !== group) continue;
        for (const side of [m.homeTeam, m.awayTeam]) {
          if (!result.find(r => r.tla === side.tla)) {
            result.push({ tla: side.tla, name: side.name, group, position: sorted.length + 1, pts: 0, played: 0, remaining: 3, maxPossible: 9, danger: "Pressure", dangerScore: 20 });
          }
        }
      }
    }
  }

  return result.sort((a, b) => b.dangerScore - a.dangerScore || a.group.localeCompare(b.group));
}

const DANGER_CONFIG = {
  Eliminated: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", bar: "bg-red-500" },
  Critical:   { icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30", bar: "bg-orange-500" },
  Pressure:   { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30", bar: "bg-amber-500" },
  Safe:       { icon: CheckCircle, color: "text-brand-green", bg: "bg-brand-green/5 border-brand-green/20", bar: "bg-brand-green" },
};

export default function EliminationProximity({ group, limit = 8 }: { group?: string; limit?: number }) {
  const [teams, setTeams] = useState<TeamRisk[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/schedule")
      .then(r => r.json())
      .then((matches: ScheduleMatch[]) => {
        let risks = computeElimRisk(matches);
        if (group) risks = risks.filter(r => r.group === group);
        setTeams(risks.slice(0, limit));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [group, limit]);

  if (loading) return <div className="h-32 rounded-2xl bg-brand-card border border-brand-border animate-pulse" />;
  if (teams.length === 0) return null;

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Elimination Proximity™</span>
          <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
        </div>
        <span className="text-[9px] text-slate-500 uppercase tracking-wider">
          {group ? `Group ${group}` : "All groups"} · Danger index
        </span>
      </div>

      <div className="divide-y divide-brand-border/40">
        {teams.map(t => {
          const cfg = DANGER_CONFIG[t.danger];
          const Icon = cfg.icon;
          return (
            <Link
              key={t.tla}
              href={`/team/${t.tla}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/3 transition-colors"
            >
              <span className="text-[10px] font-mono text-slate-600 w-5 shrink-0">G{t.group}</span>
              <span className={`text-[10px] font-black w-4 tabular-nums shrink-0 ${t.position <= 2 ? "text-brand-green" : "text-slate-500"}`}>
                #{t.position}
              </span>
              <span className="text-xs font-semibold text-slate-200 flex-1 min-w-0 truncate">{t.name}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] text-slate-500 font-mono">{t.pts}pt</span>
                <span className="text-[10px] text-slate-600">·</span>
                <span className="text-[10px] text-slate-500">{t.remaining} left</span>
              </div>
              <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden shrink-0">
                <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${t.dangerScore}%` }} />
              </div>
              <div className={`flex items-center gap-1 text-[10px] font-bold shrink-0 ${cfg.color}`}>
                <Icon size={10} />
                <span className="hidden sm:inline">{t.danger}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
