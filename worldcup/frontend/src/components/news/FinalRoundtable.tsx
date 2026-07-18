"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic2, Play, Pause, Volume2, Loader2 } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// The Roundtable player — podcast-style pregame panel (owner request 7/17).
// Renders the generated conversation as a transcript; each line plays in its
// speaker's own voice via /api/ai/tts (persona-keyed). "Play episode" queues
// every line sequentially — the podcast experience.
// Colors: gold host accents, slate panel text — per color discipline.
// ─────────────────────────────────────────────────────────────────────────────

interface Line { speaker: "lorraine" | "henry" | "roberto" | "ricky"; text: string }
interface Roundtable { fixture: number; title: string; matchup: string; lines: Line[]; generatedAt: string }

const SPEAKERS: Record<Line["speaker"], { name: string; role: string; accent: string }> = {
  lorraine: { name: "Lorraine Footy", role: "Host · Britain",                 accent: "text-brand-gold" },
  henry:    { name: "Henry Futois",   role: "French ex-pro · flair & tactics", accent: "text-slate-200" },
  roberto:  { name: "Roberto Madrid", role: "Spanish ex-goalkeeper",           accent: "text-slate-200" },
  ricky:    { name: "Ricky Riquelme", role: "Argentinian legend · old school", accent: "text-slate-200" },
};

// btoa is Latin-1 only — the unicode-safe pattern used everywhere in this app.
function lineId(fixture: number, i: number, text: string): string {
  const b64 = btoa(unescape(encodeURIComponent(text))).replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
  return `roundtable-${fixture}-${i}-${b64}`;
}

export default function FinalRoundtable({ fixture }: { fixture: number }) {
  const [rt, setRt] = useState<Roundtable | null>(null);
  const [loading, setLoading] = useState(true);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const [fetchingIdx, setFetchingIdx] = useState<number | null>(null);
  const [episodeMode, setEpisodeMode] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const episodeRef = useRef(false);
  // Prefetch pipeline (owner 7/17: gaps between speakers). URL promises are
  // memoised per line and the NEXT lines' audio is requested + preloaded while
  // the current one plays, so first-listen TTS generation happens off-air.
  const urlCache = useRef(new Map<number, Promise<string | null>>());
  const preloaded = useRef(new Map<number, HTMLAudioElement>());

  useEffect(() => {
    let alive = true;
    fetch(`/api/ai/roundtable?fixture=${fixture}`)
      .then((r) => r.json())
      .then((j) => { if (alive) { setRt(j.roundtable ?? null); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [fixture]);

  const stop = useCallback(() => {
    episodeRef.current = false;
    setEpisodeMode(false);
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingIdx(null);
  }, []);

  const getUrl = useCallback((i: number): Promise<string | null> => {
    if (!rt || i < 0 || i >= rt.lines.length) return Promise.resolve(null);
    const existing = urlCache.current.get(i);
    if (existing) return existing;
    const line = rt.lines[i];
    const promise = fetch("/api/ai/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: line.text, storyId: lineId(rt.fixture, i, line.text), persona: line.speaker }),
    })
      .then((r) => r.json())
      .then((j) => (j.url as string) ?? null)
      .catch(() => {
        urlCache.current.delete(i); // allow retry after a failure
        return null;
      });
    urlCache.current.set(i, promise);
    return promise;
  }, [rt]);

  // Request generation AND preload the mp3 bytes for a line, without playing it.
  const prefetch = useCallback((i: number) => {
    getUrl(i).then((url) => {
      if (url && !preloaded.current.has(i)) {
        const a = new Audio(url);
        a.preload = "auto";
        preloaded.current.set(i, a);
      }
    });
  }, [getUrl]);

  const playLine = useCallback(async (i: number): Promise<boolean> => {
    if (!rt) return false;
    setFetchingIdx(i);
    try {
      // Pipeline: while this line resolves/plays, warm the next two.
      prefetch(i + 1);
      prefetch(i + 2);
      const url = await getUrl(i);
      if (!url) return false;
      setFetchingIdx(null);
      setPlayingIdx(i);
      return await new Promise<boolean>((resolve) => {
        const audio = preloaded.current.get(i) ?? new Audio(url);
        preloaded.current.delete(i);
        audio.currentTime = 0;
        audioRef.current = audio;
        audio.onended = () => resolve(true);
        audio.onerror = () => resolve(false);
        audio.play().catch(() => resolve(false));
      });
    } catch {
      return false;
    } finally {
      setFetchingIdx(null);
    }
  }, [rt, getUrl, prefetch]);

  const playEpisode = useCallback(async () => {
    if (!rt || episodeRef.current) return;
    episodeRef.current = true;
    setEpisodeMode(true);
    prefetch(0);
    prefetch(1);
    for (let i = 0; i < rt.lines.length; i++) {
      if (!episodeRef.current) break;
      const ok = await playLine(i);
      if (!ok) break;
    }
    stop();
  }, [rt, playLine, stop, prefetch]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-brand-card border border-brand-border p-6 flex items-center gap-3 text-slate-500 text-sm">
        <Loader2 size={16} className="animate-spin text-brand-gold" />
        Recording The Roundtable…
      </div>
    );
  }
  if (!rt) return null;

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      <div className="px-4 py-3 border-b border-brand-border flex items-center gap-3">
        <Mic2 size={16} className="text-brand-gold shrink-0" />
        <div className="min-w-0">
          <div className="text-xs font-black uppercase tracking-widest text-brand-gold">The Roundtable</div>
          <div className="text-[11px] text-slate-500 truncate">{rt.title} · AI-generated panel</div>
        </div>
        <button
          onClick={episodeMode ? stop : playEpisode}
          className="ml-auto flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full bg-brand-gold/15 border border-brand-gold/40 text-brand-gold hover:bg-brand-gold/25 transition-colors shrink-0"
        >
          {episodeMode ? <Pause size={11} /> : <Play size={11} />}
          {episodeMode ? "Stop" : "Play episode"}
        </button>
      </div>

      <div className="divide-y divide-brand-border/50 max-h-96 overflow-y-auto">
        {rt.lines.map((line, i) => {
          const sp = SPEAKERS[line.speaker];
          const active = playingIdx === i;
          return (
            <div key={i} className={`px-4 py-3 flex gap-3 ${active ? "bg-brand-gold/5" : ""}`}>
              <button
                onClick={() => { stop(); playLine(i).then(() => setPlayingIdx(null)); }}
                className="mt-0.5 shrink-0 text-slate-500 hover:text-brand-gold transition-colors"
                aria-label={`Listen to ${sp.name}`}
              >
                {fetchingIdx === i ? <Loader2 size={14} className="animate-spin" /> : active ? <Volume2 size={14} className="text-brand-gold" /> : <Play size={14} />}
              </button>
              <div className="min-w-0">
                <span className={`text-[11px] font-black uppercase tracking-wider ${sp.accent}`}>{sp.name}</span>
                <span className="text-[10px] text-slate-600 ml-2">{sp.role}</span>
                <p className="text-sm text-slate-300 leading-relaxed mt-0.5">{line.text}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4 py-2 border-t border-brand-border text-[9px] text-slate-700 font-mono">
        studio0x · AI-generated conversation with fictional pundit characters — not affiliated with any real player or club · projected lineups and tactics are speculation, not team news
      </div>
    </div>
  );
}
