"use client";

import { useEffect, useState } from "react";
import { Crosshair, Zap, Trophy } from "lucide-react";
import { getFlag } from "@/lib/flags";
import ShareButton from "@/components/ui/ShareButton";

// ─────────────────────────────────────────────────────────────────────────────
// Tournament Player Boards (owner 7/19) — the debate engine. Golden Boot,
// Playmakers, Clutch Scorers, aggregated from REAL goal events (provenance in
// the footer). Gold bars = leaders; slate = the chasing pack; flags = pride.
// ─────────────────────────────────────────────────────────────────────────────

interface BoardRow { player: string; team: string; tla: string; value: number; penalties?: number }
interface Boards {
  goldenBoot: BoardRow[];
  playmakers: BoardRow[];
  clutch: BoardRow[];
  coverage: { matches: number; withEvents: number };
  generatedAt: string;
}

function Board({
  title,
  icon,
  rows,
  unit,
  shareLabel,
}: {
  title: string;
  icon: React.ReactNode;
  rows: BoardRow[];
  unit: string;
  shareLabel: string;
}) {
  if (rows.length === 0) return null;
  const max = rows[0]?.value ?? 1;
  const shareText = `${shareLabel}: ${rows.slice(0, 3).map((r, i) => `${i + 1}. ${r.player} (${r.tla}) ${r.value}`).join(" · ")} · podiumMetrics by studio0x`;
  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      <div className="px-4 py-3 border-b border-brand-border flex items-center gap-2">
        {icon}
        <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">{title}</span>
        <span className="ml-auto"><ShareButton text={shareText} /></span>
      </div>
      <div className="p-3 space-y-1.5">
        {rows.map((r, i) => (
          <div key={`${r.player}-${r.tla}`} className="flex items-center gap-2.5">
            <span className={`w-5 text-right text-[11px] font-black tabular-nums ${i === 0 ? "text-brand-gold" : "text-slate-600"}`}>{i + 1}</span>
            <span className="text-base leading-none shrink-0">{getFlag(r.tla)}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-sm truncate ${i === 0 ? "font-black text-white" : "font-semibold text-slate-300"}`}>{r.player}</span>
                <span className="text-sm font-black text-white tabular-nums shrink-0">
                  {r.value}
                  {r.penalties ? <span className="text-[10px] text-slate-500 font-semibold ml-1">({r.penalties} pen)</span> : null}
                </span>
              </div>
              <div className="h-1 rounded-full bg-brand-dark/80 mt-1 overflow-hidden">
                <div className={`h-full rounded-full ${i === 0 ? "bg-brand-gold" : "bg-slate-600/60"}`} style={{ width: `${Math.max(6, (r.value / max) * 100)}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 pb-2 text-[9px] text-slate-700">{unit}</div>
    </div>
  );
}

export default function TournamentBoards() {
  const [boards, setBoards] = useState<Boards | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/stats/boards")
      .then((r) => r.json())
      .then((j) => { if (alive) { setBoards(j.boards ?? null); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl bg-brand-card border border-brand-border p-6 text-sm text-slate-500">
        Building the tournament boards from real goal events…
      </div>
    );
  }
  if (!boards || boards.goldenBoot.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xl font-black text-white">
          Tournament <span className="text-brand-gold">Player Boards</span>
        </h2>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Who owned this tournament? Settle it — every number below is a real goal from a real match.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Board
          title="Golden Boot Race"
          icon={<Trophy size={14} className="text-brand-gold" />}
          rows={boards.goldenBoot}
          unit="goals scored (own goals excluded)"
          shareLabel="World Cup 2026 Golden Boot race"
        />
        <Board
          title="Playmakers"
          icon={<Crosshair size={14} className="text-brand-gold" />}
          rows={boards.playmakers}
          unit="assists"
          shareLabel="World Cup 2026 assist kings"
        />
        <Board
          title="Clutch Scorers"
          icon={<Zap size={14} className="text-brand-gold" />}
          rows={boards.clutch}
          unit="goals scored in the 80th minute or later"
          shareLabel="World Cup 2026 clutch scorers (80'+)"
        />
      </div>
      <div className="text-[9px] text-slate-700 font-mono">
        studio0x · aggregated from real api-football goal events across {boards.coverage.withEvents} of {boards.coverage.matches} finished matches · unconfirmed goals never counted
      </div>
    </div>
  );
}
