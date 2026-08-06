"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic2, Radio, Volume2, Loader2 } from "lucide-react";
import { BroadcastAudio, stingerFor } from "./broadcastAudio";
import { PERSONAS_360, type Speaker360 } from "@/lib/roundtable360/personas";
import { cueIsCovered, type BreakingCue } from "@/lib/roundtable360/breaking";

// ─────────────────────────────────────────────────────────────────────────────
// AI Live 360 Roundtable — the player.
//
// The cast is THE Roundtable — Lorraine, Henry, Roberto and Ricky, the same four
// voices as the pregame panel and the live commentary booth (owner directive:
// one familiar broadcast team across every tournament). See lib/roundtable360/
// personas.ts; do not re-cast this surface.
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

/** One conversation burst: 2-4 lines, stored as a single stitched audio object. */
interface Group360 {
  index: number;
  lineIndexes: number[];
  url: string | null;
  bytes: number;
}

interface Episode360 {
  id: string;
  lines: Line360[];
  fixtures: number[];
  leadMomentKey: string | null;
  leadMomentType: string | null;
  groups: Group360[];
  audioMode: "blob" | "stream";
  warnings: string[];
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
  pauseMs: number;
  warnings: string[];
  matchSummaries: MatchSummary[];
  moments: RankedMoment[];
  nextKickoff: { fixture: number; matchup: string; utcDate: string } | null;
}

/** Ticker/scoreboard refresh. Matches the live-sync cadence. */
const POLL_MS = 30_000;

/**
 * Breaking-news check, while on air only.
 *
 * Three times the scoreboard's rate, and affordable because `/api/roundtable/cue`
 * is two indexed queries with no model call behind it — it is physically unable
 * to trigger a generation however often it is hit. The number is the worst-case
 * delay between a goal being recorded and this player knowing about it, so it is
 * the largest single term in "how late does the booth sound".
 */
const CUE_POLL_MS = 10_000;

/** Fallback if the server does not send one. */
const DEFAULT_PAUSE_MS = 5_000;

/** Spacing between speakers when a burst has to be streamed line by line.
 *  Mirrors the gap baked into a stitched group server-side. */
const INTRA_GROUP_GAP_MS = 260;

/** The stored group object — one fetch, one decode, the whole burst. */
function groupUrl(episodeId: string, index: number): string {
  return `/api/roundtable/tts?episodeId=${encodeURIComponent(episodeId)}&group=${index}`;
}

/** Per-line streaming — used only when a group has no stored object. */
function lineUrl(line: Line360): string {
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

export interface RoundtableLiveProps {
  /**
   * Restrict the breaking-news cue to these fixtures.
   *
   * The SHOW itself stays global — it is a whip-around, and generating a
   * separate episode per match page would multiply the Claude and ElevenLabs
   * spend by the number of live matches for no editorial gain. What this narrows
   * is when the player CUTS IN: on a match page, a goal in some other game
   * should not interrupt the segment you are listening to about this one.
   */
  fixtures?: number[];
}

export default function RoundtableLive({ fixtures }: RoundtableLiveProps = {}) {
  const [data, setData] = useState<CurrentPayload | null>(null);
  const [live, setLive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [bedLevel, setBedLevel] = useState(0.15);
  const [speaking, setSpeaking] = useState<{ line: Line360; index: number } | null>(null);
  const [nextSpeaker, setNextSpeaker] = useState<Speaker360 | null>(null);
  const [status, setStatus] = useState<string>("");
  /** True once consecutive bursts have produced no speech at all. */
  const [audioDown, setAudioDown] = useState(false);
  /** The moment that forced the segment currently on air. Drives the BREAKING
   *  chip; cleared when the segment it interrupted for finishes. */
  const [breaking, setBreaking] = useState<BreakingCue | null>(null);
  /** The audio context is not running — the browser is holding sound back and
   *  only a tap can release it. Drives the tap-to-enable banner. */
  const [needsUnlock, setNeedsUnlock] = useState(false);
  /** The most recent concrete audio failure, surfaced verbatim. Every failure in
   *  this chain is otherwise silent and indistinguishable from the others. */
  const [audioIssue, setAudioIssue] = useState<string | null>(null);

  const audio = useRef<BroadcastAudio | null>(null);
  const running = useRef(false);
  const abort = useRef<AbortController | null>(null);
  /** Consecutive bursts that produced no audio. Two in a row = chain is down. */
  const mutedRuns = useRef(0);
  /** Episodes whose stinger has already fired — a goal is announced once. */
  const stung = useRef(new Set<string>());
  /** The episode actually being PLAYED right now — not necessarily the newest
   *  one on the server. This is what a cue is judged against. */
  const airing = useRef<{ leadMomentKey: string | null; generatedAt: string } | null>(null);
  /** A cue the listener has not heard yet, waiting for the current burst to end.
   *  Set by the cue poll, consumed by the broadcast loop. */
  const pendingCue = useRef<BreakingCue | null>(null);
  /** Cues already acted on, so one goal cuts in once and not on every poll. */
  const handledCues = useRef(new Set<string>());
  /** Wall-clock of the last stinger, so a cut-in roar and the following
   *  segment's lead roar do not both fire for the same goal. */
  const lastStingerAt = useRef(0);
  const fixtureParam = fixtures?.length ? `?fixtures=${fixtures.join(",")}` : "";

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

  // ── breaking-news cue poll (only while on air) ────────────────────────────
  // Off air there is nothing to interrupt, so this does not run at all — the
  // card on a dashboard nobody has tuned into costs exactly the 30s scoreboard
  // poll it always did.
  useEffect(() => {
    if (!live) return;

    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(`/api/roundtable/cue${fixtureParam}`);
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { cue: BreakingCue | null };
        const cue = json.cue;
        if (!cue || cancelled) return;

        // Judged against the episode being PLAYED, not the newest one written.
        // A segment can be generated seconds after a goal and still be twenty
        // seconds from the listener's ears; until they have heard it, the goal
        // is news to them.
        if (handledCues.current.has(cue.key)) return;
        if (cueIsCovered(cue, airing.current)) return;

        pendingCue.current = cue;
      } catch {
        // A failed cue check is a missed head start, never a broken show.
      }
    };

    void check();
    const t = setInterval(check, CUE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [live, fixtureParam]);

  // ── the broadcast loop ────────────────────────────────────────────────────
  const broadcast = useCallback(async () => {
    const engine = audio.current;
    if (!engine) return;
    let played = new Set<string>();
    // The next segment is requested BEFORE the current one runs out (see the
    // tail of the line loop), so the handover is seamless. A Claude call takes a
    // few seconds; asking for it only once Lorraine has signed off would put
    // that gap on air every single segment.
    let pending: Promise<CurrentPayload | null> | null = null;

    while (running.current) {
      // Ask for a fresh segment; the server's cooldown decides whether that
      // actually costs a generation.
      const payload = await (pending ?? refresh(true));
      pending = null;
      if (!running.current) return;

      // A segment written but not yet heard outranks the off-air state. The
      // full-time wrap is generated at the exact instant the last match leaves
      // the board, so `onAir` is already false by the time it exists — bailing
      // on `onAir` alone would throw away the one segment a viewer is most
      // likely to be waiting for.
      const unplayed =
        payload?.episode != null &&
        payload.episode.lines.length > 0 &&
        !played.has(payload.episode.id);

      if (!payload?.onAir && !unplayed) {
        setSpeaking(null);
        setNextSpeaker(null);
        setStatus(
          payload?.nextKickoff
            ? `NEXT BROADCAST · ${payload.nextKickoff.matchup} · ${kickoffLabel(payload.nextKickoff.utcDate)}`
            : "off air — the bed stays up until the next kickoff",
        );
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

      // What is on air now. The cue poll reads this to decide whether something
      // has happened that this listener has not yet heard about.
      airing.current = { leadMomentKey: ep.leadMomentKey, generatedAt: ep.generatedAt };

      // Stinger first: the segment leads with a goal / red card / lead change,
      // so the roar lands before Lorraine opens her mouth.
      //
      // Unless the cut-in already fired one. A cue and an episode lead can be
      // the SAME goal recorded under two different keys — the cue comes from the
      // event bus (`GOAL|1H|23|Normal Goal Messi`), the lead from MatchEventLog
      // (`Goal|Normal Goal|23|Messi`) — so they cannot be deduped by key. Time is
      // the reliable discriminator: two roars a few seconds apart are the same
      // goal being announced twice.
      const kind = stingerFor(ep.leadMomentType);
      const justStung = Date.now() - lastStingerAt.current < 15_000;
      if (kind && ep.leadMomentKey && !stung.current.has(ep.leadMomentKey) && !justStung) {
        stung.current.add(ep.leadMomentKey);
        lastStingerAt.current = Date.now();
        await engine.playStinger(kind);
      }
      if (!running.current) return;

      // ── play the episode as conversation bursts ──────────────────────────
      // A group is one stored object: 2-4 lines already stitched with short
      // gaps, so the burst plays as continuous speech. Between groups the show
      // holds on the stadium bed — that silence is the point, not a failure.
      const pauseMs = payload.pauseMs || DEFAULT_PAUSE_MS;
      const groups: Group360[] =
        ep.groups?.length > 0
          ? ep.groups
          : // No grouping (e.g. an episode written before groups existed) —
            // treat every line as its own burst rather than refusing to play.
            ep.lines.map((_, i) => ({ index: i, lineIndexes: [i], url: null, bytes: 0 }));

      for (let g = 0; g < groups.length; g++) {
        if (!running.current) return;
        const group = groups[g];
        const first = ep.lines[group.lineIndexes[0]];
        if (!first) continue;

        setSpeaking({ line: first, index: group.lineIndexes[0] });
        setNextSpeaker(ep.lines[groups[g + 1]?.lineIndexes[0] ?? -1]?.speaker ?? null);
        setStatus("");

        // Warm the next burst's object while this one plays.
        const next = groups[g + 1];
        if (next?.url) BroadcastAudio.prefetch(groupUrl(ep.id, next.index));

        // One group out, start writing the next segment so it is ready the
        // moment this one ends.
        if (!pending && g === groups.length - 2) pending = refresh(true);

        abort.current = new AbortController();
        let ok = false;
        if (group.url) {
          ok = await engine.playLine(groupUrl(ep.id, group.index), abort.current.signal);
        }
        if (ok) mutedRuns.current = 0;
        if (!ok && running.current) {
          // Fallback: the group was never stored (Blob at capacity) or its
          // object would not decode. The transcript is in hand, so stream the
          // lines individually and space them ourselves — same conversation,
          // more expensive delivery.
          let spokeAny = false;
          for (const li of group.lineIndexes) {
            if (!running.current) return;
            const line = ep.lines[li];
            if (!line) continue;
            setSpeaking({ line, index: li });
            abort.current = new AbortController();
            if (await engine.playLine(lineUrl(line), abort.current.signal)) spokeAny = true;
            await engine.silence(INTRA_GROUP_GAP_MS);
          }
          // Nothing at all came out — neither the stored group nor any of its
          // lines. Count it: a run of these means the audio chain is down, not
          // that one line glitched, and the listener deserves to be told rather
          // than left with crowd noise and a scrolling transcript (LC26, 8/5:
          // an invalid API key produced exactly that, silently).
          mutedRuns.current = spokeAny ? 0 : mutedRuns.current + 1;
          if (spokeAny) setAudioDown(false);
          else if (mutedRuns.current >= 2) setAudioDown(true);
        }

        // ── the cut-in ────────────────────────────────────────────────────
        // Something has happened that this listener has not heard. Abandon the
        // rest of the segment and go get the one that covers it.
        //
        // AT A GROUP BOUNDARY, NEVER MID-BURST. A group is one stitched audio
        // object — a conversational exchange — and cutting it off would clip a
        // pundit mid-sentence, which reads as a bug rather than as urgency. Real
        // broadcast does the same thing: the presenter finishes their line, then
        // "…we're going to interrupt you there".
        if (pendingCue.current) break;

        // The natural pause — crowd only. The last thing said stays on screen
        // rather than flipping to a spinner: this is a beat in the show, not a
        // loading state. Skipped after the final burst so the next segment
        // starts straight away.
        if (running.current && g < groups.length - 1) {
          await engine.silence(pauseMs);
        }
      }
      setSpeaking(null);

      // ── consume the cue ──────────────────────────────────────────────────
      // Reached either by the break above or by the segment ending naturally
      // while a cue was waiting. Either way the roar goes up here and the loop
      // then asks for the segment about it: the server's breaking-news floor
      // (BREAKING_REGEN_MS) is what makes that request actually generate rather
      // than hand back the same episode.
      const cue = pendingCue.current;
      if (cue && running.current) {
        pendingCue.current = null;
        handledCues.current.add(cue.key);
        if (handledCues.current.size > 60) handledCues.current = new Set([cue.key]);
        setBreaking(cue);

        const cueKind = stingerFor(cue.type);
        if (cueKind) {
          lastStingerAt.current = Date.now();
          await engine.playStinger(cueKind);
        } else {
          // Kick-off, half-time and full-time get no horn — there is nothing to
          // celebrate — but the crowd still lifts. The swell alone is the cue.
          engine.swellBed();
        }
        // Cancel any prefetched-but-unplayed segment decision; the next loop
        // iteration re-asks and gets the breaking one.
        pending = null;
      } else if (!cue) {
        setBreaking(null);
      }
    }
  }, [refresh]);

  const goLive = useCallback(async () => {
    if (live || starting) return;
    setStarting(true);
    try {
      const engine = new BroadcastAudio({ bed: bedLevel, onIssue: setAudioIssue });
      audio.current = engine;

      // THE UNLOCK, AND IT HAPPENS BEFORE ANY `await`.
      //
      // This is the whole iOS fix. `goLive` is async, and every `await` inside
      // it hands control back to the event loop — after which WebKit no longer
      // considers the code to be running inside the user's tap. The previous
      // order (`await engine.resume()` first) meant the silent-buffer start that
      // actually unlocks WebKit never ran under user activation at all, so the
      // context reported itself "running" and emitted nothing. Everything
      // asynchronous has to come after this line.
      engine.unlock();

      await engine.startBed();
      // Ask the context directly rather than trusting that the tap worked.
      setNeedsUnlock(!engine.running);
      running.current = true;
      setLive(true);
      setStatus("tuning in…");
      void broadcast();
    } catch (e) {
      setStatus("audio could not start in this browser");
      setAudioIssue(e instanceof Error ? e.message : String(e));
      audio.current?.dispose();
      audio.current = null;
    } finally {
      setStarting(false);
    }
  }, [live, starting, bedLevel, broadcast]);

  /**
   * Re-unlock from a tap on the banner.
   *
   * Deliberately NOT async and deliberately doing the work first: the same
   * activation rule that broke `goLive` applies to every later recovery tap.
   */
  const tapToEnable = useCallback(() => {
    const engine = audio.current;
    if (!engine) return;
    engine.unlock();
    setAudioIssue(null);
    // The context reports its real state a tick after resume() settles.
    window.setTimeout(() => setNeedsUnlock(!engine.running), 300);
  }, []);

  // ── iOS suspends the context whenever the app is backgrounded ─────────────
  // A phone locking the screen, a call arriving, or a tab switch all suspend the
  // AudioContext, and coming back does NOT resume it. Across ninety minutes on a
  // phone this is a certainty, not an edge case, so the show watches for it and
  // asks for one tap rather than going quietly dead.
  useEffect(() => {
    if (!live) return;

    const check = async () => {
      const engine = audio.current;
      if (!engine) return;
      setNeedsUnlock(!(await engine.ensureRunning()));
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const t = setInterval(check, 5_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(t);
    };
  }, [live]);

  const goOffAir = useCallback(() => {
    running.current = false;
    abort.current?.abort();
    audio.current?.dispose();
    audio.current = null;
    // Nothing is on air, so nothing can be interrupted. Clearing these matters:
    // a stale `airing` would make the next GO LIVE judge fresh cues against a
    // segment from the last time this tab was listening.
    airing.current = null;
    pendingCue.current = null;
    setLive(false);
    setSpeaking(null);
    setNextSpeaker(null);
    setBreaking(null);
    setNeedsUnlock(false);
    setAudioIssue(null);
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
            {speaking ? "🎙 live commentary" : "on air"}
          </span>
        )}
      </div>

      {/* ── tap to enable audio ──────────────────────────────────────────── */}
      {/* iOS Safari blocks sound until a gesture, and re-blocks it every time the
          app is backgrounded. This is a full-width tap target rather than a
          small button because it is the difference between a working broadcast
          and a silent one, and because it is most often needed on a phone. */}
      {live && needsUnlock && (
        <button
          onClick={tapToEnable}
          className="flex w-full items-center gap-2 border-b border-s0x-ink bg-s0x-ink/25 px-4 py-3 text-left"
        >
          <span className="shrink-0 text-base">🔊</span>
          <span className="min-w-0">
            <span className="s0x-mono block text-[11px] font-bold text-s0x-text">
              Tap to enable audio
            </span>
            <span className="block text-[10px] leading-relaxed text-s0x-muted">
              Your browser is holding sound back. On iPhone, also check the ring/silent
              switch on the side of the phone.
            </span>
          </span>
        </button>
      )}

      {/* The concrete reason, when there is one. Kept separate from the tap
          target so a diagnostic can never be mistaken for the fix. */}
      {live && audioIssue && !needsUnlock && (
        <p className="s0x-mono border-b border-s0x-border px-4 py-2 text-[10px] leading-relaxed text-s0x-accent">
          ⚠ {audioIssue}
        </p>
      )}

      {/* ── breaking-news banner ─────────────────────────────────────────── */}
      {/* The panel cut in for something. Naming the moment is what separates
          "the audio changed" from "a goal just went in" for anyone listening
          with the sound low or reading rather than listening. */}
      {live && breaking && (
        <div className="flex items-center gap-2 border-b border-s0x-border bg-s0x-ink/15 px-4 py-2">
          <span className="s0x-mono shrink-0 rounded bg-s0x-ink px-1.5 py-0.5 text-[9px] font-bold text-s0x-onink">
            BREAKING
          </span>
          <span className="s0x-data min-w-0 truncate text-[11px] text-s0x-text">
            {breaking.clockLabel ? `${breaking.clockLabel} · ` : ""}
            {breaking.detail}
            {breaking.team ? ` — ${breaking.team}` : ""}
            {breaking.entity ? ` · ${breaking.entity}` : ""}
          </span>
        </div>
      )}

      {/* ── configuration warnings ───────────────────────────────────────── */}
      {/* A missing voice id or a full Blob store degrades the show quietly at
          runtime. Silence with no explanation reads as a bug, so it is stated
          on the surface rather than buried in a server log. */}
      {((data?.warnings.length ?? 0) > 0 || audioDown) && (
        <div className="space-y-1 border-b border-s0x-ink/40 bg-s0x-ink/10 px-4 py-2">
          {audioDown && (data?.warnings.length ?? 0) === 0 && (
            <p className="s0x-mono text-[10px] leading-relaxed text-s0x-accent">
              ⚠ The panel is muted — speech synthesis is not responding. The transcript and the
              stadium feed continue below.
            </p>
          )}
          {data?.warnings.map((w, i) => (
            <p key={i} className="s0x-mono text-[10px] leading-relaxed text-s0x-accent">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

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
              ? "Lorraine, Henry, Roberto and Ricky calling every match in play, with stadium atmosphere underneath. Audio starts on your click — browsers require it."
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
