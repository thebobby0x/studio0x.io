"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp, Play, Pause, Loader2, Telescope } from "lucide-react";
import FlagImg from "@/components/ui/FlagImg";
import ShareButton from "@/components/ui/ShareButton";
import { registerStoryStop, stopAllStories, startAmbient, stopAmbient } from "@/lib/storyAudio";

// Riptide = ordinary editorial categories; Rosa = the studio0x proprietary /
// featured ones. Both straight off the brand palette.
export const CATEGORY_COLORS: Record<string, string> = {
  "MATCH REPORT":     "bg-s0x-teal/10 border border-s0x-teal/30 text-s0x-teal",
  "MATCH PREVIEW":    "bg-s0x-teal/10 border border-s0x-teal/30 text-s0x-teal",
  "ANALYSIS":         "bg-s0x-teal/10 border border-s0x-teal/30 text-s0x-teal",
  "STANDINGS":        "bg-s0x-teal/10 border border-s0x-teal/30 text-s0x-teal",
  "METRIC SPOTLIGHT": "bg-s0x-ink/20 border border-s0x-ink/45 text-s0x-accent",
  "GAME RECAP":       "bg-s0x-teal/10 border border-s0x-teal/30 text-s0x-teal",
  "DAILY RECAP":      "bg-s0x-ink/20 border border-s0x-ink/45 text-s0x-accent",
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

// The TTS route reports WHY it failed — missing key, ElevenLabs rejection, full
// Blob store — and the player used to throw all of it away and say "Audio
// unavailable" for every case. CLAUDE.md gotcha #15 exists precisely because a
// full Blob store produces symptoms identical to a missing API key, so the
// distinction has to reach the surface.
function ttsMessage(status: number, error?: string): string {
  const e = (error ?? "").toLowerCase();
  if (e.includes("elevenlabs_api_key")) return "Narration isn't configured yet";
  // "Audio cache failed" is the Vercel BLOB write failing — ElevenLabs already
  // succeeded by that point and handed back the bytes. Naming the store matters:
  // read as "ElevenLabs storage full" it sends admins to purge an ElevenLabs
  // history that frees nothing, because we never store anything there.
  if (e.includes("quota") || e.includes("cache failed")) return "Audio cache full — admin: free up Blob storage";
  if (status === 429 || e.includes("429")) return "Narration busy — try again";
  if (e.includes("elevenlabs")) return "Narration service unavailable";
  return "Audio unavailable";
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
  const [deepAudioError, setDeepAudioError] = useState<string | null>(null);
  const deepAudioRef = useRef<HTMLAudioElement | null>(null);

  // Short story audio error state
  const [audioError, setAudioError] = useState<string | null>(null);

  const catColor = CATEGORY_COLORS[story.category] ?? "bg-s0x-surface border border-s0x-border text-s0x-muted";
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

  /**
   * Load and play a URL. Resolves false when the media cannot be played —
   * a 404/403 blob fires the element's `error` event and never rejects play(),
   * so both signals have to be raced or a purged blob just hangs.
   */
  const playUrl = useCallback(async (url: string): Promise<boolean> => {
    const audio = new Audio(url);
    const loadable = await new Promise<boolean>((resolve) => {
      const done = (v: boolean) => {
        audio.removeEventListener("canplay", ok);
        audio.removeEventListener("error", bad);
        resolve(v);
      };
      const ok = () => done(true);
      const bad = () => done(false);
      audio.addEventListener("canplay", ok, { once: true });
      audio.addEventListener("error", bad, { once: true });
      audio.load();
    });
    if (!loadable) return false;
    audioRef.current = audio;
    audio.onended = () => { setPlaying(false); stopAmbient(); };
    try {
      await audio.play();
    } catch {
      return false; // autoplay policy or decode failure
    }
    startAmbient();
    setPlaying(true);
    return true;
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
    setAudioError(null);
    try {
      // A story row can carry a PERSISTED narration URL (admin batch generation).
      // Use it directly — that's the whole point of persisting it — but never
      // trust it blindly: the blob it points at is a regenerable cache that an
      // admin storage purge can delete out from under the row. If it won't load,
      // fall through and re-synthesise once rather than showing a dead player.
      if (audioUrl) {
        const ok = await playUrl(audioUrl);
        if (ok) return;
        console.warn("[StoryCard] persisted audioUrl failed to load, regenerating", audioUrl);
        setAudioUrl(null);
      }
      const res = await fetch("/api/ai/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `${story.headline}. ${story.body}`, storyId: story.id }),
      });
      const data = await res.json().catch(() => ({})) as { url?: string; error?: string };
      if (!data.url) {
        console.error("[StoryCard] TTS failed", res.status, data.error);
        setAudioError(ttsMessage(res.status, data.error));
        setTimeout(() => setAudioError(null), 6000);
        return;
      }
      setAudioUrl(data.url);
      if (!(await playUrl(data.url))) throw new Error("playback blocked");
    } catch (e) {
      console.error("[StoryCard] story audio", e);
      setAudioError("Audio unavailable");
      setTimeout(() => setAudioError(null), 6000);
    } finally {
      setAudioLoading(false);
    }
  }, [audioUrl, playing, story, playUrl]);

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
    setDeepAudioError(null);
    try {
      // Strip markdown formatting for clean TTS
      const cleanDeep = deepDive.replace(/\*\*/g, "").replace(/\n\n+/g, ". ");
      const fullText = `${story.headline}. Full analysis: ${cleanDeep}`;
      const res = await fetch("/api/ai/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: fullText, storyId: `${story.id}-deep` }),
      });
      const data = await res.json().catch(() => ({})) as { url?: string; error?: string };
      if (!data.url) {
        console.error("[StoryCard] deep-dive TTS failed", res.status, data.error);
        setDeepAudioError(ttsMessage(res.status, data.error));
        setTimeout(() => setDeepAudioError(null), 6000);
        return;
      }
      setDeepAudioUrl(data.url);
      const audio = new Audio(data.url);
      deepAudioRef.current = audio;
      audio.onended = () => { setDeepPlaying(false); stopAmbient(); };
      await audio.play().catch(() => { throw new Error("playback blocked"); });
      startAmbient();
      setDeepPlaying(true);
    } catch (e) {
      console.error("[StoryCard] deep-dive audio", e);
      setDeepAudioError("Audio unavailable");
      setTimeout(() => setDeepAudioError(null), 6000);
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
    <div className="s0x-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className={`s0x-mono text-[9px] font-semibold px-2 py-0.5 rounded-full ${catColor}`}>
          {story.category}
        </span>
        <div className="flex items-center gap-1.5">
          {story.teamsInvolved.slice(0, 2).map((tla) => (
            <FlagImg key={tla} tla={tla} size={18} />
          ))}
          {showAge && <span className="s0x-data text-[10px] text-s0x-muted ml-1">{ageStr}</span>}
        </div>
      </div>

      <h3 className="s0x-display font-black text-s0x-text text-base leading-snug">{story.headline}</h3>

      <p className={`text-sm text-s0x-text/70 leading-relaxed ${expanded ? "" : "line-clamp-3"}`}>
        {story.body}
      </p>

      <div className="flex items-center justify-between mt-0.5">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="s0x-mono flex items-center gap-1.5 text-[10px] text-s0x-muted hover:text-s0x-accent transition-colors"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {expanded ? "Less" : "Read more"}
        </button>

        <div className="flex items-center gap-2">
          <ShareButton
            text={`${story.headline} — ${story.body.slice(0, 120)}${story.body.length > 120 ? "…" : ""} · studio0x.io`}
            url="/news"
            title={story.headline}
          />
          <button
            onClick={handleDeepDive}
            disabled={deepDiveLoading}
            className="s0x-btn s0x-btn-secondary !px-3 !py-1.5 !text-[10px] disabled:opacity-40"
          >
            {deepDiveLoading ? <Loader2 size={12} className="animate-spin" /> : <Telescope size={12} />}
            {deepDiveLoading ? "Analysing…" : deepDiveOpen ? "Close" : "Go Deeper"}
          </button>

          <button
            onClick={handlePlay}
            disabled={audioLoading}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors disabled:opacity-40 ${
              audioError
                ? "bg-red-500/10 text-red-400"
                : "bg-brand-gold/10 text-amber-300 hover:bg-brand-gold/20"
            }`}
          >
            {audioLoading ? <Loader2 size={12} className="animate-spin" /> : playing ? <Pause size={12} /> : <Play size={12} />}
            {audioLoading ? "Generating…" : audioError ? audioError : playing ? "Pause" : "Listen"}
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
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors disabled:opacity-40 ${
                  deepAudioError
                    ? "bg-red-500/10 text-red-400"
                    : "bg-brand-gold/10 text-amber-300 hover:bg-brand-gold/20"
                }`}
              >
                {deepAudioLoading ? <Loader2 size={12} className="animate-spin" /> : deepPlaying ? <Pause size={12} /> : <Play size={12} />}
                {deepAudioLoading ? "Generating…" : deepAudioError ? deepAudioError : deepPlaying ? "Pause" : "Listen to Full Analysis"}
              </button>
            </div>
          </>
        ) : null
      )}
    </div>
  );
}
