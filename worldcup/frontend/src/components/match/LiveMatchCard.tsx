"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Activity, Clock, MapPin, Wifi, Users } from "lucide-react";
import type { LiveData } from "@/lib/types";
import type { GoalEvent } from "@/app/api/matches/[id]/goals/route";
import { getVenueInfo, venueCity } from "@/lib/venues";
import VenueWeather from "@/components/ui/VenueWeather";
import MatchDNA from "@/components/stats/MatchDNA";
import FlagImg from "@/components/ui/FlagImg";

const METRIC_LABELS: Record<string, string> = {
  possession:   "Possession %",
  shots_on:     "Shots On Target",
  shots_off:    "Shots Off Target",
  corners:      "Corners",
  fouls:        "Fouls",
  yellow_cards: "Yellow Cards",
  red_cards:    "Red Cards",
};

function GoalDisplay({ goals, homeTeam, awayTeam }: {
  goals: GoalEvent[];
  homeTeam: string;
  awayTeam: string;
}) {
  if (goals.length === 0) return null;

  const homeGoals = goals.filter((g) => !g.isOwnGoal ? g.team === homeTeam : g.team !== homeTeam);
  const awayGoals = goals.filter((g) => !g.isOwnGoal ? g.team === awayTeam : g.team !== awayTeam);

  function formatGoal(g: GoalEvent): string {
    const minute = `${g.minute}'`;
    if (g.isOwnGoal) {
      return `OG ⚽ ${minute} (${g.scorer})`;
    }
    const suffix = g.isPenalty ? " (pen)" : "";
    return `${g.scorer}${suffix} ⚽ ${minute}`;
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 px-4 pb-3 text-xs text-slate-400">
      <div className="flex flex-col items-end gap-0.5">
        {homeGoals.map((g, i) => (
          <span key={i}>{formatGoal(g)}</span>
        ))}
      </div>
      <div className="flex flex-col items-start gap-0.5">
        {awayGoals.map((g, i) => (
          <span key={i}>{formatGoal(g)}</span>
        ))}
      </div>
    </div>
  );
}

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

export default function LiveMatchCard({ matchId, hero }: { matchId: string; hero?: boolean }) {
  const [data, setData] = useState<LiveData | null>(null);
  const [goals, setGoals] = useState<GoalEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [liveRes, goalsRes] = await Promise.all([
        fetch(`/api/matches/${matchId}/live`),
        fetch(`/api/matches/${matchId}/goals`),
      ]);
      if (!liveRes.ok) throw new Error("API error");
      const [liveData, goalsData] = await Promise.all([
        liveRes.json(),
        goalsRes.ok ? goalsRes.json() : Promise.resolve({ goals: [] }),
      ]);
      setData(liveData);
      setGoals(goalsData.goals ?? []);
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
  const showGoals = (isLive || isDone) && goals && goals.length > 0;

  const city = venueCity(match.venue, match.city);
  const venueInfo = getVenueInfo(match.venue);
  const capacityStr = venueInfo ? venueInfo.capacity.toLocaleString() : null;

  if (hero && isLive) {
    return (
      <div className="rounded-2xl overflow-hidden border border-red-900/50" style={{
        background: "linear-gradient(135deg, #0f1a0f 0%, #0d0d0d 40%, #1a0d0d 100%)",
        boxShadow: "0 0 60px rgba(239,68,68,0.12), 0 0 120px rgba(34,197,94,0.06)",
      }}>
        {/* LIVE banner */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 font-black text-sm tracking-widest uppercase">Live</span>
            <span className="text-red-300/60 font-black text-sm tabular-nums">{match.elapsed}&apos;</span>
            {match.status === "HT" && <span className="text-amber-400 text-xs font-bold ml-1">· Half Time</span>}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <MapPin size={11} />
            <span>{match.venue !== "World Cup Stadium" ? city || match.venue : "Live"}</span>
            {capacityStr && match.venue !== "World Cup Stadium" && (
              <span className="hidden sm:inline">· cap. {capacityStr}</span>
            )}
            {venueInfo && (
              <VenueWeather lat={venueInfo.lat} lng={venueInfo.lng} timezone={venueInfo.timezone} />
            )}
          </div>
        </div>

        {/* Big scoreboard */}
        <div className="px-4 py-6">
          <div className="grid grid-cols-3 items-center gap-2">
            <Link href={`/team/${homeCode}`} className="text-center group">
              <div className="flex justify-center mb-3"><FlagImg tla={homeCode} size={72} className="shadow-lg" /></div>
              <div className="font-black text-lg sm:text-xl text-white group-hover:text-brand-gold transition-colors leading-tight">{match.homeTeam.name}</div>
              <div className="text-xs text-slate-600 uppercase tracking-wider mt-0.5">{homeCode}</div>
            </Link>

            <div className="text-center">
              <div className="text-7xl sm:text-8xl font-black tabular-nums tracking-tighter leading-none text-white" style={{ textShadow: "0 0 40px rgba(255,255,255,0.15)" }}>
                {match.homeScore}
                <span className="text-slate-700 mx-1">–</span>
                {match.awayScore}
              </div>
              <div className="mt-3 flex items-center justify-center gap-1.5">
                <Wifi size={11} className="text-brand-green" />
                <span className="text-[11px] text-brand-green font-semibold">Updating live</span>
              </div>
            </div>

            <Link href={`/team/${awayCode}`} className="text-center group">
              <div className="flex justify-center mb-3"><FlagImg tla={awayCode} size={72} className="shadow-lg" /></div>
              <div className="font-black text-lg sm:text-xl text-white group-hover:text-brand-gold transition-colors leading-tight">{match.awayTeam.name}</div>
              <div className="text-xs text-slate-600 uppercase tracking-wider mt-0.5">{awayCode}</div>
            </Link>
          </div>
        </div>

        {/* Goal scorers */}
        {showGoals && (
          <GoalDisplay
            goals={goals}
            homeTeam={match.homeTeam.name}
            awayTeam={match.awayTeam.name}
          />
        )}

        {/* Match DNA™ */}
        {(isLive || isDone) && goals && (
          <div className="px-4 pb-4">
            <MatchDNA
              goals={goals}
              homeTeamName={match.homeTeam.name}
              awayTeamName={match.awayTeam.name}
              homeTeamCode={homeCode}
              matchStatus={match.status}
              currentMinute={match.elapsed}
            />
          </div>
        )}

        {/* Stats bars if available */}
        {dataSources?.stats !== "sim" && Object.keys(hm).length > 0 && (
          <div className="px-6 pb-5 pt-2 border-t border-white/5 space-y-3">
            <div className="flex items-center gap-2 text-[10px] text-slate-500 mb-3">
              <Activity size={11} />
              <span>Live Stats</span>
              <div className="flex items-center gap-1 ml-auto">
                <span className="w-2 h-2 rounded-sm bg-brand-green" /><span className="mr-2 text-slate-400">{homeCode}</span>
                <span className="w-2 h-2 rounded-sm bg-amber-500" /><span className="text-slate-400">{awayCode}</span>
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
          {venueInfo && (
            <div className="ml-5">
              <VenueWeather lat={venueInfo.lat} lng={venueInfo.lng} timezone={venueInfo.timezone} />
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
            <div className="flex justify-center mb-2"><FlagImg tla={homeCode} size={56} className="shadow-md" /></div>
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
            <div className="flex justify-center mb-2"><FlagImg tla={awayCode} size={56} className="shadow-md" /></div>
            <div className="font-bold text-base sm:text-lg text-white group-hover:text-brand-gold transition-colors leading-tight">{match.awayTeam.name}</div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">{awayCode}</div>
          </Link>
        </div>
      </div>

      {/* Goal scorers */}
      {showGoals && (
        <GoalDisplay
          goals={goals}
          homeTeam={match.homeTeam.name}
          awayTeam={match.awayTeam.name}
        />
      )}

      {/* Match DNA™ */}
      {(isLive || isDone) && goals && goals.length > 0 && (
        <div className="px-4 pb-4">
          <MatchDNA
            goals={goals}
            homeTeamName={match.homeTeam.name}
            awayTeamName={match.awayTeam.name}
            homeTeamCode={homeCode}
            matchStatus={match.status}
            currentMinute={match.elapsed}
          />
        </div>
      )}

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
