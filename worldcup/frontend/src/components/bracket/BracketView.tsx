"use client";

import { useState } from "react";
import Link from "next/link";
import FlagImg from "@/components/ui/FlagImg";
import type { BracketMatch, KnockoutRound } from "@/app/bracket/page";

interface Props {
  rounds: Record<KnockoutRound, BracketMatch[]>;
}

const ALL_ROUNDS: KnockoutRound[] = [
  "Round of 32",
  "Round of 16",
  "Quarter-finals",
  "Semi-finals",
  "3rd Place Final",
  "Final",
];

const ROUND_SHORT: Record<KnockoutRound, string> = {
  "Round of 32":    "R32",
  "Round of 16":    "R16",
  "Quarter-finals": "QF",
  "Semi-finals":    "SF",
  "3rd Place Final":"3rd",
  "Final":          "Final",
};

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

function StatusBadge({ status, elapsed }: { status: string; elapsed: number }) {
  if (status === "FT" || status === "AET" || status === "PEN") {
    return <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">FT</span>;
  }
  if (status === "LIVE" || status === "1H" || status === "2H" || status === "HT" || status === "ET") {
    return (
      <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-brand-green">
        <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse inline-block" />
        {elapsed > 0 ? `${elapsed}'` : "LIVE"}
      </span>
    );
  }
  return null;
}

function isLive(status: string): boolean {
  return ["LIVE", "1H", "2H", "HT", "ET"].includes(status);
}

function isFinished(status: string): boolean {
  return ["FT", "AET", "PEN"].includes(status);
}

function TeamRow({
  team,
  score,
  isWinner,
  showScore,
}: {
  team: { name: string; code: string; flagEmoji: string } | null;
  score: number;
  isWinner: boolean;
  showScore: boolean;
}) {
  const isTbd = !team;
  return (
    <div
      className={`flex items-center justify-between gap-2 px-3 py-2 ${
        isWinner ? "bg-brand-gold/10" : ""
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isTbd ? (
          <div className="w-6 h-4 rounded-sm bg-slate-800 shrink-0" />
        ) : (
          <FlagImg tla={team.code} size={24} className="shrink-0" />
        )}
        <span
          className={`text-xs font-semibold truncate ${
            isTbd
              ? "text-slate-600"
              : isWinner
              ? "text-brand-gold font-black"
              : "text-slate-200"
          }`}
        >
          {isTbd ? "TBD" : team.name}
        </span>
      </div>
      {showScore && !isTbd && (
        <span
          className={`text-sm font-black shrink-0 ${
            isWinner ? "text-brand-gold" : "text-slate-400"
          }`}
        >
          {score}
        </span>
      )}
    </div>
  );
}

function MatchCard({ match }: { match: BracketMatch }) {
  const finished = isFinished(match.status);
  const live = isLive(match.status);
  const showScore = finished || live;
  const isTbd = !match.homeTeam && !match.awayTeam;
  const homeWins =
    finished &&
    match.homeTeam !== null &&
    match.homeScore > match.awayScore;
  const awayWins =
    finished &&
    match.awayTeam !== null &&
    match.awayScore > match.homeScore;

  const cardContent = (
    <div
      className={`rounded-xl border overflow-hidden transition-all ${
        live
          ? "border-brand-green/40 bg-brand-card shadow-[0_0_12px_rgba(16,185,129,0.15)]"
          : isTbd
          ? "border-brand-border bg-brand-card/60 opacity-60"
          : "border-brand-border bg-brand-card hover:border-slate-600"
      }`}
    >
      {/* Status / date header */}
      <div className="px-3 pt-2 pb-1 flex items-center justify-between border-b border-brand-border">
        <span className="text-[9px] font-mono text-slate-600 truncate">{isTbd ? "TBD" : match.city}</span>
        {(live || finished) ? (
          <StatusBadge status={match.status} elapsed={match.elapsed} />
        ) : (
          <span className="text-[9px] text-slate-600">{formatDate(match.date)}</span>
        )}
      </div>

      {/* Home team */}
      <TeamRow
        team={match.homeTeam}
        score={match.homeScore}
        isWinner={homeWins}
        showScore={showScore}
      />

      {/* Divider */}
      <div className="h-px bg-brand-border mx-3" />

      {/* Away team */}
      <TeamRow
        team={match.awayTeam}
        score={match.awayScore}
        isWinner={awayWins}
        showScore={showScore}
      />
    </div>
  );

  // Make clickable only if it's a real seeded match
  if (match.fixture > 0) {
    return (
      <Link href={`/schedule/${match.fixture}`} className="block">
        {cardContent}
      </Link>
    );
  }

  return cardContent;
}

function RoundColumn({
  round,
  matches,
  highlight,
}: {
  round: KnockoutRound;
  matches: BracketMatch[];
  highlight: boolean;
}) {
  return (
    <div className="flex flex-col min-w-[180px] max-w-[200px] shrink-0">
      {/* Round header */}
      <div
        className={`mb-3 px-3 py-1.5 rounded-lg text-center ${
          highlight
            ? "bg-brand-gold/20 border border-brand-gold/40"
            : "bg-brand-card border border-brand-border"
        }`}
      >
        <div
          className={`text-[11px] font-black uppercase tracking-widest ${
            highlight ? "text-brand-gold" : "text-slate-400"
          }`}
        >
          {round}
        </div>
      </div>

      {/* Match cards stacked vertically */}
      <div className="flex flex-col gap-2">
        {matches.map((m) => (
          <MatchCard key={m.id} match={m} />
        ))}
      </div>
    </div>
  );
}

const ROUNDS_TOP_TO_BOTTOM: KnockoutRound[] = [
  "Final",
  "3rd Place Final",
  "Semi-finals",
  "Quarter-finals",
  "Round of 16",
  "Round of 32",
];

// ── Main bracket view ─────────────────────────────────────────────────────────

export default function BracketView({ rounds }: Props) {
  const [activeRound, setActiveRound] = useState<KnockoutRound>("Round of 32");

  // Detect if any round has live or completed matches (to highlight it)
  const liveRound = ALL_ROUNDS.find((r) =>
    rounds[r].some((m) => isLive(m.status))
  );
  const highlightRound = liveRound ?? null;

  return (
    <>
      {/* ── Mobile: round tabs + single column ─────────────────────────────── */}
      <div className="lg:hidden">
        {/* Tab bar */}
        <div className="flex gap-1 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {ALL_ROUNDS.map((r) => {
            const hasLive = rounds[r].some((m) => isLive(m.status));
            const hasFt = rounds[r].some((m) => isFinished(m.status) && m.fixture > 0);
            return (
              <button
                key={r}
                onClick={() => setActiveRound(r)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${
                  activeRound === r
                    ? "bg-brand-gold text-brand-dark"
                    : hasLive
                    ? "bg-brand-green/20 text-brand-green border border-brand-green/30"
                    : hasFt
                    ? "bg-brand-card text-slate-300 border border-slate-600"
                    : "bg-brand-card text-slate-500 border border-brand-border"
                }`}
              >
                {ROUND_SHORT[r]}
              </button>
            );
          })}
        </div>

        {/* Active round title */}
        <h2 className="text-lg font-black text-white mb-4">{activeRound}</h2>

        {/* Cards for selected round */}
        <div className="flex flex-col gap-3">
          {rounds[activeRound].map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      </div>

      {/* ── Desktop: top-down pyramid bracket ───────────────────────────────── */}
      <div className="hidden lg:block">
        {/* Header */}
        <div className="mb-6 text-center">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">
            FIFA World Cup 2026 · Knockout Stage
          </p>
        </div>

        {/* Rounds stacked top-to-bottom: Final → R32 */}
        <div className="space-y-6">
          {ROUNDS_TOP_TO_BOTTOM.map((r) => {
            const matches = rounds[r];
            const isHighlight = highlightRound === r;
            return (
              <div key={r}>
                {/* Round label + divider */}
                <div className="flex items-center gap-3 mb-3">
                  <h3
                    className={`text-[11px] font-black uppercase tracking-widest shrink-0 ${
                      isHighlight ? "text-brand-gold" : "text-slate-500"
                    }`}
                  >
                    {r}
                  </h3>
                  <div
                    className={`flex-1 h-px ${
                      isHighlight ? "bg-brand-gold/40" : "bg-brand-border"
                    }`}
                  />
                </div>

                {/* Match cards in a wrapping horizontal row */}
                <div className="flex flex-wrap gap-3 justify-center">
                  {matches.map((m) => (
                    <div key={m.id} className="min-w-[160px] max-w-[200px] flex-1">
                      <MatchCard match={m} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <p className="mt-6 text-center text-[10px] font-mono text-slate-700">
          Group stage concludes Jul 2 · Round of 32 begins Jul 3
        </p>
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────────── */}
      <div className="mt-8 flex items-center gap-4 text-[10px] text-slate-600 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-brand-green" />
          <span>LIVE</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded bg-brand-gold/30" />
          <span>Winner highlighted</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded bg-slate-700" />
          <span>TBD — awaiting group stage</span>
        </div>
        <div className="ml-auto text-[9px] font-mono text-slate-700">studio0x</div>
      </div>
    </>
  );
}
