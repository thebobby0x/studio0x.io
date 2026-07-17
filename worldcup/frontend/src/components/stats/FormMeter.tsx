"use client";

import { useEffect, useState } from "react";
import InfoTip from "@/components/ui/InfoTip";
import Link from "next/link";
import type { ScheduleMatch } from "@/app/api/schedule/route";

interface FormEntry {
  result: "W" | "D" | "L";
  score: string;
  opponent: string;
  opponentTla: string;
  matchId: number;
}

function getTeamForm(matches: ScheduleMatch[], tla: string): FormEntry[] {
  return matches
    .filter(m => m.status === "FT" && (m.homeTeam.tla === tla || m.awayTeam.tla === tla))
    .sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime())
    .slice(0, 5)
    .map(m => {
      const isHome = m.homeTeam.tla === tla;
      const gs = isHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0);
      const gc = isHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0);
      const opp = isHome ? m.awayTeam : m.homeTeam;
      const result: "W" | "D" | "L" = gs > gc ? "W" : gs < gc ? "L" : "D";
      return { result, score: `${gs}–${gc}`, opponent: opp.name, opponentTla: opp.tla, matchId: m.id };
    })
    .reverse();
}

const RESULT_STYLES = {
  W: { bg: "bg-brand-green", text: "text-white", bar: "bg-brand-green" },
  D: { bg: "bg-amber-500", text: "text-black", bar: "bg-amber-500" },
  L: { bg: "bg-red-500", text: "text-white", bar: "bg-red-500" },
};

export default function FormMeter({ teamTla, teamName }: { teamTla: string; teamName: string }) {
  const [form, setForm] = useState<FormEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/schedule")
      .then(r => r.json())
      .then((matches: ScheduleMatch[]) => {
        setForm(getTeamForm(matches, teamTla));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [teamTla]);

  if (loading) return <div className="h-24 rounded-2xl bg-brand-card border border-brand-border animate-pulse" />;
  if (form.length === 0) return null;

  const pts = form.reduce((s, f) => s + (f.result === "W" ? 3 : f.result === "D" ? 1 : 0), 0);
  const wins = form.filter(f => f.result === "W").length;
  const formStr = form.map(f => f.result).join("");
  const streakLabel =
    formStr.endsWith("WWW") ? "On Fire 🔥" :
    formStr.endsWith("LLL") ? "Struggling" :
    formStr.endsWith("WW")  ? "Good Form" :
    formStr.endsWith("LL")  ? "Poor Form" : "Inconsistent";

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Form Meter™</span>
          <InfoTip metric="formMeter" />
          <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
        </div>
        <span className="text-[9px] text-slate-500 uppercase tracking-wider">{teamName} · last {form.length}</span>
      </div>

      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-3">
          {form.map((f, i) => (
            <Link key={i} href={`/schedule/${f.matchId}`} className="flex flex-col items-center gap-1 group">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black transition-opacity group-hover:opacity-80 ${RESULT_STYLES[f.result].bg} ${RESULT_STYLES[f.result].text}`}>
                {f.result}
              </div>
              <span className="text-[9px] text-slate-600 font-mono tabular-nums">{f.score}</span>
            </Link>
          ))}
          <div className="ml-auto text-right shrink-0">
            <div className="text-2xl font-black text-white tabular-nums">{pts}</div>
            <div className="text-[9px] text-slate-600 uppercase tracking-wider">pts</div>
          </div>
        </div>

        <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden mb-2">
          {form.map((f, i) => (
            <div key={i} className={`flex-1 ${RESULT_STYLES[f.result].bar}`} />
          ))}
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-500">
          <span>{wins}/{form.length} wins</span>
          <span className={pts >= form.length * 2 ? "text-brand-green" : pts <= form.length ? "text-red-400" : "text-slate-400"}>
            {streakLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
