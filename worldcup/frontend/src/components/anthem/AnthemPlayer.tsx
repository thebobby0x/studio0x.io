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

  function startListenTimer() {
    if (listenTimerRef.current) return;
    listenTimerRef.current = setInterval(() => {
      continuousSecs.current += 1;
      setElapsed((e) => e + 1);

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
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      stopListenTimer();
    } else {
      audioRef.current.play().catch(() => {});
      startListenTimer();
    }
    setPlaying((p) => !p);
  }

  useEffect(() => {
    return () => stopListenTimer();
  }, []);

  const progress = stream.durationSecs > 0 ? (elapsed / stream.durationSecs) * 100 : 0;

  return (
    <div className="rounded-xl bg-brand-card border border-brand-border overflow-hidden">
      {/* Cover gradient header */}
      <div
        className="h-20 bg-gradient-to-br flex items-end px-4 pb-3"
        style={{
          backgroundImage: stream.team?.code === "MEX"
            ? "linear-gradient(135deg, #006847 0%, #ce1126 50%, #ffffff20 100%)"
            : "linear-gradient(135deg, #007A4D 0%, #FFB612 50%, #002395 100%)",
        }}
      >
        <div className="text-3xl">{stream.team?.flagEmoji ?? "🏆"}</div>
        <div className="ml-3">
          <div className="text-xs font-semibold text-white/80 uppercase tracking-widest">{stream.team?.name ?? "Tournament"}</div>
          <div className="text-white font-bold text-sm leading-tight">{stream.title}</div>
        </div>
      </div>

      {/* Player controls */}
      <div className="p-4">
        <audio ref={audioRef} src={stream.audioUrl} loop preload="none" muted={muted} />

        {/* Progress bar */}
        <div className="w-full h-1 bg-brand-border rounded-full mb-3 overflow-hidden">
          <div
            className="h-full bg-brand-green rounded-full transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Time + controls */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              className="w-9 h-9 rounded-full bg-brand-green flex items-center justify-center hover:bg-green-400 transition-colors"
            >
              {playing ? <Pause size={16} className="text-black" fill="black" /> : <Play size={16} className="text-black" fill="black" />}
            </button>
            <button onClick={() => setMuted((m) => !m)} className="text-slate-400 hover:text-white transition-colors">
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </div>

          <span className="text-xs tabular-nums text-slate-500">
            {formatTime(elapsed)} / {formatTime(stream.durationSecs)}
          </span>

          <div className="flex items-center gap-1 text-slate-500 text-xs">
            <Music2 size={11} />
            <span>{playCount.toLocaleString()} plays</span>
          </div>
        </div>

        {/* Credit + TikTok deep link */}
        <div className="mt-3 pt-3 border-t border-brand-border flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">{stream.artistCredit}</span>
          {stream.tiktokDeepLink && (
            <a
              href={stream.tiktokDeepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold text-brand-gold hover:text-amber-300 transition-colors"
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
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-48 rounded-xl bg-brand-card border border-brand-border animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <Music2 size={14} className="text-brand-gold" />
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Team Anthems</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-border text-slate-400">Suno AI × studio0x</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {streams.map((s) => <Track key={s.id} stream={s} />)}
      </div>
    </div>
  );
}
