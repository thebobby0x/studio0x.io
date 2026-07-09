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

  return <PastResultsChips />;
}

// The ticker's job when nothing is live: the LAST 3 RESULTS, compact.
// (The hero below already headlines the next kickoff — duplicating it here
// was noise, per owner's 7/9 markup.)
function PastResultsChips() {
  const [recent, setRecent] = useState<ScheduleMatch[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/schedule");
        if (!res.ok) return;
        const matches: ScheduleMatch[] = await res.json();
        const finished = matches
          .filter((m) => m.status === "FT" && m.homeScore !== null)
          .sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime());
        setRecent(finished.slice(0, 3));
      } catch { /* ignore */ }
    }
    load();
  }, []);

  if (recent.length === 0) return null;

  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="hidden sm:inline shrink-0 text-[9px] font-black uppercase tracking-widest text-slate-600">
        Results
      </span>
      {recent.map((m, i) => (
        <span key={m.id} className="flex items-center gap-3 shrink-0">
          {i > 0 && <span className="text-slate-700">·</span>}
          <Link
            href={`/schedule/${m.id}`}
            className="flex items-center gap-1.5 text-sm sm:text-base text-slate-400 hover:text-slate-200 transition-colors"
          >
            <span className="text-xl">{getFlag(m.homeTeam.tla)}</span>
            <span className="text-slate-200 font-bold tabular-nums">
              {m.homeScore}–{m.awayScore}
            </span>
            <span className="text-xl">{getFlag(m.awayTeam.tla)}</span>
            <span className="ml-0.5 text-[10px] font-bold text-slate-500 uppercase">FT</span>
          </Link>
        </span>
      ))}
    </div>
  );
}

// ── Right section — Mini audio player ─────────────────────────────────────

function AudioSection() {
  const { current, isPlaying, togglePlay, next, prev } = useAudio();

  if (!current) {
    // Desktop-only: on mobile the anthem shortcut lives in the nav pill row —
    // this pill was overlapping the ticker text on small screens (owner 7/9).
    return (
      <Link
        href="/anthems"
        className="hidden sm:flex items-center gap-2 text-sm sm:text-base font-semibold text-brand-gold hover:text-amber-300 transition-colors shrink-0 bg-brand-gold/10 px-3.5 py-1.5 rounded-full border border-brand-gold/20"
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
  const [liveCount, setLiveCount] = useState(0);
  const [hasContent, setHasContent] = useState(false);
  const { current: audioTrack } = useAudio();

  useEffect(() => {
    async function loadLive() {
      try {
        const res = await fetch("/api/live");
        if (res.ok) {
          const data = await res.json() as { primary: LiveMatch | null; count: number };
          setLiveMatch(data.primary);
          setLiveCount(data.count ?? (data.primary ? 1 : 0));
        }
      } catch { /* ignore */ }
    }
    loadLive();
    const id = setInterval(loadLive, 10_000);
    return () => clearInterval(id);
  }, []);

  // Show the strip once schedule data or live data has been attempted
  useEffect(() => {
    setHasContent(true);
  }, []);

  if (!hasContent) return null;

  void audioTrack;

  return (
    <div className="bg-brand-dark/95 border-b border-brand-border/50 w-full">
      <div className="max-w-7xl mx-auto flex justify-between items-center px-4 h-16 gap-4">
        {/* Left: live score or last-3-results chips. Scrolls horizontally on
            small screens instead of colliding with the audio pill. */}
        <div className="flex items-center gap-3 min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <LiveSection liveMatch={liveMatch} />
          {liveCount >= 2 && (
            <Link
              href="/?live=split"
              className="hidden sm:flex items-center gap-1 text-[10px] font-black uppercase tracking-widest bg-red-500/15 text-red-400 border border-red-500/20 rounded-full px-2.5 py-1 hover:bg-red-500/25 transition-colors shrink-0"
            >
              +{liveCount - 1} more live
            </Link>
          )}
        </div>

        {/* Right: mini audio player */}
        <AudioSection />
      </div>
    </div>
  );
}
