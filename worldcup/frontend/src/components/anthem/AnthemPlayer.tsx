"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Music2, ExternalLink } from "lucide-react";
import type { AudioStream } from "@/lib/types";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Track({ stream }: { stream: AudioStream }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listenTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const continuousSecs = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [playCount, setPlayCount] = useState(stream.playCount);
  // Why this track isn't playing. Previously `.play().catch(() => {})` threw the
  // reason away and `setPlaying(true)` ran regardless, so a dead audio URL showed
  // a Pause button and a moving progress bar over total silence.
  const [fault, setFault] = useState<string | null>(null);

  function startListenTimer() {
    if (listenTimerRef.current) return;
    listenTimerRef.current = setInterval(() => {
      // Listen accounting only — `elapsed` now comes from the media clock
      // (onTimeUpdate), so incrementing it here too would double-count.
      continuousSecs.current += 1;

      // Every 10 seconds of continuous play → record a listen
      if (continuousSecs.current > 0 && continuousSecs.current % 10 === 0) {
        fetch(`/api/audio/${stream.id}/listen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seconds: 10 }),
        })
          .then((r) => r.json())
          .then((d) => setPlayCount(d.playCount))
          .catch(() => {});
      }
    }, 1000);
  }

  function stopListenTimer() {
    if (listenTimerRef.current) {
      clearInterval(listenTimerRef.current);
      listenTimerRef.current = null;
    }
    continuousSecs.current = 0;
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      stopListenTimer();
      setPlaying(false);
      return;
    }
    if (!stream.audioUrl) {
      setFault("This anthem hasn't been imported yet.");
      return;
    }
    setFault(null);
    // Only claim to be playing once the browser actually starts.
    audio.play()
      .then(() => { startListenTimer(); setPlaying(true); })
      .catch((e: unknown) => {
        setPlaying(false);
        stopListenTimer();
        setFault(
          (e instanceof Error ? e.name : "") === "NotAllowedError"
            ? "Tap play again to start audio."
            : "This track could not be played.",
        );
      });
  }

  // The element's own failure channel — a 404/403 audio URL never rejects
  // play(), it fires `error` here.
  function onAudioError() {
    stopListenTimer();
    setPlaying(false);
    setFault("This anthem's audio file is missing or unreadable.");
  }

  useEffect(() => {
    return () => stopListenTimer();
  }, []);

  const progress = stream.durationSecs > 0 ? (elapsed / stream.durationSecs) * 100 : 0;

  return (
    <div className="s0x-card overflow-hidden">
      {/* Cover plate — a Riptide/Rosa HUD wash on Noir. The old per-team flag
          gradients were arbitrary hexes; team identity now reads from the crest
          emoji, and the chrome stays on-palette. */}
      <div className="s0x-hud-grid relative h-20 flex items-end px-4 pb-3 bg-gradient-to-br from-s0x-teal/25 via-s0x-surface to-s0x-ink/25">
        <span className="s0x-scanline" aria-hidden="true" />
        <div className="relative text-3xl">{stream.team?.flagEmoji ?? "🏆"}</div>
        <div className="relative ml-3 min-w-0">
          <div className="s0x-mono text-[10px] font-semibold text-s0x-teal">
            {stream.team?.name ?? "Tournament"}
          </div>
          <div className="s0x-display text-s0x-text font-bold text-sm leading-tight truncate">
            {stream.title}
          </div>
        </div>
      </div>

      {/* Player controls */}
      <div className="p-4">
        <audio
          ref={audioRef}
          src={stream.audioUrl || undefined}
          loop
          preload="none"
          muted={muted}
          onError={onAudioError}
          // Progress follows the media clock, not a wall-clock interval — the
          // old bar advanced even when nothing was actually playing.
          onTimeUpdate={(e) => setElapsed(Math.floor(e.currentTarget.currentTime))}
        />

        {/* Progress bar */}
        <div className="w-full h-1 bg-s0x-border rounded-full mb-3 overflow-hidden">
          <div
            className="h-full bg-s0x-teal rounded-full transition-all duration-1000 shadow-glow-teal"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Time + controls */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              aria-label={playing ? "Pause anthem" : "Play anthem"}
              className="w-9 h-9 rounded-full bg-s0x-teal flex items-center justify-center transition-all hover:shadow-glow-teal"
            >
              {playing
                ? <Pause size={16} className="text-s0x-onink" fill="currentColor" />
                : <Play size={16} className="text-s0x-onink" fill="currentColor" />}
            </button>
            <button
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? "Unmute" : "Mute"}
              className="text-s0x-muted hover:text-s0x-teal transition-colors"
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </div>

          <span className="s0x-data text-xs text-s0x-teal">
            {formatTime(elapsed)} / {formatTime(stream.durationSecs)}
          </span>

          <div className="s0x-mono flex items-center gap-1.5 text-s0x-muted text-[10px]">
            <Music2 size={11} />
            <span>{playCount.toLocaleString()} plays</span>
          </div>
        </div>

        {fault && (
          <p className="s0x-mono mt-3 text-[10px] text-s0x-muted" role="status">
            {fault}
          </p>
        )}

        {/* Credit + TikTok deep link */}
        <div className="mt-3 pt-3 border-t border-s0x-border flex items-center justify-between gap-2">
          <span className="text-xs text-s0x-muted">{stream.artistCredit}</span>
          {stream.tiktokDeepLink && (
            <a
              href={stream.tiktokDeepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="s0x-mono flex items-center gap-1.5 text-[10px] font-semibold text-s0x-accent hover:text-s0x-teal transition-colors"
            >
              <ExternalLink size={11} />
              Use this Anthem on TikTok
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AnthemPlayer({ streams }: { streams: AudioStream[] }) {
  if (!streams.length) {
    // "No anthems yet" is a KNOWN state, not a loading one. This used to render
    // two pulsing skeletons forever, so a deployment whose anthems hadn't been
    // imported looked like a page that never finished loading.
    return (
      <div className="s0x-card s0x-hud-grid p-8 text-center">
        <span className="s0x-scanline" aria-hidden="true" />
        <Music2 size={28} className="mx-auto mb-3 text-s0x-teal/50" />
        <p className="s0x-display text-s0x-text font-bold text-sm">Anthems coming soon</p>
        <p className="text-[11px] text-s0x-muted mt-1.5 max-w-sm mx-auto">
          Club anthems are still being produced and imported. They&apos;ll appear
          here automatically once they land — nothing to do on your end.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5 mb-3">
        <Music2 size={14} className="text-s0x-teal" />
        <span className="s0x-eyebrow">Team Anthems</span>
        <span className="s0x-mono text-[9px] px-2 py-0.5 rounded-full bg-s0x-teal/10 border border-s0x-teal/35 text-s0x-teal">
          Suno AI × studio0x
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {streams.map((s) => <Track key={s.id} stream={s} />)}
      </div>
    </div>
  );
}
