"use client";

import { useAudio } from "@/lib/AudioContext";
import { SkipBack, SkipForward, Play, Pause, X } from "lucide-react";
import { useState } from "react";

export default function FloatingMiniPlayer() {
  const { current, isPlaying, progress, playlist, togglePlay, next, prev, pause } = useAudio();
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed when a new track starts
  if (current && dismissed) setDismissed(false);

  if (!current || dismissed) return null;

  const hasPrev = playlist.length > 1;
  const hasNext = playlist.length > 1;

  return (
    <div className="fixed bottom-20 sm:bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-brand-card/95 backdrop-blur-md border border-brand-border shadow-2xl shadow-black/50 min-w-[280px] max-w-[420px] w-[92vw]">
      {/* Flag + track info */}
      <div className="text-xl shrink-0 select-none">{current.flagEmoji}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-white truncate leading-tight">{current.title}</div>
        <div className="text-[10px] text-slate-500 truncate">{current.teamName}</div>
        {/* Progress bar */}
        <div className="mt-1.5 h-0.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-green rounded-full transition-all duration-1000"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={prev}
          disabled={!hasPrev}
          className="p-1.5 text-slate-400 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
        >
          <SkipBack size={14} />
        </button>
        <button
          onClick={togglePlay}
          className="p-2 rounded-full bg-brand-green text-brand-dark hover:bg-green-400 transition-colors"
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
        </button>
        <button
          onClick={next}
          disabled={!hasNext}
          className="p-1.5 text-slate-400 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
        >
          <SkipForward size={14} />
        </button>
      </div>

      {/* Dismiss */}
      <button
        onClick={() => { pause(); setDismissed(true); }}
        className="p-1 text-slate-600 hover:text-slate-400 transition-colors shrink-0"
      >
        <X size={12} />
      </button>
    </div>
  );
}
