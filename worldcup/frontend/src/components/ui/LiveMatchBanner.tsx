"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play, Pause, SkipBack, SkipForward, Music2 } from "lucide-react";
import { useAudio } from "@/lib/AudioContext";
import FlagImg from "@/components/ui/FlagImg";

// ── Types ──────────────────────────────────────────────────────────────────

interface LiveMatch {
  id: string;
  fixture: number;
  homeScore: number;
  awayScore: number;
  elapsed: number;
  status: string;
  // afTeamId/logoUrl are the club-crest source. Team.flagEmoji is a COUNTRY flag
  // on club deployments, which reads as "USA vs Mexico" rather than naming the
  // two clubs — the crest is the badge that actually identifies a club.
  homeTeam: { name: string; flagEmoji: string; code: string; afTeamId?: number | null; logoUrl?: string };
  awayTeam: { name: string; flagEmoji: string; code: string; afTeamId?: number | null; logoUrl?: string };
}

interface ScheduleMatch {
  id: number;
  utcDate: string;
  status: "NS" | "LIVE" | "HT" | "FT";
  homeTeam: { name: string; tla: string; afId?: number | null };
  awayTeam: { name: string; tla: string; afId?: number | null };
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
        {/* LIVE badge: Rosa 700 fill + Rosa glow. Clock value in Riptide. */}
        <span className="s0x-live shrink-0 !py-1 !px-2.5 !text-xs">
          <span className="s0x-live-dot !w-2 !h-2" />
          LIVE
        </span>
        <span className="flex items-center gap-2 text-lg sm:text-xl text-s0x-text/90 font-medium">
          <FlagImg tla={liveMatch.homeTeam.code} logoUrl={liveMatch.homeTeam.logoUrl} afId={liveMatch.homeTeam.afTeamId} size={24} />
          <span className="s0x-data font-bold text-s0x-text s0x-neon-rosa">
            {liveMatch.homeScore}–{liveMatch.awayScore}
          </span>
          <FlagImg tla={liveMatch.awayTeam.code} logoUrl={liveMatch.awayTeam.logoUrl} afId={liveMatch.awayTeam.afTeamId} size={24} />
        </span>
        <span className="s0x-data text-sm text-s0x-teal font-bold shrink-0">{minute}</span>
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
      <span className="s0x-mono hidden sm:inline shrink-0 text-[9px] font-semibold text-s0x-muted">
        Results
      </span>
      {recent.map((m, i) => (
        <span key={m.id} className="flex items-center gap-3 shrink-0">
          {i > 0 && <span className="text-slate-700">·</span>}
          <Link
            href={`/schedule/${m.id}`}
            className="flex items-center gap-1.5 text-sm sm:text-base text-slate-400 hover:text-slate-200 transition-colors"
          >
            <FlagImg tla={m.homeTeam.tla} afId={m.homeTeam.afId} size={20} />
            <span className="s0x-data text-s0x-text font-bold">
              {m.homeScore}–{m.awayScore}
            </span>
            <FlagImg tla={m.awayTeam.tla} afId={m.awayTeam.afId} size={20} />
            <span className="s0x-mono ml-0.5 text-[9px] font-semibold text-s0x-muted">FT</span>
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
        className="s0x-btn s0x-btn-teal hidden sm:flex !text-[11px] !px-3.5 !py-1.5 shrink-0"
      >
        <Music2 size={16} />
        <span>Team Anthems</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2.5 shrink-0 min-w-0 bg-s0x-teal/10 pl-3 pr-2 py-1.5 rounded-full border border-s0x-teal/40">
      <span className="s0x-data text-sm text-s0x-teal font-semibold truncate max-w-[140px] flex items-center gap-1.5">
        <span className="text-lg">{current.flagEmoji}</span>
        {truncate(current.title, 16)}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={prev}
          aria-label="Previous track"
          className="text-s0x-muted hover:text-s0x-teal transition-colors"
        >
          <SkipBack size={15} fill="currentColor" />
        </button>
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="w-7 h-7 rounded-full bg-s0x-teal text-s0x-onink flex items-center justify-center transition-all hover:shadow-glow-teal"
        >
          {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
        </button>
        <button
          onClick={next}
          aria-label="Next track"
          className="text-s0x-muted hover:text-s0x-teal transition-colors"
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
    <div className="bg-s0x-bg/95 border-b border-s0x-border w-full">
      <div className="max-w-7xl mx-auto flex justify-between items-center px-4 h-16 gap-4">
        {/* Left: live score or last-3-results chips. Scrolls horizontally on
            small screens instead of colliding with the audio pill. */}
        <div className="flex items-center gap-3 min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <LiveSection liveMatch={liveMatch} />
          {liveCount >= 2 && (
            <Link
              href="/?live=split"
              className="s0x-mono hidden sm:flex items-center gap-1 text-[9px] font-semibold bg-s0x-ink/15 text-s0x-accent border border-s0x-ink/40 rounded-full px-2.5 py-1 hover:bg-s0x-ink/25 transition-colors shrink-0"
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
