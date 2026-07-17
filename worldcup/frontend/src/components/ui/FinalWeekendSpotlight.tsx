"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, Medal } from "lucide-react";
import { getFlag } from "@/lib/flags";

// ─────────────────────────────────────────────────────────────────────────────
// Final Weekend spotlight (owner request 7/17) — a time-boxed showcase for the
// tournament's last two games. Auto-expires after Jul 20 (parent gates render).
// States per fixture: countdown (NS) → LIVE strip → result. When the FINAL goes
// FT, the whole card becomes the champions crowning — winner resolved through
// pens (penHome/penAway) when the score is level after extra time.
// Color discipline: gold = showcase/champions, red = live dot, slate = info.
// ─────────────────────────────────────────────────────────────────────────────

export interface SpotlightFixture {
  id: number;
  utcDate: string;
  status: "NS" | "LIVE" | "HT" | "FT";
  minute: number;
  home: { name: string; tla: string };
  away: { name: string; tla: string };
  homeScore: number | null;
  awayScore: number | null;
  penHome: number | null;
  penAway: number | null;
  matchId?: string; // DB id for the match-page link, when known
}

function useCountdown(target: string): string {
  const calc = () => {
    const ms = new Date(target).getTime() - Date.now();
    if (ms <= 0) return "";
    const d = Math.floor(ms / 86_400_000);
    const h = Math.floor((ms % 86_400_000) / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  };
  const [text, setText] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setText(calc()), 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return text;
}

function winnerOf(f: SpotlightFixture): { name: string; tla: string } | null {
  if (f.status !== "FT" || f.homeScore === null || f.awayScore === null) return null;
  if (f.homeScore > f.awayScore) return f.home;
  if (f.awayScore > f.homeScore) return f.away;
  if (f.penHome !== null && f.penAway !== null && f.penHome !== f.penAway) {
    return f.penHome > f.penAway ? f.home : f.away;
  }
  return null; // level and no shootout data (shouldn't persist long)
}

function scoreline(f: SpotlightFixture): string {
  const base = `${f.home.tla} ${f.homeScore}–${f.awayScore} ${f.away.tla}`;
  return f.penHome !== null && f.penAway !== null
    ? `${base} (${f.penHome}–${f.penAway} pens)`
    : base;
}

function FixtureRow({ f, label }: { f: SpotlightFixture; label: string }) {
  const countdown = useCountdown(f.utcDate);
  const isLive = f.status === "LIVE" || f.status === "HT";
  const dt = new Date(f.utcDate);
  const href = f.matchId ? `/schedule/${f.matchId}` : "/schedule";

  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-2xl border border-brand-border bg-brand-dark/60 px-4 py-3 hover:border-brand-gold/40 transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-[9px] font-black uppercase tracking-widest text-brand-gold shrink-0 w-16">{label}</span>
        <span className="font-bold text-white text-sm truncate">
          {getFlag(f.home.tla)} {f.home.name}
          <span className="text-slate-500 font-medium mx-1.5">v</span>
          {getFlag(f.away.tla)} {f.away.name}
        </span>
      </div>
      <div className="text-right shrink-0">
        {isLive ? (
          <span className="flex items-center gap-1.5 text-xs font-bold text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {f.homeScore}–{f.awayScore} · {f.status === "HT" ? "HT" : `${f.minute}'`}
          </span>
        ) : f.status === "FT" ? (
          <span className="text-xs font-black text-white">{scoreline(f)}</span>
        ) : (
          <span className="text-xs text-slate-400" suppressHydrationWarning>
            {countdown && <span className="text-brand-gold font-bold">{countdown}</span>}
            <span className="text-slate-600"> · </span>
            {dt.toLocaleDateString("en-US", { weekday: "short" })}{" "}
            {dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function FinalWeekendSpotlight({
  third,
  final,
}: {
  third: SpotlightFixture | null;
  final: SpotlightFixture | null;
}) {
  if (!third && !final) return null;

  const champion = final ? winnerOf(final) : null;

  // ── Champions crowned ──────────────────────────────────────────────────────
  if (champion && final) {
    return (
      <div className="rounded-3xl border border-brand-gold/40 bg-gradient-to-b from-brand-gold/15 via-brand-card to-brand-card overflow-hidden">
        <div className="px-6 py-8 text-center space-y-3">
          <Trophy size={40} className="mx-auto text-brand-gold" />
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-gold">
            Champions of the 2026 tournament
          </div>
          <div className="text-4xl sm:text-5xl font-black text-white tracking-tight">
            {getFlag(champion.tla)} {champion.name}
          </div>
          <div className="text-sm text-slate-400 font-semibold">Final · {scoreline(final)}</div>
          {third && third.status === "FT" && (
            <div className="text-xs text-slate-500 flex items-center justify-center gap-1.5">
              <Medal size={12} className="text-slate-400" /> 3rd Place · {scoreline(third)}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── The Final Weekend showcase ─────────────────────────────────────────────
  return (
    <div className="rounded-3xl border border-brand-gold/30 bg-brand-card overflow-hidden">
      <div className="px-5 pt-4 pb-1 flex items-center gap-2">
        <Trophy size={14} className="text-brand-gold" />
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-gold">
          The Final Weekend
        </span>
        <span className="text-[10px] text-slate-600 uppercase tracking-widest ml-auto">
          Two games decide everything
        </span>
      </div>
      <div className="p-4 pt-3 space-y-2">
        {third && <FixtureRow f={third} label="3rd Place" />}
        {final && <FixtureRow f={final} label="The Final" />}
      </div>
    </div>
  );
}
