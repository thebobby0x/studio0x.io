"use client";

import { useEffect, useState, useCallback } from "react";
import { Trophy, Wifi } from "lucide-react";
import { getFlag } from "@/lib/flags";
import { KNOCKOUT_START } from "@/lib/tournament";
import { SPORT } from "@/lib/sportConfig";
import type { TournamentWinnerMarket } from "@/lib/polymarket";
import type { ScheduleMatch } from "@/app/api/schedule/route";

interface TournamentData {
  markets: TournamentWinnerMarket[];
  totalLiquidity: number;
  source: "live" | "cache";
}

// Context line per team (owner 7/9 #7): their real tournament situation —
// next fixture, or how/where they went out. Derived from results only; a team
// whose last knockout tie went to penalties gets no claim until the winner
// appears in a later fixture (we don't store shootout scores).
function teamContext(tla: string, schedule: ScheduleMatch[]): string | null {
  if (schedule.length === 0) return null;
  const mine = schedule.filter(
    (m) => m.homeTeam.tla === tla || m.awayTeam.tla === tla
  );
  if (mine.length === 0) return null;

  const next = mine
    .filter((m) => m.status === "NS")
    .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())[0];
  if (next) {
    const opp = next.homeTeam.tla === tla ? next.awayTeam.tla : next.homeTeam.tla;
    return `Next: vs ${opp} \u00b7 ${next.stageLabel}`;
  }

  const koGames = mine
    .filter((m) => m.status === "FT" && new Date(m.utcDate) >= KNOCKOUT_START)
    .sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime());
  const last = koGames[0];
  if (last && last.homeScore !== null && last.awayScore !== null) {
    if (last.homeScore === last.awayScore) return null; // pens - winner unknown to us
    const won =
      (last.homeTeam.tla === tla) === (last.homeScore > last.awayScore);
    return won ? `Won ${last.stageLabel} \u2014 awaiting next draw` : `Out \u2014 ${last.stageLabel}`;
  }
  // Knockouts underway and the team never appeared in one -> out in groups
  if (new Date() >= KNOCKOUT_START) return "Out \u2014 group stage";
  return null;
}

function ProbBar({ prob, max, featured }: { prob: number; max: number; featured: boolean }) {
  const w = max > 0 ? (prob / max) * 100 : 0;
  return (
    <div className="h-1 bg-s0x-border rounded-full overflow-hidden flex-1">
      {/* Riptide is the default data color; the featured team's bar goes Rosa. */}
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          featured ? "bg-s0x-ink shadow-glow-rosa" : "bg-s0x-teal/80"
        }`}
        style={{ width: `${w}%` }}
      />
    </div>
  );
}

const NO_MARKET_NOTE = SPORT.odds.tournamentSlug
  ? `No live winner market for the ${SPORT.eventName} right now. Odds appear here as soon as the market is trading.`
  : `${SPORT.eventName} has no winner market on ${SPORT.odds.provider}. We show nothing rather than another competition's prices.`;

interface Props {
  highlightTlas?: string[];
  limit?: number;
}

export default function TournamentOddsPanel({ highlightTlas = [], limit = 16 }: Props) {
  const [data, setData] = useState<TournamentData | null>(null);
  const [schedule, setSchedule] = useState<ScheduleMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [res, schedRes] = await Promise.all([
        fetch("/api/tournament-odds"),
        fetch("/api/schedule").catch(() => null),
      ]);
      if (schedRes?.ok) setSchedule(await schedRes.json() as ScheduleMatch[]);
      if (!res.ok) { setLoading(false); return; }
      setData(await res.json() as TournamentData);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 300_000); // 5 min — these move slowly
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return (
      <div className="s0x-card p-4 space-y-2 animate-pulse">
        {[1,2,3,4,5,6].map(i => (
          <div key={i} className="h-8 rounded-lg bg-s0x-border/50" />
        ))}
      </div>
    );
  }

  // No market for this competition. Polymarket lists a World Cup winner market
  // and no Leagues Cup one, so this used to render the OTHER tournament's odds
  // (Spain, England, France… at WC26's settled prices) on a club competition.
  // The slug is config-driven now and null here, so say so plainly instead of
  // collapsing to an empty panel under a "Tournament Odds" heading.
  if (!data || data.markets.length === 0) {
    return (
      <div className="s0x-card p-4">
        <div className="text-[11px] font-black uppercase tracking-widest text-s0x-text/60 mb-1">
          No market listed
        </div>
        <div className="text-xs text-s0x-text/50 leading-relaxed">
          {NO_MARKET_NOTE}
        </div>
      </div>
    );
  }

  const displayCount = expanded ? data.markets.length : limit;
  const visible = data.markets.slice(0, displayCount);
  const maxProb = data.markets[0]?.probability ?? 1;
  const highlightSet = new Set(highlightTlas.map(t => t.toUpperCase()));

  return (
    // Odds table: full monospace, alternating Noir 800 / Noir 900 rows,
    // Riptide for the data values, Rosa for the featured (highlighted) team.
    <div className="s0x-card s0x-table overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-s0x-border">
        <div className="flex items-center gap-2.5">
          <Trophy size={13} className="text-s0x-ink" />
          <span className="s0x-eyebrow">Tournament Winner Odds</span>
        </div>
        <span className="s0x-mono flex items-center gap-1.5 text-[9px] px-2 py-0.5 rounded-full bg-s0x-teal/10 border border-s0x-teal/30 text-s0x-teal font-semibold">
          <Wifi size={9} /> Polymarket
        </span>
      </div>

      <div>
        {visible.map((m, i) => {
          const isHighlighted = m.tla ? highlightSet.has(m.tla.toUpperCase()) : false;
          const flag = m.tla ? getFlag(m.tla) : "🏳";
          return (
            <div
              key={m.team}
              className={`s0x-row flex items-center gap-3 px-4 py-2.5 transition-colors ${
                isHighlighted ? "!bg-s0x-ink/12" : ""
              }`}
            >
              <span className="s0x-data text-s0x-muted text-xs w-5 text-right">{i + 1}</span>
              <span className="text-base w-6 text-center">{flag}</span>
              <span className="flex-1 min-w-0">
                <span
                  className={`s0x-data block text-[13px] font-semibold truncate ${
                    isHighlighted ? "text-s0x-accent" : "text-s0x-text/85"
                  }`}
                >
                  {m.team}
                </span>
                {m.tla && teamContext(m.tla.toUpperCase(), schedule) && (
                  <span className="s0x-mono block text-[8px] text-s0x-muted truncate mt-0.5">
                    {teamContext(m.tla.toUpperCase(), schedule)}
                  </span>
                )}
              </span>
              <ProbBar prob={m.probability} max={maxProb} featured={isHighlighted} />
              <span
                className={`s0x-data w-12 text-right text-sm font-bold ${
                  isHighlighted ? "s0x-feat s0x-neon-rosa" : "s0x-pos"
                }`}
              >
                {Math.round(m.probability * 100)}%
              </span>
            </div>
          );
        })}
      </div>

      {data.markets.length > limit && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="s0x-mono w-full px-4 py-2.5 text-[9px] text-s0x-muted hover:text-s0x-accent transition-colors border-t border-s0x-border text-center"
        >
          {expanded ? `Show fewer` : `Show all ${data.markets.length} teams ↓`}
        </button>
      )}

      <div className="s0x-mono px-4 py-2 border-t border-s0x-border text-[8px] text-s0x-muted">
        {data.markets.length} teams · polymarket.com · updates every 5 min
      </div>
    </div>
  );
}
