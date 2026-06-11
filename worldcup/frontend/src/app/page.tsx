export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { Trophy, Wifi } from "lucide-react";
import LiveMatchCard from "@/components/match/LiveMatchCard";
import SentimentTickers from "@/components/sentiment/SentimentTickers";
import AnthemPlayer from "@/components/anthem/AnthemPlayer";
import type { Match, AudioStream } from "@/lib/types";
import { prisma } from "@/lib/prisma";

async function getInitialData() {
  try {
    const [matches, streams] = await Promise.all([
      prisma.match.findMany({ include: { homeTeam: true, awayTeam: true }, orderBy: { date: "asc" } }),
      prisma.audioStream.findMany({ include: { team: true } }),
    ]);
    return { matches: matches as unknown as Match[], streams: streams as unknown as AudioStream[] };
  } catch {
    return { matches: [], streams: [] };
  }
}

export default async function DashboardPage() {
  const { matches, streams } = await getInitialData();
  const liveMatch = matches.find((m) => ["LIVE", "NS", "HT"].includes(m.status)) ?? matches[0];

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-brand-border bg-brand-dark/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Trophy size={20} className="text-brand-gold" />
            <span className="font-bold text-white tracking-tight">Studio0x</span>
            <span className="text-brand-border">·</span>
            <span className="text-sm text-slate-400">World Cup 2026</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Wifi size={12} className="text-brand-green" />
            <span>Live data feed active</span>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            FIFA World Cup 2026 <span className="text-brand-gold">Stats Engine</span>
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Real-time match telemetry · prediction market signals · team anthems
          </p>
        </div>

        {liveMatch ? (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 live-dot" />
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Opening Match · Group A
                </span>
              </div>
              <Suspense fallback={<div className="h-80 rounded-2xl bg-brand-card border border-brand-border animate-pulse" />}>
                <LiveMatchCard matchId={liveMatch.id} />
              </Suspense>
              <Suspense fallback={<div className="h-28 rounded-xl bg-brand-card border border-brand-border animate-pulse" />}>
                <SentimentTickers matchId={liveMatch.id} />
              </Suspense>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Anthem Hub</span>
              </div>
              <AnthemPlayer streams={streams} />
              <Suspense fallback={null}>
                <LineupCard matchId={liveMatch.id} />
              </Suspense>
            </div>
          </div>
        ) : (
          <div className="text-center py-20 text-slate-500">
            <Trophy size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg font-semibold">No matches loaded.</p>
          </div>
        )}
      </main>

      <footer className="mt-16 border-t border-brand-border py-8 text-center text-xs text-slate-600">
        Studio0x.io · World Cup 2026 Stats Engine · V1 MVP · Data refreshes every 5 seconds
      </footer>
    </div>
  );
}

async function LineupCard({ matchId }: { matchId: string }) {
  try {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: { include: { homePlayers: true } },
        awayTeam: { include: { homePlayers: true } },
      },
    });
    if (!match) return null;

    const positions = ["GK", "DEF", "MID", "FWD"];
    const sides = [
      { team: match.homeTeam.name, players: match.homeTeam.homePlayers },
      { team: match.awayTeam.name, players: match.awayTeam.homePlayers },
    ];

    return (
      <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
        <div className="px-4 py-3 border-b border-brand-border text-xs font-semibold uppercase tracking-widest text-slate-500">
          Starting Lineups
        </div>
        <div className="grid grid-cols-2 divide-x divide-brand-border">
          {sides.map((side) => (
            <div key={side.team} className="p-3">
              <div className="text-xs font-bold text-white mb-2">{side.team}</div>
              {positions.map((pos) => {
                const pp = (side.players as Array<{ id: string; number: number; name: string; position: string }>).filter((p) => p.position === pos);
                if (!pp.length) return null;
                return (
                  <div key={pos} className="mb-2">
                    <div className="text-[10px] text-slate-600 uppercase mb-1">{pos}</div>
                    {pp.map((p: { number: number; name: string; id: string }) => (
                      <div key={p.number} className="flex items-center gap-1.5 text-xs text-slate-300 py-0.5">
                        <span className="text-[10px] text-slate-600 w-4 text-right">{p.number}</span>
                        <span>{p.name}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  } catch {
    return null;
  }
}
