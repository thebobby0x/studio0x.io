"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play, Pause, SkipBack, SkipForward, Music2 } from "lucide-react";
import { useAudio } from "@/lib/AudioContext";
import { getFlag } from "@/lib/flags";

// ── Types ──────────────────────────────────────────────────────────────────

interface LiveMatch {
  id: string;
  fixture: number;
  homeScore: number;
  awayScore: number;
  elapsed: number;
  status: string;
  homeTeam: { name: string; flagEmoji: string; code: string };
  awayTeam: { name: string; flagEmoji: string; code: string };
}

interface ScheduleMatch {
  id: number;
  utcDate: string;
  status: "NS" | "LIVE" | "HT" | "FT";
  homeTeam: { name: string; tla: string };
  awayTeam: { name: string; tla: string };
  homeScore: number | null;
  awayScore: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatCountdown(msUntil: number): string {
  const totalSecs = Math.floor(msUntil / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

// ── Left section — Live score / recent + next ──────────────────────────────

function LiveSection({ liveMatch }: { liveMatch: LiveMatch | null }) {
  const minute =
    liveMatch?.status === "HT"
      ? "HT"
      : liveMatch
        ? `${liveMatch.elapsed}'`
        : "";

  if (liveMatch) {
    return (
      <Link
        href={`/schedule/${liveMatch.fixture}`}
        className="flex items-center gap-2.5 min-w-0 hover:opacity-80 transition-opacity"
      >
        <span className="flex items-center gap-1.5 shrink-0 bg-red-500/15 px-2.5 py-1 rounded-full">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-black text-red-400 uppercase tracking-widest">LIVE</span>
        </span>
        <span className="flex items-center gap-2 text-lg sm:text-xl text-slate-200 font-medium">
          <span className="text-2xl">{liveMatch.homeTeam.flagEmoji}</span>
          <span className="font-black text-white tabular-nums">
            {liveMatch.homeScore}–{liveMatch.awayScore}
          </span>
          <span className="text-2xl">{liveMatch.awayTeam.flagEmoji}</span>
        </span>
        <span className="text-sm text-red-400 font-mono font-bold shrink-0">{minute}</span>
      </Link>
    );
  }

  return <RecentAndNextChips />;
}

function RecentAndNextChips() {
  const [recent, setRecent] = useState<ScheduleMatch | null>(null);
  const [next, setNext] = useState<ScheduleMatch | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/schedule");
        if (!res.ok) return;
        const matches: ScheduleMatch[] = await res.json();

        const finished = matches.filter(
          (m) => m.status === "FT" && m.homeScore !== null
        );
        const upcoming = matches.filter((m) => m.status === "NS");

        // Most recent FT: latest utcDate
        const sortedFinished = [...finished].sort(
          (a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime()
        );
        setRecent(sortedFinished[0] ?? null);

        // Next NS: soonest utcDate
        const sortedUpcoming = [...upcoming].sort(
          (a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime()
        );
        setNext(sortedUpcoming[0] ?? null);
      } catch { /* ignore */ }
    }
    load();
  }, []);

  // Tick every minute to keep countdown fresh
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!recent && !next) return null;

  const nextMs = next ? new Date(next.utcDate).getTime() - now : Infinity;
  const isImminent = nextMs < 60 * 60 * 1000; // < 60 min

  return (
    <div className="flex items-center gap-3 min-w-0">
      {recent && (
        <Link
          href={`/schedule/${recent.id}`}
          className="flex items-center gap-1.5 text-sm sm:text-base text-slate-400 hover:text-slate-200 transition-colors shrink-0"
        >
          <span className="text-xl">{getFlag(recent.homeTeam.tla)}</span>
          <span className="text-slate-200 font-bold tabular-nums">
            {recent.homeScore}–{recent.awayScore}
          </span>
          <span className="text-xl">{getFlag(recent.awayTeam.tla)}</span>
          <span className="ml-0.5 text-[10px] font-bold text-slate-500 uppercase">FT</span>
        </Link>
      )}
      {recent && next && (
        <span className="text-slate-700">·</span>
      )}
      {next && nextMs > 0 && (
        <Link
          href={`/schedule/${next.id}`}
          className={`flex items-center gap-1.5 text-sm sm:text-base font-medium hover:opacity-80 transition-opacity shrink-0 ${
            isImminent ? "text-amber-400" : "text-slate-300"
          }`}
        >
          <span className="text-xl">{getFlag(next.homeTeam.tla)}</span>
          <span className="text-slate-500 text-xs">vs</span>
          <span className="text-xl">{getFlag(next.awayTeam.tla)}</span>
          <span className="ml-0.5 text-xs font-semibold opacity-90">{formatCountdown(nextMs)}</span>
        </Link>
      )}
    </div>
  );
}

// ── Right section — Mini audio player ─────────────────────────────────────

function AudioSection() {
  const { current, isPlaying, togglePlay, next, prev } = useAudio();

  if (!current) {
    return (
      <Link
        href="/anthems"
        className="flex items-center gap-2 text-sm sm:text-base font-semibold text-brand-gold hover:text-amber-300 transition-colors shrink-0 bg-brand-gold/10 px-3.5 py-1.5 rounded-full border border-brand-gold/20"
      >
        <Music2 size={16} />
        <span>Team Anthems</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2.5 shrink-0 min-w-0 bg-white/5 pl-3 pr-2 py-1.5 rounded-full border border-brand-border/60">
      <span className="text-sm sm:text-base text-slate-200 font-semibold truncate max-w-[140px] flex items-center gap-1.5">
        <span className="text-lg">{current.flagEmoji}</span>
        {truncate(current.title, 16)}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={prev}
          aria-label="Previous track"
          className="text-slate-400 hover:text-white transition-colors"
        >
          <SkipBack size={15} fill="currentColor" />
        </button>
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="w-7 h-7 rounded-full bg-brand-green text-brand-dark flex items-center justify-center hover:bg-green-400 transition-colors"
        >
          {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
        </button>
        <button
          onClick={next}
          aria-label="Next track"
          className="text-slate-400 hover:text-white transition-colors"
        >
          <SkipForward size={15} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────

export default function LiveMatchBanner() {
  const [liveMatch, setLiveMatch] = useState<LiveMatch | null>(null);
  const [hasContent, setHasContent] = useState(false);
  const { current: audioTrack } = useAudio();

  useEffect(() => {
    async function loadLive() {
      try {
        const res = await fetch("/api/live");
        if (res.ok) {
          const data: LiveMatch | null = await res.json();
          setLiveMatch(data);
        }
      } catch { /* ignore */ }
    }
    loadLive();
    const id = setInterval(loadLive, 15_000);
    return () => clearInterval(id);
  }, []);

  // Show the strip once schedule data or live data has been attempted
  useEffect(() => {
    setHasContent(true);
  }, []);

  if (!hasContent) return null;

  return (
    <div className="bg-brand-dark/95 border-b border-brand-border/50 w-full">
      <div className="max-w-7xl mx-auto flex justify-between items-center px-4 h-16 gap-4">
        {/* Left: live score or recent/upcoming chips */}
        <LiveSection liveMatch={liveMatch} />

        {/* Right: mini audio player */}
        <AudioSection />
      </div>
    </div>
  );
}
