"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

export default function LiveMatchBanner() {
  const [match, setMatch] = useState<LiveMatch | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/live");
        if (res.ok) {
          const data = await res.json();
          setMatch(data);
          if (data) setDismissed(false);
        }
      } catch { /* ignore */ }
    }
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  if (!match || dismissed) return null;

  const minute = match.status === "HT" ? "HT" : `${match.elapsed}'`;

  return (
    <div className="bg-red-950/70 border-b border-red-900/50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 py-1.5 flex items-center gap-3">
        <Link
          href={`/schedule/${match.fixture}`}
          className="flex-1 flex items-center gap-3 min-w-0 hover:opacity-90 transition-opacity"
        >
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
          <span className="text-[10px] font-black text-red-400 uppercase tracking-widest shrink-0">Live</span>
          <span className="text-xs text-slate-300 font-medium truncate">
            {match.homeTeam.flagEmoji} {match.homeTeam.name}
            <span className="font-black text-white mx-2">
              {match.homeScore}–{match.awayScore}
            </span>
            {match.awayTeam.name} {match.awayTeam.flagEmoji}
          </span>
          <span className="text-[10px] text-red-400 font-mono shrink-0">{minute}</span>
          <span className="text-[10px] text-slate-600 shrink-0 hidden sm:inline">→ Watch</span>
        </Link>
        <button
          onClick={() => setDismissed(true)}
          className="text-slate-600 hover:text-slate-400 transition-colors shrink-0 text-base leading-none px-1"
          aria-label="Dismiss live banner"
        >
          ×
        </button>
      </div>
    </div>
  );
}
