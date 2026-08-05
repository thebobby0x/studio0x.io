"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic2, Radio, Volume2, Loader2 } from "lucide-react";
import { BroadcastAudio, stingerFor } from "./broadcastAudio";
import { PERSONAS_360, type Speaker360 } from "@/lib/roundtable360/personas";

// ─────────────────────────────────────────────────────────────────────────────
// AI Live 360 Roundtable — the player.
//
// One "GO LIVE" button is the entire entry point. Browsers block audio until a
// user gesture, so the gate is non-negotiable — and it is also the thing that
// makes this feel like tuning into a radio station rather than a page that
// starts shouting at you.
//
// After that click the show runs itself: stadium bed up, segments played line by
// line in each pundit's voice, a stinger on the way in when the segment leads
// with a goal or a red card, and a new segment fetched before the current one
// runs out. When every match goes FT the bed stays up and the card flips to the
// next kickoff — the station does not go off air mid-tournament.
//
// PALETTE NOTE (deliberate deviation from the build brief): the brief specified
// #1A1A2E / #E94560 / #00D9FF. Those are not studio0x colors, and the LC26 skin
// directive in CLAUDE.md is explicit that this deployment uses the official
// palette with "no arbitrary colors anywhere". The intent maps 1:1 onto tokens
// that already exist — Noir 900 for the HUD ground, Rosa 700 for the live
// indicator, Riptide for speaker names and data — so this renders the gaming/
// dark-HUD look the brief asked for using the sanctioned tokens. Flagged for BK.
// ─────────────────────────────────────────────────────────────────────────────

interface Line360 { speaker: Speaker360; text: string; voiceId: string }

interface Episode360 {
  id: string;
  lines: Line360[];
  fixtures: number[];
  leadMomentKey: string | null;
  leadMomentType: string | null;
  generatedAt: string;
}

interface MatchSummary {
  fixture: number;
  matchId: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: string;
  city: string;
}

interface RankedMoment {
  fixture: number;
  type: string;
  minute: number;
  team: string;
  player: string | null;
  detail: string;
  significance: number;
}

interface CurrentPayload {
  showTitle: string;
  onAir: boolean;
  episode: Episode360 | null;
  matchSummaries: MatchSummary[];
  moments: RankedMoment[];
  nextKickoff: { fixture: number; matchup: string; utcDate: string } | null;
}

/** Ticker/scoreboard refresh. Matches the live-sync cadence. */
const POLL_MS = 30_000;

function ttsUrl(line: Line360): string {
  return `/api/roundtable/tts?speaker=${encodeURIComponent(line.speaker)}&text=${encodeURIComponent(line.text)}`;
}

function kickoffLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function RoundtableLive() {
  const [data, setData] = useState<CurrentPayload | null>(null);
  const [live, setLive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [bedLevel, setBedLevel] = useState(0.15);
  const [speaking, setSpeaking] = useState<{ line: Line360; index: number } | null>(null);
  const [nextSpeaker, setNextSpeaker] = useState<Speaker360 | null>(null);
  const [status, setStatus] = useState<string>("");

  const audio = useRef<BroadcastAudio | null>(null);
  const running = useRef(false);
  const abort = useRef<AbortController | null>(null);
  /** Episodes whose stinger has already fired — a goal is announced once. */
  const stung = useRef(new Set<string>());

  // ── scoreboard poll (runs whether or not audio is on) ──────────────────────
  const refresh = useCallback(async (generate: boolean): Promise<CurrentPayload | null> => {
    try {
      const res = await fetch(`/api/roundtable/current${generate ? "?generate=1" : ""}`);
      if (!res.ok) return null;
      const json = (await res.json()) as CurrentPayload;
      setData(json);
      return json;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    refresh(false);
    const t = setInterval(() => refresh(false), POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // ── the broadcast loop ────────────────────────────────────────────────────
  const broadcast = useCallback(async () => {
    const engine = audio.current;
    if (!engine) return;
    let played = new Set<string>();
    // The next segment is requested BEFORE the current one runs out (see the
    // tail of the line loop), so the handover is seamless. A Claude call takes a
    // few seconds; asking for it only once Jamie has signed off would put that
    // gap on air every single segment.
    let pending: Promise<CurrentPayload | null> | null = null;

    while (running.current) {
      // Ask for a fresh segment; the server's cooldown decides whether that
      // actually costs a generation.
      const payload = await (pending ?? refresh(true));
      pending = null;
      if (!running.current) return;

      if (!payload?.onAir) {
        setSpeaking(null);
        setNextSpeaker(null);
        setStatus("off air — the bed stays up until the next kickoff");
        await new Promise((r) => setTimeout(r, POLL_MS));
        continue;
      }

      const ep = payload.episode;
      if (!ep || ep.lines.length === 0 || played.has(ep.id)) {
        // Nothing new to say yet. Hold on the bed and re-ask shortly rather than
        // spinning: the cooldown means an immediate retry would return this same
        // episode anyway.
        setStatus("");
        await new Promise((r) => setTimeout(r, 5_000));
        continue;
      }
      played.add(ep.id);
      if (played.size > 40) played = new Set([ep.id]); // bound the memo

      // Stinger first: the segment leads with a goal / red card / lead change,
      // so the roar lands before Marcus opens his mouth.
      const kind = stingerFor(ep.leadMomentType);
      if (kind && ep.leadMomentKey && !stung.current.has(ep.leadMomentKey)) {
        stung.current.add(ep.leadMomentKey);
        await engine.playStinger(kind);
      }
      if (!running.current) return;

      for (let i = 0; i < ep.lines.length; i++) {
        if (!running.current) return;
        const line = ep.lines[i];
        setSpeaking({ line, index: i });
        setNextSpeaker(ep.lines[i + 1]?.speaker ?? null);
        setStatus("");

        // Warm the next two lines while this one plays — the gap between
        // speakers is what separates a broadcast from a slideshow.
        if (ep.lines[i + 1]) BroadcastAudio.prefetch(ttsUrl(ep.lines[i + 1]));
        if (ep.lines[i + 2]) BroadcastAudio.prefetch(ttsUrl(ep.lines[i + 2]));

        // Three lines out, start writing the next segment so it is ready the
        // moment this one ends.
        if (!pending && i === ep.lines.length - 3) pending = refresh(true);

        abort.current = new AbortController();
        const ok = await engine.playLine(ttsUrl(line), abort.current.signal);
        // A failed line is skipped, not fatal — the bed covers it and the next
        // speaker picks up. Going silent is the one unacceptable outcome.
        if (!ok && !running.current) return;
      }
      setSpeaking(null);
    }
  }, [refresh]);

  const goLive = useCallback(async () => {
    if (live || starting) return;
    setStarting(true);
    try {
      const engine = new BroadcastAudio({ bed: bedLevel });
      audio.current = engine;
      await engine.resume();
      await engine.startBed();
      running.current = true;
      setLive(true);
      setStatus("tuning in…");
      void broadcast();
    } catch {
      setStatus("audio could not start in this browser");
      audio.current?.dispose();
      audio.current = null;
    } finally {
      setStarting(false);
    }
  }, [live, starting, bedLevel, broadcast]);

  const goOffAir = useCallback(() => {
    running.current = false;
    abort.current?.abort();
    audio.current?.dispose();
    audio.current = null;
    setLive(false);
    setSpeaking(null);
    setNextSpeaker(null);
    setStatus("");
  }, []);

  useEffect(() => {
    return () => {
      running.current = false;
      abort.current?.abort();
      audio.current?.dispose();
      audio.current = null;
    };
  }, []);

  const onBedChange = useCallback((v: number) => {
    setBedLevel(v);
    audio.current?.setBedLevel(v);
  }, []);

  const matches = data?.matchSummaries ?? [];
  const onAir = Boolean(data?.onAir);
  const title = data?.showTitle ?? "Live 360 Roundtable";

  return (
    <section className="s0x-card s0x-hud-grid overflow-hidden">
      {/* ── header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b border-s0x-border px-4 py-3">
        <Radio size={16} className="shrink-0 text-s0x-ink" />
        <div className="min-w-0">
          <div className="s0x-eyebrow">{title}</div>
          <div className="s0x-mono mt-0.5 text-[10px] text-s0x-muted">
            {onAir
              ? `${matches.length} ${matches.length === 1 ? "match" : "matches"} live`
              : "off air"}
          </div>
        </div>
        {onAir && live && (
          <span className="s0x-live ml-auto shrink-0">
            <span className="s0x-live-dot" />
            on air
          </span>
        )}
      </div>

      {/* ── the autoplay gate ────────────────────────────────────────────── */}
      {!live ? (
        <div className="space-y-3 px-4 py-5">
          <button
            onClick={goLive}
            disabled={starting}
            className="s0x-btn s0x-btn-primary w-full disabled:opacity-60"
          >
            {starting ? <Loader2 size={13} className="animate-spin" /> : <Mic2 size={13} />}
            {starting ? "tuning in…" : "🎙 Go Live"}
          </button>
          <p className="text-[11px] leading-relaxed text-s0x-muted">
            {onAir
              ? "Three AI pundits calling every match in play, with stadium atmosphere underneath. Audio starts on your click — browsers require it."
              : data?.nextKickoff
                ? `Nothing in play right now. Next broadcast: ${data.nextKickoff.matchup} · ${kickoffLabel(data.nextKickoff.utcDate)}.`
                : "Nothing in play right now. The booth opens when the next match kicks off."}
          </p>
        </div>
      ) : (
        <>
          {/* ── on-air panel ───────────────────────────────────────────── */}
          <div className="min-h-[8.5rem] px-4 py-4">
            {speaking ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="s0x-mono text-[11px] font-bold text-s0x-teal">
                    {PERSONAS_360[speaking.line.speaker].name}
                  </span>
                  <span className="text-[10px] text-s0x-muted">
                    {PERSONAS_360[speaking.line.speaker].role}
                  </span>
                  <Volume2 size={12} className="ml-auto shrink-0 text-s0x-teal" />
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-s0x-text">{speaking.line.text}</p>
              </>
            ) : (
              <div className="flex h-full items-center gap-2 text-[11px] text-s0x-muted">
                <Loader2 size={13} className="animate-spin text-s0x-teal" />
                {status || "back to the booth…"}
              </div>
            )}

            {nextSpeaker && (
              <div className="s0x-mono mt-3 text-[10px] text-s0x-muted/70">
                coming up · {PERSONAS_360[nextSpeaker].name}
              </div>
            )}
          </div>

          {/* ── key plays the booth is working from ────────────────────── */}
          {(data?.moments.length ?? 0) > 0 && (
            <div className="border-t border-s0x-border px-4 py-3">
              <div className="s0x-mono mb-1.5 text-[9px] text-s0x-muted">key plays</div>
              <ul className="space-y-1">
                {data!.moments.slice(0, 3).map((m, i) => (
                  <li key={`${m.fixture}-${i}`} className="s0x-data text-[11px] text-s0x-text/80">
                    <span className="text-s0x-teal">{m.minute}&apos;</span>{" "}
                    {m.detail} — {m.team}
                    {m.player ? ` · ${m.player}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── mixer + off-air ────────────────────────────────────────── */}
          <div className="flex items-center gap-3 border-t border-s0x-border px-4 py-3">
            <label className="s0x-mono shrink-0 text-[9px] text-s0x-muted" htmlFor="rt360-bed">
              crowd
            </label>
            <input
              id="rt360-bed"
              type="range"
              min={0}
              max={0.6}
              step={0.01}
              value={bedLevel}
              onChange={(e) => onBedChange(Number(e.target.value))}
              className="h-1 flex-1 cursor-pointer accent-s0x-teal"
              aria-label="Stadium ambience volume"
            />
            <button onClick={goOffAir} className="s0x-btn s0x-btn-secondary shrink-0 !px-3 !py-1">
              stop
            </button>
          </div>
        </>
      )}

      {/* ── match ticker ───────────────────────────────────────────────── */}
      {matches.length > 0 && (
        <div className="overflow-x-auto border-t border-s0x-border bg-s0x-bg/60 px-4 py-2">
          <div className="s0x-data flex items-center gap-4 whitespace-nowrap text-[11px]">
            {matches.map((m) => (
              <span key={m.fixture} className="shrink-0">
                <span className="text-s0x-muted">{m.home}</span>{" "}
                <span className="font-bold text-s0x-teal">
                  {m.homeScore}-{m.awayScore}
                </span>{" "}
                <span className="text-s0x-muted">{m.away}</span>{" "}
                <span className="text-s0x-ink">{m.status === "HT" ? "HT" : `${m.minute}'`}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="s0x-mono border-t border-s0x-border px-4 py-2 text-[9px] text-s0x-muted/60">
        studio0x · AI-generated conversation between fictional pundit characters · every score, event
        and name spoken is read from live match data — opinions are the panel&apos;s, not fact
      </div>
    </section>
  );
}
