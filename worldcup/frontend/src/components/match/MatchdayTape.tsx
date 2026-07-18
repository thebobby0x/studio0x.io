"use client";

import { useEffect, useState } from "react";
import { Swords, TrendingUp } from "lucide-react";
import { getFlag } from "@/lib/flags";

// ─────────────────────────────────────────────────────────────────────────────
// Matchday Tale of the Tape (owner 7/18) — side-by-side full-tournament
// numbers for today's featured game, mirrored around a center spine.
// Color discipline: HOME green · AWAY gold · slate labels (duel pattern).
// Facts only — the feel/IT layer is the Roundtable's clearly-labeled opinion.
// ─────────────────────────────────────────────────────────────────────────────

interface TapeSide {
  name: string; tla: string;
  played: number; wins: number; draws: number; losses: number;
  goalsFor: number; goalsAgainst: number; cleanSheets: number;
  biggestWin: string | null; form: string; titleProb: number | null;
}

function FormChips({ form }: { form: string }) {
  return (
    <span className="inline-flex gap-1">
      {form.split("").map((r, i) => (
        <span
          key={i}
          className={`w-4 h-4 rounded text-[9px] font-black flex items-center justify-center ${
            r === "W" ? "bg-brand-green/20 text-brand-green" : r === "L" ? "bg-red-500/20 text-red-400" : "bg-slate-700/40 text-slate-400"
          }`}
        >
          {r}
        </span>
      ))}
    </span>
  );
}

function MirrorRow({ label, home, away, max }: { label: string; home: number; away: number; max: number }) {
  const w = (v: number) => (max > 0 ? Math.max(4, (v / max) * 100) : 4);
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div className="flex items-center gap-2 justify-end">
        <span className="text-sm font-black text-white tabular-nums">{home}</span>
        <div className="h-2 rounded-full bg-brand-green/80" style={{ width: `${w(home)}%`, maxWidth: "100%" }} />
      </div>
      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 w-24 text-center shrink-0">{label}</span>
      <div className="flex items-center gap-2">
        <div className="h-2 rounded-full bg-brand-gold/80" style={{ width: `${w(away)}%`, maxWidth: "100%" }} />
        <span className="text-sm font-black text-white tabular-nums">{away}</span>
      </div>
    </div>
  );
}

export default function MatchdayTape({ fixture, stageLabel }: { fixture: number; stageLabel: string }) {
  const [tape, setTape] = useState<{ home: TapeSide; away: TapeSide } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/matchday/tape?fixture=${fixture}`)
      .then((r) => r.json())
      .then((j) => { if (alive) setTape(j.tape ?? null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [fixture]);

  if (!tape) return null;
  const { home, away } = tape;
  const showMarket = home.titleProb !== null || away.titleProb !== null;
  const pct = (p: number | null) => (p === null ? "—" : `${Math.round(p * 100)}%`);

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      <div className="px-4 py-3 border-b border-brand-border flex items-center gap-2">
        <Swords size={15} className="text-brand-gold shrink-0" />
        <span className="text-xs font-black uppercase tracking-widest text-brand-gold">Tale of the Tape</span>
        <span className="text-[10px] text-slate-600 uppercase tracking-widest">· {stageLabel} · entire tournament</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Team headers */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="text-right">
            <div className="text-lg font-black text-white leading-tight">{getFlag(home.tla)} {home.name}</div>
            <div className="mt-1 flex justify-end"><FormChips form={home.form} /></div>
          </div>
          <span className="text-[10px] font-black text-slate-600 uppercase px-2">vs</span>
          <div>
            <div className="text-lg font-black text-white leading-tight">{away.name} {getFlag(away.tla)}</div>
            <div className="mt-1"><FormChips form={away.form} /></div>
          </div>
        </div>

        {/* Mirrored stat rows */}
        <div className="space-y-2.5">
          <MirrorRow label="Wins" home={home.wins} away={away.wins} max={Math.max(home.wins, away.wins)} />
          <MirrorRow label="Goals scored" home={home.goalsFor} away={away.goalsFor} max={Math.max(home.goalsFor, away.goalsFor)} />
          <MirrorRow label="Conceded" home={home.goalsAgainst} away={away.goalsAgainst} max={Math.max(home.goalsAgainst, away.goalsAgainst)} />
          <MirrorRow label="Clean sheets" home={home.cleanSheets} away={away.cleanSheets} max={Math.max(home.cleanSheets, away.cleanSheets)} />
        </div>

        {/* Biggest wins */}
        {(home.biggestWin || away.biggestWin) && (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[11px] text-slate-400">
            <span className="text-right">{home.biggestWin ?? "—"}</span>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 w-24 text-center shrink-0">Biggest win</span>
            <span>{away.biggestWin ?? "—"}</span>
          </div>
        )}

        {/* Prediction market strip */}
        {showMarket && (
          <div className="rounded-xl bg-brand-dark/60 border border-brand-border px-3 py-2.5 flex items-center gap-2 text-[11px]">
            <TrendingUp size={12} className="text-slate-500 shrink-0" />
            <span className="text-slate-500 uppercase tracking-widest text-[9px] font-black shrink-0">The markets say</span>
            <span className="text-slate-300 ml-auto tabular-nums">
              title chance · <span className="text-brand-green font-bold">{home.tla} {pct(home.titleProb)}</span>
              <span className="text-slate-600 mx-1">·</span>
              <span className="text-brand-gold font-bold">{away.tla} {pct(away.titleProb)}</span>
            </span>
          </div>
        )}
      </div>

      <div className="px-4 py-2 border-t border-brand-border text-[9px] text-slate-700 font-mono">
        studio0x · all numbers computed from real tournament results{showMarket ? " · title probabilities quoted from Polymarket" : ""}
      </div>
    </div>
  );
}
