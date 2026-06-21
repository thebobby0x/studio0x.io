"use client";

import { useEffect, useState } from "react";
import type { PlayerMatchStats } from "@/app/api/matches/[id]/players/route";

interface TeamPressingStats {
  name: string;
  fouls: number;
  yellows: number;
  reds: number;
  pii: number; // Pressing Intensity Index (0–100)
  label: string;
  labelColor: string;
}

function computePII(fouls: number, yellows: number, reds: number): number {
  // Weighted aggression score, normalised to ~100 scale
  // fouls = baseline pressure, yellows = hard challenge intent, reds = max aggression
  const raw = fouls * 2 + yellows * 8 + reds * 20;
  return Math.min(100, Math.round(raw));
}

function pressLabel(pii: number): { label: string; color: string } {
  if (pii >= 70) return { label: "High Press", color: "text-red-400" };
  if (pii >= 50) return { label: "Aggressive", color: "text-orange-400" };
  if (pii >= 30) return { label: "Physical", color: "text-amber-400" };
  if (pii >= 15) return { label: "Controlled", color: "text-slate-300" };
  return { label: "Passive", color: "text-slate-500" };
}

export default function PressingIntensityIndex({ matchId, homeTeamName, awayTeamName }: {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
}) {
  const [home, setHome] = useState<TeamPressingStats | null>(null);
  const [away, setAway] = useState<TeamPressingStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/matches/${matchId}/players`)
      .then(r => r.json())
      .then((data: { players?: PlayerMatchStats[] }) => {
        const players = data.players ?? [];

        const agg = (teamName: string) => {
          const squad = players.filter(p => p.team === teamName);
          const fouls = squad.reduce((s, p) => s + (p.fouls ?? 0), 0);
          const yellows = squad.filter(p => p.yellowCard).length;
          const reds = squad.filter(p => p.redCard).length;
          const pii = computePII(fouls, yellows, reds);
          const { label, color } = pressLabel(pii);
          return { name: teamName, fouls, yellows, reds, pii, label, labelColor: color };
        };

        setHome(agg(homeTeamName));
        setAway(agg(awayTeamName));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [matchId, homeTeamName, awayTeamName]);

  if (loading) return <div className="h-28 rounded-2xl bg-brand-card border border-brand-border animate-pulse" />;
  if (!home || !away || (home.fouls === 0 && away.fouls === 0)) return null;

  const maxPII = Math.max(home.pii, away.pii, 1);

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Pressing Intensity Index™</span>
          <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
        </div>
        <span className="text-[9px] text-slate-500 uppercase tracking-wider">Fouls · cards · aggression</span>
      </div>

      <div className="px-4 py-4 space-y-3">
        {[home, away].map((t) => (
          <div key={t.name} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 truncate max-w-[140px]">{t.name}</span>
              <div className="flex items-center gap-3 text-[10px] text-slate-500 shrink-0">
                <span>{t.fouls} fouls</span>
                {t.yellows > 0 && <span className="text-amber-400">🟨 {t.yellows}</span>}
                {t.reds > 0 && <span className="text-red-400">🟥 {t.reds}</span>}
                <span className={`font-black ${t.labelColor}`}>{t.label}</span>
              </div>
            </div>
            <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-red-500 transition-all"
                style={{ width: `${(t.pii / maxPII) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-slate-700 font-mono tabular-nums">
              <span>PII {t.pii}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-brand-border/50 px-4 py-2 flex justify-between text-[9px] text-slate-700">
        <span>Passive</span>
        <span>Controlled</span>
        <span>Physical</span>
        <span>Aggressive</span>
        <span>High Press</span>
      </div>
    </div>
  );
}
