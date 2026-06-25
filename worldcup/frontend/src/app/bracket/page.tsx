export const dynamic = "force-dynamic";

import AppNav from "@/components/ui/AppNav";
import BracketView from "@/components/bracket/BracketView";
import { prisma } from "@/lib/prisma";
import { GitBranch } from "lucide-react";

// ── Round classification by date ──────────────────────────────────────────────
// Match model has no `round` field, so we classify by date ranges:
//   Round of 32    → Jul 3–5 2026
//   Round of 16    → Jul 6–9 2026
//   Quarter-finals → Jul 10–11 2026
//   Semi-finals    → Jul 14 2026
//   3rd Place      → Jul 17 2026
//   Final          → Jul 19 2026

export type KnockoutRound =
  | "Round of 32"
  | "Round of 16"
  | "Quarter-finals"
  | "Semi-finals"
  | "3rd Place Final"
  | "Final";

export interface BracketMatch {
  id: string;
  fixture: number;
  date: string;
  status: string;
  elapsed: number;
  homeTeam: { name: string; code: string; flagEmoji: string } | null;
  awayTeam: { name: string; code: string; flagEmoji: string } | null;
  homeScore: number;
  awayScore: number;
  venue: string;
  city: string;
  round: KnockoutRound;
}

const KNOCKOUT_START = new Date("2026-07-03T00:00:00Z");

const ROUND_DATES: { round: KnockoutRound; from: Date; to: Date }[] = [
  { round: "Round of 32",    from: new Date("2026-07-03T00:00:00Z"), to: new Date("2026-07-05T23:59:59Z") },
  { round: "Round of 16",    from: new Date("2026-07-06T00:00:00Z"), to: new Date("2026-07-09T23:59:59Z") },
  { round: "Quarter-finals", from: new Date("2026-07-10T00:00:00Z"), to: new Date("2026-07-11T23:59:59Z") },
  { round: "Semi-finals",    from: new Date("2026-07-14T00:00:00Z"), to: new Date("2026-07-14T23:59:59Z") },
  { round: "3rd Place Final",from: new Date("2026-07-17T00:00:00Z"), to: new Date("2026-07-17T23:59:59Z") },
  { round: "Final",          from: new Date("2026-07-19T00:00:00Z"), to: new Date("2026-07-19T23:59:59Z") },
];

function classifyRound(date: Date): KnockoutRound | null {
  for (const entry of ROUND_DATES) {
    if (date >= entry.from && date <= entry.to) return entry.round;
  }
  return null;
}

// Expected match counts per round (WC 2026 48-team format)
const ROUND_SIZES: Record<KnockoutRound, number> = {
  "Round of 32":    16,
  "Round of 16":    8,
  "Quarter-finals": 4,
  "Semi-finals":    2,
  "3rd Place Final":1,
  "Final":          1,
};

const ALL_ROUNDS: KnockoutRound[] = [
  "Round of 32",
  "Round of 16",
  "Quarter-finals",
  "Semi-finals",
  "3rd Place Final",
  "Final",
];

async function fetchKnockoutMatches(): Promise<Record<KnockoutRound, BracketMatch[]>> {
  let dbMatches: BracketMatch[] = [];

  try {
    const matches = await prisma.match.findMany({
      where: { date: { gte: KNOCKOUT_START } },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { date: "asc" },
    });

    dbMatches = matches.flatMap((m) => {
      const round = classifyRound(m.date);
      if (!round) return [];
      return [{
        id: m.id,
        fixture: m.fixture,
        date: m.date.toISOString(),
        status: m.status,
        elapsed: m.elapsed,
        homeTeam: m.homeTeam.code === "TBD" ? null : { name: m.homeTeam.name, code: m.homeTeam.code, flagEmoji: m.homeTeam.flagEmoji },
        awayTeam: m.awayTeam.code === "TBD" ? null : { name: m.awayTeam.name, code: m.awayTeam.code, flagEmoji: m.awayTeam.flagEmoji },
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        venue: m.venue,
        city: m.city,
        round,
      }];
    });
  } catch {
    // DB unavailable — will show all TBD
  }

  // Group by round, filling up to expected size with TBD placeholder entries
  const grouped: Record<KnockoutRound, BracketMatch[]> = {} as Record<KnockoutRound, BracketMatch[]>;

  for (const round of ALL_ROUNDS) {
    const roundMatches = dbMatches.filter((m) => m.round === round);
    const size = ROUND_SIZES[round];

    while (roundMatches.length < size) {
      const slotIndex = roundMatches.length;
      roundMatches.push({
        id: `tbd-${round}-${slotIndex}`,
        fixture: 0,
        date: ROUND_DATES.find((r) => r.round === round)!.from.toISOString(),
        status: "NS",
        elapsed: 0,
        homeTeam: null,
        awayTeam: null,
        homeScore: 0,
        awayScore: 0,
        venue: "TBD",
        city: "TBD",
        round,
      });
    }

    grouped[round] = roundMatches;
  }

  return grouped;
}

export default async function BracketPage() {
  const rounds = await fetchKnockoutMatches();
  const now = new Date();
  const isPreKnockout = now < KNOCKOUT_START;
  const daysUntil = Math.ceil((KNOCKOUT_START.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  // Count how many group-stage matches are still NS (not yet played)
  const groupMatchesRemaining = await prisma.match.count({
    where: { date: { lt: KNOCKOUT_START }, status: "NS" },
  }).catch(() => 0);

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      <AppNav />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <GitBranch size={22} className="text-brand-gold" />
            <h1 className="text-3xl font-black text-white tracking-tight">
              Knockout <span className="text-brand-gold">Bracket</span>
            </h1>
          </div>
          <p className="text-slate-500 text-sm">
            FIFA World Cup 2026 · Round of 32 through the Final · July 3–19
          </p>
        </div>

        {isPreKnockout && (
          <div className="rounded-2xl bg-brand-card border border-brand-gold/20 px-5 py-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-gold/10 flex items-center justify-center shrink-0">
                <GitBranch size={18} className="text-brand-gold" />
              </div>
              <div>
                <div className="font-black text-white text-sm">
                  Bracket Locks In {daysUntil === 1 ? "Tomorrow" : `In ${daysUntil} Days`}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {groupMatchesRemaining > 0
                    ? `${groupMatchesRemaining} group-stage matches remaining · qualified teams revealed June 25–26`
                    : "Group stage complete · bracket draws underway · slots confirmed July 3"}
                </div>
              </div>
            </div>
            <div className="sm:ml-auto shrink-0">
              <div className="text-right">
                <div className="text-2xl font-black text-brand-gold tabular-nums">Jul 3</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">R32 kick-off</div>
              </div>
            </div>
          </div>
        )}

        <BracketView rounds={rounds} />
      </main>

      <footer className="mt-16 border-t border-brand-border py-8 text-center text-xs text-slate-600">
        Studio0x.io · World Cup 2026 Stats Engine · Bracket data via api-football.com
      </footer>
    </div>
  );
}
