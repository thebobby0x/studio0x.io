"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
        className="flex items-center gap-1.5 min-w-0 hover:opacity-80 transition-opacity"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
        <span className="text-[10px] font-black text-red-400 uppercase tracking-widest shrink-0">
          LIVE
        </span>
        <span className="text-[11px] text-slate-300 font-medium">
          {liveMatch.homeTeam.flagEmoji}&nbsp;
          <span className="font-black text-white">
            {liveMatch.homeScore}–{liveMatch.awayScore}
          </span>
          &nbsp;{liveMatch.awayTeam.flagEmoji}
        </span>
        <span className="text-[10px] text-red-400 font-mono shrink-0">{minute}</span>
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
    <div className="flex items-center gap-2 min-w-0">
      {recent && (
        <Link
          href={`/schedule/${recent.id}`}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors shrink-0"
        >
          {getFlag(recent.homeTeam.tla)}&nbsp;
          <span className="text-slate-300 font-semibold">
            {recent.homeScore}–{recent.awayScore}
          </span>
          &nbsp;{getFlag(recent.awayTeam.tla)}
          <span className="ml-1 text-[10px] text-slate-500">FT</span>
        </Link>
      )}
      {recent && next && (
        <span className="text-slate-700 text-[10px]">·</span>
      )}
      {next && nextMs > 0 && (
        <Link
          href={`/schedule/${next.id}`}
          className={`flex items-center gap-1 text-[11px] hover:opacity-80 transition-opacity shrink-0 ${
            isImminent ? "text-amber-400" : "text-slate-300"
          }`}
        >
          {getFlag(next.homeTeam.tla)}&nbsp;vs&nbsp;{getFlag(next.awayTeam.tla)}
          <span className="ml-1 text-[10px] opacity-80">{formatCountdown(nextMs)}</span>
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
        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors shrink-0"
      >
        <span>♪</span>
        <span>Anthems</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0 min-w-0">
      <span className="text-[11px] text-slate-300 truncate max-w-[100px]">
        {current.flagEmoji} {truncate(current.title, 14)}
      </span>
      <div className="flex items-center gap-0.5">
        <button
          onClick={prev}
          aria-label="Previous track"
          className="text-slate-400 hover:text-slate-200 transition-colors text-[11px] px-0.5 leading-none"
        >
          ◀
        </button>
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="text-slate-200 hover:text-white transition-colors text-[11px] px-0.5 leading-none"
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button
          onClick={next}
          aria-label="Next track"
          className="text-slate-400 hover:text-slate-200 transition-colors text-[11px] px-0.5 leading-none"
        >
          ▶▶
        </button>
      </div>
      <Link
        href="/anthems"
        aria-label="Go to Anthems"
        className="text-slate-500 hover:text-slate-300 transition-colors text-[11px] leading-none"
      >
        →
      </Link>
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
      <div className="flex justify-between items-center px-4 h-14 gap-4">
        {/* Left: live score or recent/upcoming chips */}
        <LiveSection liveMatch={liveMatch} />

        {/* Right: mini audio player */}
        <AudioSection />
      </div>
    </div>
  );
}
