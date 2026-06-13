"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Activity, Clock, MapPin, Wifi, Users } from "lucide-react";
import type { LiveData } from "@/lib/types";
import { getVenueInfo, venueCity } from "@/lib/venues";

const METRIC_LABELS: Record<string, string> = {
  possession:   "Possession %",
  shots_on:     "Shots On Target",
  shots_off:    "Shots Off Target",
  corners:      "Corners",
  fouls:        "Fouls",
  yellow_cards: "Yellow Cards",
  red_cards:    "Red Cards",
};

function StatBar({ label, homeVal, awayVal }: { label: string; homeVal: number; awayVal: number }) {
  const total = homeVal + awayVal || 1;
  const homeW = Math.round((homeVal / total) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-slate-400">
        <span className="font-semibold text-white">{homeVal}</span>
        <span className="text-slate-400">{label}</span>
        <span className="font-semibold text-white">{awayVal}</span>
      </div>
      <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-brand-border">
        <div className="bg-brand-green transition-all duration-700" style={{ width: `${homeW}%` }} />
        <div className="bg-amber-500 transition-all duration-700" style={{ width: `${100 - homeW}%` }} />
      </div>
    </div>
  );
}

export default function LiveMatchCard({ matchId }: { matchId: string }) {
  const [data, setData] = useState<LiveData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/matches/${matchId}/live`);
      if (!res.ok) throw new Error("API error");
      setData(await res.json());
    } catch (e) {
      setError(String(e));
    }
  }, [matchId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  if (error) return <div className="rounded-xl bg-brand-card border border-red-800/40 p-6 text-red-400">Error: {error}</div>;
  if (!data) return <div className="rounded-xl bg-brand-card border border-brand-border p-6 animate-pulse h-64" />;

  const { match, metrics, dataSources } = data;
  const homeCode = match.homeTeam.code;
  const awayCode = match.awayTeam.code;
  const hm = metrics[homeCode] ?? {};
  const am = metrics[awayCode] ?? {};
  const isLive = match.status === "LIVE" || match.status === "HT";
  const isDone = match.status === "FT";

  const city = venueCity(match.venue, match.city);
  const venueInfo = getVenueInfo(match.venue);
  const capacityStr = venueInfo ? venueInfo.capacity.toLocaleString() : null;

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-green/20 via-transparent to-amber-500/20 p-4 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <MapPin size={14} />
            {match.venue && match.venue !== "World Cup Stadium" ? (
              <span>{match.venue}{city ? `, ${city}` : ""}</span>
            ) : (
              <span className="text-slate-600">Venue TBD</span>
            )}
          </div>
          {capacityStr && match.venue !== "World Cup Stadium" && (
            <div className="flex items-center gap-1.5 text-[10px] text-slate-600 ml-5">
              <Users size={10} />
              <span>Capacity {capacityStr} · Est. sold out</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLive && <span className="w-2 h-2 rounded-full bg-red-500 live-dot" />}
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isLive ? "bg-red-500/20 text-red-400" : isDone ? "bg-slate-700 text-slate-400" : "bg-slate-700 text-slate-300"}`}>
            {match.status === "LIVE" ? `${match.elapsed}'` : match.status}
          </span>
          {isLive ? (
            <span className="flex items-center gap-1 text-[10px] text-brand-green font-semibold">
              <Wifi size={10} /> LIVE
            </span>
          ) : isDone ? (
            <span className="text-[10px] text-slate-500 font-semibold">Latest</span>
          ) : (
            <span className="text-[10px] text-amber-500 font-semibold">Upcoming</span>
          )}
        </div>
      </div>

      {/* Scoreboard */}
      <div className="px-4 py-8">
        <div className="grid grid-cols-3 items-center gap-2">
          {/* Home team */}
          <Link href={`/team/${homeCode}`} className="text-center group block">
            <div className="text-4xl sm:text-5xl mb-2">{match.homeTeam.flagEmoji}</div>
            <div className="font-bold text-base sm:text-lg text-white group-hover:text-brand-gold transition-colors leading-tight">{match.homeTeam.name}</div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">{homeCode}</div>
          </Link>

          {/* Score */}
          <div className="text-center">
            <div className="text-5xl sm:text-6xl font-black text-white tabular-nums tracking-tighter leading-none">
              {match.homeScore}<span className="text-brand-border mx-1 sm:mx-2">–</span>{match.awayScore}
            </div>
            <div suppressHydrationWarning className="flex items-center justify-center gap-1 mt-2 text-xs text-slate-500">
              <Clock size={12} />
              <span>{new Date(match.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            </div>
          </div>

          {/* Away team */}
          <Link href={`/team/${awayCode}`} className="text-center group block">
            <div className="text-4xl sm:text-5xl mb-2">{match.awayTeam.flagEmoji}</div>
            <div className="font-bold text-base sm:text-lg text-white group-hover:text-brand-gold transition-colors leading-tight">{match.awayTeam.name}</div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">{awayCode}</div>
          </Link>
        </div>
      </div>

      {/* Stats bars */}
      {dataSources?.stats !== "sim" && Object.keys(hm).length > 0 && (
        <div className="px-6 pb-6 space-y-3">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
            <Activity size={12} />
            <span>Live Stats</span>
            <div className="flex items-center gap-1 ml-auto">
              <span className="w-2 h-2 rounded-sm bg-brand-green" /><span className="mr-2 text-slate-400">{match.homeTeam.name}</span>
              <span className="w-2 h-2 rounded-sm bg-amber-500" /><span className="text-slate-400">{match.awayTeam.name}</span>
            </div>
          </div>
          {Object.entries(METRIC_LABELS).map(([key, label]) => {
            const hv = hm[key as keyof typeof hm] ?? 0;
            const av = am[key as keyof typeof am] ?? 0;
            return <StatBar key={key} label={label} homeVal={Number(hv)} awayVal={Number(av)} />;
          })}
        </div>
      )}
    </div>
  );
}
