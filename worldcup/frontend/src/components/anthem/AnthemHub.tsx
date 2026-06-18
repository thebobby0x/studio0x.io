"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Play, Pause, SkipBack, SkipForward, Repeat, Shuffle,
  Volume2, VolumeX, Music2, Share2, ExternalLink,
} from "lucide-react";
import AppNav from "@/components/ui/AppNav";
import type { AudioStream } from "@/lib/types";

type Stream = AudioStream & { team: { code: string; name: string; flagEmoji: string } | null };
type LoopMode = "none" | "all" | "one";

function formatTime(sec: number) {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function buildShareLinks(stream: Stream, pageUrl: string) {
  const text = encodeURIComponent(
    `🎵 ${stream.title} — Official FIFA World Cup 2026 Anthem | Suno AI × Studio0x`
  );
  const url = encodeURIComponent(pageUrl);
  return [
    {
      key: "tiktok",
      label: "TikTok",
      description: "Use this sound in a TikTok",
      href: stream.tiktokDeepLink || "https://www.tiktok.com",
      cls: "bg-[#010101] border-[#333]",
      icon: (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white flex-shrink-0">
          <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.17 8.17 0 004.78 1.52V6.77a4.85 4.85 0 01-1.01-.08z" />
        </svg>
      ),
    },
    {
      key: "instagram",
      label: "Instagram",
      description: "Share to Story or Reel",
      href: "https://www.instagram.com/",
      cls: "bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#F77737] border-transparent",
      icon: (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white flex-shrink-0">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
        </svg>
      ),
    },
    {
      key: "x",
      label: "X (Twitter)",
      description: "Post on X",
      href: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      cls: "bg-black border-[#333]",
      icon: (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white flex-shrink-0">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
    },
    {
      key: "facebook",
      label: "Facebook",
      description: "Share on Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`,
      cls: "bg-[#1877F2] border-transparent",
      icon: (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white flex-shrink-0">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
    },
    {
      key: "youtube",
      label: "YouTube Short",
      description: "Create a YouTube Short",
      href: "https://studio.youtube.com/",
      cls: "bg-[#FF0000] border-transparent",
      icon: (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white flex-shrink-0">
          <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      ),
    },
  ];
}

function teamGradient(code: string | undefined) {
  if (!code) return "from-[#1e3a5f] via-[#c2860a] to-slate-900"; // FIFA gold-blue
  const map: Record<string, string> = {
    MEX: "from-[#006847] via-[#ce1126] to-slate-900",
    RSA: "from-[#007A4D] via-[#FFB612] to-[#002395]",
    BIH: "from-[#002395] via-[#FFCC00] to-slate-900",
    BRA: "from-[#009c3b] via-[#FFDF00] to-[#002776]",
    ARG: "from-[#74acdf] via-white to-[#74acdf]",
    USA: "from-[#B22234] via-white to-[#3C3B6E]",
    CAN: "from-[#FF0000] via-white to-[#FF0000]",
    ENG: "from-[#CF142B] via-white to-[#012169]",
    FRA: "from-[#002395] via-white to-[#ED2939]",
    ESP: "from-[#AA151B] via-[#F1BF00] to-[#AA151B]",
    DEU: "from-[#000000] via-[#DD0000] to-[#FFCE00]",
    POR: "from-[#006600] via-[#FF0000] to-[#FF0000]",
  };
  return map[code] ?? "from-brand-green via-brand-gold to-slate-800";
}

export default function AnthemHub({ streams }: { streams: Stream[] }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopMode, setLoopMode] = useState<LoopMode>("none");
  const [isShuffling, setIsShuffling] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showShare, setShowShare] = useState(false);
  const [pageUrl, setPageUrl] = useState("https://worldcup-2026-sandy.vercel.app/anthems");

  useEffect(() => { setPageUrl(window.location.href); }, []);

  const current = streams[currentIdx];

  // Load new track when index changes
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    a.src = current.audioUrl;
    a.load();
    setElapsed(0);
    setDuration(current.durationSecs);
    if (isPlaying) a.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume;
    audioRef.current.muted = isMuted;
  }, [volume, isMuted]);

  const nextTrack = useCallback(() => {
    if (isShuffling) {
      setCurrentIdx(Math.floor(Math.random() * streams.length));
    } else {
      setCurrentIdx((i) => (i + 1) % streams.length);
    }
    setIsPlaying(true);
  }, [isShuffling, streams.length]);

  const handleEnded = useCallback(() => {
    if (loopMode === "one") {
      if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play().catch(() => {}); }
    } else if (loopMode === "all" || isShuffling || currentIdx < streams.length - 1) {
      nextTrack();
    } else {
      setIsPlaying(false);
    }
  }, [loopMode, isShuffling, currentIdx, streams.length, nextTrack]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) { a.pause(); setIsPlaying(false); }
    else { a.play().catch(() => {}); setIsPlaying(true); }
  };

  const playTrack = (idx: number) => {
    setCurrentIdx(idx);
    setIsPlaying(true);
  };

  const prevTrack = () => {
    if (elapsed > 3) {
      if (audioRef.current) audioRef.current.currentTime = 0;
      setElapsed(0);
      return;
    }
    setCurrentIdx((i) => (i - 1 + streams.length) % streams.length);
    setIsPlaying(true);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !audioRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t = pct * (duration || current?.durationSecs || 0);
    audioRef.current.currentTime = t;
    setElapsed(t);
  };

  const progress = (duration > 0 ? elapsed / duration : 0) * 100;
  const shareLinks = current ? buildShareLinks(current, pageUrl) : [];

  if (!streams.length) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center">
        <div className="text-center text-slate-500">
          <Music2 size={48} className="mx-auto mb-4 opacity-30" />
          <p>No anthems loaded yet.</p>
          <Link href="/" className="text-brand-gold hover:underline text-sm mt-2 block">← Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200 flex flex-col">
      <AppNav />

      <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-8 grid grid-cols-1 lg:grid-cols-5 gap-8">

        {/* ── Player (left) ── */}
        <div className="lg:col-span-3 flex flex-col gap-5">

          {/* Album card */}
          <div className={`rounded-2xl bg-gradient-to-br ${teamGradient(current?.team?.code)} p-8 flex items-center gap-5 shadow-xl`}>
            <div className="text-7xl drop-shadow-xl select-none">{current?.team?.flagEmoji ?? "🏆"}</div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white/60 uppercase tracking-widest">{current?.team?.name ?? "FIFA World Cup 2026"}</div>
              <h2 className="text-xl font-bold text-white mt-1 leading-snug">{current?.title}</h2>
              <div className="text-sm text-white/50 mt-1">{current?.artistCredit}</div>
            </div>
          </div>

          {/* Scrub bar */}
          <div>
            <div
              ref={progressRef}
              onClick={seek}
              className="w-full h-2 bg-brand-border rounded-full cursor-pointer group relative"
            >
              <div
                className="h-full bg-brand-green rounded-full relative transition-none"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-1.5">
              <span>{formatTime(elapsed)}</span>
              <span>{formatTime(duration || current?.durationSecs || 0)}</span>
            </div>
          </div>

          {/* Playback controls */}
          <div className="flex items-center justify-center gap-7">
            <button
              onClick={() => setIsShuffling((s) => !s)}
              title="Shuffle"
              className={`transition-colors ${isShuffling ? "text-brand-green" : "text-slate-500 hover:text-white"}`}
            >
              <Shuffle size={20} />
            </button>
            <button onClick={prevTrack} title="Previous" className="text-slate-300 hover:text-white transition-colors">
              <SkipBack size={26} fill="currentColor" />
            </button>
            <button
              onClick={togglePlay}
              className="w-16 h-16 rounded-full bg-brand-green flex items-center justify-center hover:bg-green-400 transition-colors shadow-lg shadow-green-900/40"
            >
              {isPlaying
                ? <Pause size={28} className="text-black" fill="black" />
                : <Play size={28} className="text-black ml-0.5" fill="black" />}
            </button>
            <button onClick={nextTrack} title="Next" className="text-slate-300 hover:text-white transition-colors">
              <SkipForward size={26} fill="currentColor" />
            </button>
            <button
              onClick={() => setLoopMode((m) => m === "none" ? "all" : m === "all" ? "one" : "none")}
              title={loopMode === "one" ? "Loop one" : loopMode === "all" ? "Loop all" : "No loop"}
              className={`transition-colors relative ${loopMode !== "none" ? "text-brand-green" : "text-slate-500 hover:text-white"}`}
            >
              <Repeat size={20} />
              {loopMode === "one" && (
                <span className="absolute -top-1.5 -right-1.5 text-[9px] font-bold bg-brand-green text-black rounded-full w-3.5 h-3.5 flex items-center justify-center">1</span>
              )}
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-3 px-1">
            <button onClick={() => setIsMuted((m) => !m)} className="text-slate-400 hover:text-white transition-colors flex-shrink-0">
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range" min="0" max="1" step="0.02"
              value={isMuted ? 0 : volume}
              onChange={(e) => { setVolume(Number(e.target.value)); setIsMuted(false); }}
              className="flex-1 accent-brand-green cursor-pointer"
            />
          </div>

          {/* Social share */}
          <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
            <button
              onClick={() => setShowShare((s) => !s)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                <Share2 size={16} className="text-brand-gold" />
                Share &amp; Post this Anthem
              </span>
              <span className="text-xs text-slate-500">{showShare ? "▲" : "▼"}</span>
            </button>
            {showShare && (
              <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {shareLinks.map((s) => (
                  <a
                    key={s.key}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${s.cls} hover:opacity-80 transition-opacity`}
                  >
                    {s.icon}
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white">{s.label}</div>
                      <div className="text-[10px] text-white/60">{s.description}</div>
                    </div>
                    <ExternalLink size={11} className="ml-auto text-white/40 flex-shrink-0" />
                  </a>
                ))}
                <p className="col-span-full text-[10px] text-slate-600 mt-1">
                  Business account integrations coming soon — connect your accounts to post directly.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Playlist (right) ── */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden sticky top-20">
            <div className="px-4 py-3 border-b border-brand-border text-xs font-semibold uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <Music2 size={12} /> Playlist · {streams.length} tracks
            </div>
            <div className="divide-y divide-brand-border overflow-y-auto max-h-[60vh] lg:max-h-[calc(100vh-220px)]">
              {streams.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => playTrack(idx)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${idx === currentIdx ? "bg-brand-green/10" : "hover:bg-white/5"}`}
                >
                  <span className="text-xl flex-shrink-0">{s.team?.flagEmoji ?? "🏆"}</span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-semibold truncate ${idx === currentIdx ? "text-brand-green" : "text-white"}`}>
                      {s.title}
                    </div>
                    <div className="text-xs text-slate-500">{s.team?.name ?? "FIFA World Cup 2026"}</div>
                  </div>
                  {idx === currentIdx && isPlaying
                    ? <span className="text-brand-green text-[10px] flex-shrink-0 animate-pulse">▶</span>
                    : null}
                  <span className="text-xs text-slate-600 flex-shrink-0">{formatTime(s.durationSecs)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Audio element */}
      <audio
        ref={audioRef}
        onTimeUpdate={() => { if (audioRef.current) setElapsed(audioRef.current.currentTime); }}
        onLoadedMetadata={() => { if (audioRef.current) setDuration(audioRef.current.duration); }}
        onEnded={handleEnded}
        preload="metadata"
      />
    </div>
  );
}
