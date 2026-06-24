"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp, Play, Pause, Loader2, Telescope } from "lucide-react";
import FlagImg from "@/components/ui/FlagImg";
import { registerStoryStop, stopAllStories, startAmbient, stopAmbient } from "@/lib/storyAudio";

export const CATEGORY_COLORS: Record<string, string> = {
  "MATCH REPORT":     "bg-brand-blue/20 text-blue-300",
  "MATCH PREVIEW":    "bg-teal-500/20 text-teal-300",
  "ANALYSIS":         "bg-brand-gold/20 text-amber-300",
  "STANDINGS":        "bg-emerald-500/20 text-emerald-300",
  "METRIC SPOTLIGHT": "bg-purple-500/20 text-purple-300",
  "GAME RECAP":       "bg-brand-blue/20 text-blue-300",
  "DAILY RECAP":      "bg-brand-gold/20 text-amber-300",
};

export interface StoryCardData {
  id: string;
  category: string;
  headline: string;
  body: string;
  teamsInvolved: string[];
  generatedAt: string;
  audioUrl?: string | null;
}

export function DeepDivePanel({ text }: { text: string }) {
  const sections = text.split(/\n\n+/).filter(Boolean);
  return (
    <div className="mt-3 pt-3 border-t border-brand-border space-y-3">
      {sections.map((block, i) => {
        const headingMatch = block.match(/^\*\*(.+?)\*\*\n?([\s\S]*)/);
        if (headingMatch) {
          return (
            <div key={i}>
              <p className="text-[11px] font-black uppercase tracking-widest text-brand-gold mb-1">{headingMatch[1]}</p>
              <p className="text-sm text-slate-300 leading-relaxed">{headingMatch[2].trim()}</p>
            </div>
          );
        }
        return <p key={i} className="text-sm text-slate-300 leading-relaxed">{block}</p>;
      })}
    </div>
  );
}

export default function StoryCard({ story, showAge = true }: { story: StoryCardData; showAge?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  // Short story audio
  const [audioUrl, setAudioUrl] = useState<string | null>(story.audioUrl ?? null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Deep dive content
  const [deepDive, setDeepDive] = useState<string | null>(null);
  const [deepDiveLoading, setDeepDiveLoading] = useState(false);
  const [deepDiveOpen, setDeepDiveOpen] = useState(false);

  // Deep dive audio
  const [deepAudioUrl, setDeepAudioUrl] = useState<string | null>(null);
  const [deepAudioLoading, setDeepAudioLoading] = useState(false);
  const [deepPlaying, setDeepPlaying] = useState(false);
  const deepAudioRef = useRef<HTMLAudioElement | null>(null);

  const catColor = CATEGORY_COLORS[story.category] ?? "bg-slate-700 text-slate-300";
  const age = Math.round((Date.now() - new Date(story.generatedAt).getTime()) / 60_000);
  const ageStr = age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`;

  // Register a stop callback so other stories can pause this one.
  // Runs once on mount; refs are always current so no stale capture.
  useEffect(() => {
    const stop = () => {
      audioRef.current?.pause();
      deepAudioRef.current?.pause();
      setPlaying(false);
      setDeepPlaying(false);
      stopAmbient();
    };
    return registerStoryStop(stop);
  }, []);

  const handlePlay = useCallback(async () => {
    if (audioRef.current && audioUrl) {
      if (playing) {
        audioRef.current.pause();
        stopAmbient();
        setPlaying(false);
      } else {
        stopAllStories();
        audioRef.current.play();
        startAmbient();
        setPlaying(true);
      }
      return;
    }
    stopAllStories();
    setAudioLoading(true);
    try {
      const res = await fetch("/api/ai/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `${story.headline}. ${story.body}`, storyId: story.id }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!data.url) return;
      setAudioUrl(data.url);
      const audio = new Audio(data.url);
      audioRef.current = audio;
      audio.onended = () => { setPlaying(false); stopAmbient(); };
      audio.play();
      startAmbient();
      setPlaying(true);
    } finally {
      setAudioLoading(false);
    }
  }, [audioUrl, playing, story]);

  const handleDeepPlay = useCallback(async () => {
    if (!deepDive) return;
    if (deepAudioRef.current && deepAudioUrl) {
      if (deepPlaying) {
        deepAudioRef.current.pause();
        stopAmbient();
        setDeepPlaying(false);
      } else {
        stopAllStories();
        deepAudioRef.current.play();
        startAmbient();
        setDeepPlaying(true);
      }
      return;
    }
    stopAllStories();
    setDeepAudioLoading(true);
    try {
      // Strip markdown formatting for clean TTS
      const cleanDeep = deepDive.replace(/\*\*/g, "").replace(/\n\n+/g, ". ");
      const fullText = `${story.headline}. Full analysis: ${cleanDeep}`;
      const res = await fetch("/api/ai/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: fullText, storyId: `${story.id}-deep` }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!data.url) return;
      setDeepAudioUrl(data.url);
      const audio = new Audio(data.url);
      deepAudioRef.current = audio;
      audio.onended = () => { setDeepPlaying(false); stopAmbient(); };
      audio.play();
      startAmbient();
      setDeepPlaying(true);
    } finally {
      setDeepAudioLoading(false);
    }
  }, [deepAudioUrl, deepDive, deepPlaying, story]);

  const handleDeepDive = useCallback(async () => {
    if (deepDive) { setDeepDiveOpen((o) => !o); return; }
    setDeepDiveLoading(true);
    setDeepDiveOpen(true);
    try {
      const res = await fetch("/api/ai/story-expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId: story.id,
          headline: story.headline,
          body: story.body,
          category: story.category,
          teamsInvolved: story.teamsInvolved,
        }),
      });
      const data = await res.json() as { deepDive?: string; error?: string };
      if (data.deepDive) setDeepDive(data.deepDive);
    } finally {
      setDeepDiveLoading(false);
    }
  }, [deepDive, story]);

  return (
    <div className="rounded-xl bg-brand-card border border-brand-border p-4 flex flex-col gap-2 transition-all">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${catColor}`}>
          {story.category}
        </span>
        <div className="flex items-center gap-1.5">
          {story.teamsInvolved.slice(0, 2).map((tla) => (
            <FlagImg key={tla} tla={tla} size={18} />
          ))}
          {showAge && <span className="text-[10px] text-slate-600 ml-1">{ageStr}</span>}
        </div>
      </div>

      <h3 className="font-black text-white text-base leading-snug">{story.headline}</h3>

      <p className={`text-sm text-slate-400 leading-relaxed ${expanded ? "" : "line-clamp-3"}`}>
        {story.body}
      </p>

      <div className="flex items-center justify-between mt-0.5">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {expanded ? "Less" : "Read more"}
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDeepDive}
            disabled={deepDiveLoading}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 disabled:opacity-40"
          >
            {deepDiveLoading ? <Loader2 size={12} className="animate-spin" /> : <Telescope size={12} />}
            {deepDiveLoading ? "Analysing…" : deepDiveOpen ? "Close" : "Go Deeper"}
          </button>

          <button
            onClick={handlePlay}
            disabled={audioLoading}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors bg-brand-gold/10 text-amber-300 hover:bg-brand-gold/20 disabled:opacity-40"
          >
            {audioLoading ? <Loader2 size={12} className="animate-spin" /> : playing ? <Pause size={12} /> : <Play size={12} />}
            {audioLoading ? "Generating…" : playing ? "Pause" : "Listen"}
          </button>
        </div>
      </div>

      {deepDiveOpen && (
        deepDiveLoading ? (
          <div className="mt-3 pt-3 border-t border-brand-border space-y-2">
            {[90, 75, 85, 60, 80].map((w, i) => (
              <div key={i} className="h-3 bg-slate-800 rounded animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : deepDive ? (
          <>
            <DeepDivePanel text={deepDive} />
            <div className="flex justify-end mt-2">
              <button
                onClick={handleDeepPlay}
                disabled={deepAudioLoading}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors bg-brand-gold/10 text-amber-300 hover:bg-brand-gold/20 disabled:opacity-40"
              >
                {deepAudioLoading ? <Loader2 size={12} className="animate-spin" /> : deepPlaying ? <Pause size={12} /> : <Play size={12} />}
                {deepAudioLoading ? "Generating…" : deepPlaying ? "Pause" : "Listen to Full Analysis"}
              </button>
            </div>
          </>
        ) : null
      )}
    </div>
  );
}
