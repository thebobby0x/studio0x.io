"use client";

import { useEffect, useState, useCallback } from "react";
import { Activity } from "lucide-react";
import { SegmentedVersusBar } from "@/components/ui/SegmentedBar";

interface LiveProbs { home: number; draw: number; away: number }

interface LiveData {
  match: { homeTeam: { name: string; code: string }; awayTeam: { name: string; code: string }; status: string; elapsed: number };
  liveProbs: LiveProbs | null;
  tournamentOdds: { home: number | null; away: number | null };
}

function ProbSegment({ prob, tone, label }: { prob: number; tone: "cyan" | "red" | "neutral"; label: string }) {
  const style = tone === "neutral"
    ? undefined
    : { color: `var(--seg-${tone})`, textShadow: `0 0 10px rgb(var(--seg-${tone}-glow) / .7)` };
  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      <div
        className={`s0x-data text-2xl font-bold tabular-nums ${tone === "neutral" ? "text-s0x-muted" : ""}`}
        style={style}
      >
        {Math.round(prob * 100)}%
      </div>
      <div className="s0x-mono text-[9px] text-s0x-muted truncate">{label}</div>
    </div>
  );
}

export default function LiveWinMeter({ matchId }: { matchId: string }) {
  const [probs, setProbs] = useState<LiveProbs | null>(null);
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [status, setStatus] = useState("NS");
  const [source, setSource] = useState<"polymarket" | "unavailable">("unavailable");
  const [homeTournament, setHomeTournament] = useState<number | null>(null);
  const [awayTournament, setAwayTournament] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/matches/${matchId}/live`);
      if (!res.ok) return;
      const data = await res.json() as LiveData;
      if (data.liveProbs) setProbs(data.liveProbs);
      setHomeTeam(data.match.homeTeam.name);
      setAwayTeam(data.match.awayTeam.name);
      setStatus(data.match.status);
      setSource((data as unknown as { dataSources?: { probs?: string } }).dataSources?.probs === "polymarket" ? "polymarket" : "unavailable");
      setHomeTournament(data.tournamentOdds?.home ?? null);
      setAwayTournament(data.tournamentOdds?.away ?? null);
    } catch {
      // ignore
    }
  }, [matchId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  if (source === "unavailable" || !probs || status === "FT") return null;

  const isLive = status === "LIVE" || status === "HT";

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <Activity size={13} className={isLive ? "text-red-400" : "text-slate-500"} />
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            {isLive ? "Live Win Probability" : "Pre-Match Win Probability"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isLive && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
          <span className="text-[10px] text-slate-500 font-semibold">Polymarket</span>
          {isLive && <span className="text-[10px] text-slate-600">+ score model</span>}
        </div>
      </div>

      {/* Three-way probability */}
      <div className="px-6 py-5">
        <div className="grid grid-cols-3 gap-4 items-center">
          <ProbSegment prob={probs.home} tone="cyan" label={homeTeam} />
          <ProbSegment prob={probs.draw} tone="neutral" label="Draw" />
          <ProbSegment prob={probs.away} tone="red" label={awayTeam} />
        </div>

        {/* Visual bar */}
        <div className="mt-4">
          {/* normalize={false}: home and away are literal shares of the track, so
              the unlit middle band is exactly the DRAW probability. */}
          <SegmentedVersusBar
            home={probs.home * 100}
            away={probs.away * 100}
            normalize={false}
            homeLabel={`${Math.round(probs.home * 100)}%`}
            awayLabel={`${Math.round(probs.away * 100)}%`}
            segments={28}
            height={16}
            circuit
            ariaLabel={`Win probability: ${homeTeam} ${Math.round(probs.home * 100)}%, draw ${Math.round(probs.draw * 100)}%, ${awayTeam} ${Math.round(probs.away * 100)}%`}
          />
        </div>
      </div>

      {/* Tournament odds context */}
      {(homeTournament !== null || awayTournament !== null) && (
        <div className="border-t border-brand-border/50 px-6 py-3 flex justify-between text-[10px] text-slate-600">
          <span>{homeTeam} tournament win odds: <span className="text-slate-400 font-semibold">{homeTournament !== null ? `${Math.round(homeTournament * 100)}%` : "—"}</span></span>
          <span>{awayTeam} tournament win odds: <span className="text-slate-400 font-semibold">{awayTournament !== null ? `${Math.round(awayTournament * 100)}%` : "—"}</span></span>
        </div>
      )}
    </div>
  );
}
