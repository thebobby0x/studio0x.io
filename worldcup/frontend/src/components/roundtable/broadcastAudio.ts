// ─────────────────────────────────────────────────────────────────────────────
// AI Live 360 Roundtable — the three-layer broadcast mixer.
//
//   stingers   (highest)  goal / red card / lead change — everything ducks
//   commentary (mid)      the pundit lines, streamed from /api/roundtable/tts
//   ambience   (lowest)   continuous stadium bed, never stops
//
// One GainNode per layer into a master gain. Ducking is a scheduled ramp on the
// two lower gains, restored after the stinger's own length — no state machine,
// no chance of a duck that never lifts.
//
// THE BED AND THE STINGERS ARE SYNTHESISED IN THE BROWSER, not files. Three
// reasons, in order: the Blob/ElevenLabs storage quota is full and this feature
// may not add to it; a generated bed loops forever with no seam and no licence
// question; and it costs zero bytes on every page load of a surface that is
// meant to sit open for 90 minutes. Both layers are still SWAPPABLE — set
// NEXT_PUBLIC_STADIUM_BED_URL / NEXT_PUBLIC_STINGER_URL and the engine fetches
// and uses those instead, so BK can drop in real crowd audio without a code
// change.
// ─────────────────────────────────────────────────────────────────────────────

/** Optional real audio, if BK ever hosts it. Empty → synthesise. */
export const STADIUM_BED_URL = process.env.NEXT_PUBLIC_STADIUM_BED_URL ?? "";
export const STINGER_URL = process.env.NEXT_PUBLIC_STINGER_URL ?? "";

export type StingerKind = "GOAL" | "RED_CARD" | "LEAD_CHANGE" | "GENERIC";

/** Which moment types are worth interrupting the show for. */
export function stingerFor(momentType: string | null | undefined): StingerKind | null {
  switch (momentType) {
    case "GOAL":
    case "OWN_GOAL":
    case "PENALTY_SCORED":
    case "EQUALISER":
      return "GOAL";
    case "RED_CARD":
      return "RED_CARD";
    case "LEAD_CHANGE":
      return "LEAD_CHANGE";
    case "PENALTY_MISSED":
      return "GENERIC";
    default:
      return null;
  }
}

const BED_SECONDS = 12;
const BED_CROSSFADE = 0.4; // seam-free loop: tail is folded back over the head

// ── Goal swell ───────────────────────────────────────────────────────────────
// The crowd's own reaction, layered under the produced stinger. Multiplier is
// relative to the listener's mixer setting and clamped to 1.0 at the top, so the
// swell is proportional at any crowd level rather than a fixed shout.
const SWELL_PEAK_MULT = 3.2;
const SWELL_RISE_S = 0.35; // fast — a crowd erupts, it does not fade in
const SWELL_HOLD_S = 1.2;
const SWELL_DECAY_S = 5; // the long settle back to the bed

/** Filtered noise that reads as a distant crowd rather than hiss, written so the
 *  buffer's end already blends into its start — a plain noise loop clicks. */
function makeCrowdBuffer(ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(BED_SECONDS * rate);
  const buffer = ctx.createBuffer(2, length, rate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);

    // Pink-ish noise (Voss-McCartney, 5 rows) — brown/pink weighting is what
    // makes noise sound like a room full of people instead of a hi-hat.
    const rows = [0, 0, 0, 0, 0];
    let running = 0;
    for (let i = 0; i < length; i++) {
      // Update one row per sample, chosen by trailing-zero count.
      let n = i;
      let row = 0;
      while ((n & 1) === 0 && row < rows.length - 1) {
        n >>= 1;
        row++;
      }
      running -= rows[row];
      rows[row] = Math.random() * 2 - 1;
      running += rows[row];
      data[i] = running / rows.length;
    }

    // Slow swells — a crowd breathes. Two incommensurate LFOs so the pattern
    // never audibly repeats inside a loop.
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const swell =
        0.72 +
        0.2 * Math.sin((2 * Math.PI * t) / 7.3 + ch) +
        0.12 * Math.sin((2 * Math.PI * t) / 2.9 + ch * 1.7);
      data[i] *= swell;
    }

    // Fold the tail back over the head so looping is seamless.
    const fade = Math.floor(BED_CROSSFADE * rate);
    for (let i = 0; i < fade; i++) {
      const k = i / fade; // 0 → 1
      data[i] = data[i] * k + data[length - fade + i] * (1 - k);
    }
  }
  return buffer;
}

async function fetchBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await ctx.decodeAudioData(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export interface BroadcastLevels {
  bed: number;
  voice: number;
  stinger: number;
}

export class BroadcastAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private bedGain: GainNode;
  private voiceGain: GainNode;
  private stingerGain: GainNode;

  private bedSource: AudioBufferSourceNode | null = null;
  private voiceSource: AudioBufferSourceNode | null = null;
  private bedLevel: number;
  private voiceLevel: number;
  private disposed = false;
  /** Cancellers for in-flight silence() waits, so dispose() never leaves the
   *  broadcast loop parked in a pause that will never end. */
  private pending = new Set<() => void>();

  constructor(levels: Partial<BroadcastLevels> = {}) {
    // Constructed inside the user's click handler — the autoplay gate. Every
    // browser blocks audio until then, which is also why the show has exactly
    // one entry point.
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();

    this.bedLevel = levels.bed ?? 0.15;
    this.voiceLevel = levels.voice ?? 1;

    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);

    this.bedGain = this.ctx.createGain();
    this.bedGain.gain.value = 0; // faded up when the bed starts
    this.bedGain.connect(this.master);

    this.voiceGain = this.ctx.createGain();
    this.voiceGain.gain.value = this.voiceLevel;
    this.voiceGain.connect(this.master);

    this.stingerGain = this.ctx.createGain();
    this.stingerGain.gain.value = levels.stinger ?? 0.55;
    this.stingerGain.connect(this.master);
  }

  get state(): AudioContextState {
    return this.ctx.state;
  }

  /** Browsers suspend the context when a tab is backgrounded. */
  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  // ── ambience ───────────────────────────────────────────────────────────────

  async startBed(): Promise<void> {
    if (this.disposed || this.bedSource) return;

    const buffer =
      (STADIUM_BED_URL ? await fetchBuffer(this.ctx, STADIUM_BED_URL) : null) ??
      makeCrowdBuffer(this.ctx);
    if (this.disposed) return;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    // Stay inside the crossfaded region so the seam is never heard.
    src.loopStart = 0;
    src.loopEnd = Math.max(0.5, buffer.duration - BED_CROSSFADE);

    // Band-limit to the range a distant crowd actually occupies: no sub rumble,
    // no hiss. Only applied to the synthesised bed — real audio is left alone.
    let node: AudioNode = src;
    if (!STADIUM_BED_URL) {
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 140;
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1400;
      lp.Q.value = 0.5;
      src.connect(hp);
      hp.connect(lp);
      node = lp;
    }
    node.connect(this.bedGain);
    src.start();
    this.bedSource = src;

    const now = this.ctx.currentTime;
    this.bedGain.gain.cancelScheduledValues(now);
    this.bedGain.gain.setValueAtTime(0, now);
    this.bedGain.gain.linearRampToValueAtTime(this.bedLevel, now + 1.4);
  }

  setBedLevel(level: number): void {
    this.bedLevel = Math.max(0, Math.min(1, level));
    const now = this.ctx.currentTime;
    this.bedGain.gain.cancelScheduledValues(now);
    this.bedGain.gain.setTargetAtTime(this.bedLevel, now, 0.08);
  }

  getBedLevel(): number {
    return this.bedLevel;
  }

  /**
   * The crowd reacting — a hard swell on the bed that decays back to the mixer
   * setting.
   *
   * Distinct from the stinger, and the two are complementary rather than
   * redundant. A stinger is a produced broadcast cue that DUCKS everything under
   * a horn; this is the stadium itself getting louder because a goal just went
   * in, and it lands after the horn as the roar that does not stop dead. Without
   * it the ambience is the same at 0-0 as it is ten seconds after a winner,
   * which is the tell that the bed is a loop rather than a crowd.
   *
   * Scheduled entirely on the audio clock in absolute time, so it can be queued
   * to begin exactly where a duck restores rather than fighting it: two ramps
   * racing on one AudioParam is how you get a bed that never comes back up.
   *
   * @param startTime absolute ctx time to begin at; defaults to now.
   * @param from      level to start the rise from; defaults to the current bed.
   */
  swellBed(startTime?: number, from?: number): void {
    if (this.disposed) return;
    const t0 = startTime ?? this.ctx.currentTime;
    const g = this.bedGain.gain;

    // Never exceed 1.0 — and stay proportional to the listener's mixer setting,
    // so someone who turned the crowd down does not get it shouted back at them.
    const peak = Math.min(1, this.bedLevel * SWELL_PEAK_MULT);

    g.cancelScheduledValues(t0);
    g.setValueAtTime(from ?? this.bedLevel, t0);
    g.linearRampToValueAtTime(peak, t0 + SWELL_RISE_S);
    g.setValueAtTime(peak, t0 + SWELL_RISE_S + SWELL_HOLD_S);
    // Linear, not exponential: a crowd settles gradually rather than falling off
    // a cliff, and exponentialRamp cannot target a level of 0 anyway.
    g.linearRampToValueAtTime(this.bedLevel, t0 + SWELL_RISE_S + SWELL_HOLD_S + SWELL_DECAY_S);
  }

  // ── commentary ─────────────────────────────────────────────────────────────

  /**
   * Fetch a line's audio and play it to completion.
   * Resolves true when it finished, false if it could not be played — the caller
   * moves on either way, because the bed is still running and the show does not
   * stop for one bad line.
   */
  async playLine(url: string, signal?: AbortSignal): Promise<boolean> {
    if (this.disposed) return false;
    let buffer: AudioBuffer;
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) return false;
      buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      return false;
    }
    if (this.disposed || signal?.aborted) return false;

    await this.resume();
    return new Promise<boolean>((resolve) => {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.voiceGain);
      this.voiceSource = src;
      const done = () => {
        if (this.voiceSource === src) this.voiceSource = null;
        resolve(true);
      };
      src.onended = done;
      const onAbort = () => {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      src.start();
    });
  }

  /**
   * Hold for `ms` with only the bed audible — the natural pause between
   * conversation bursts. Resolves early if the show is stopped, so pressing stop
   * during a pause is instant rather than waiting out the silence.
   */
  silence(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.disposed) return resolve();
      const t = setTimeout(resolve, ms);
      this.pending.add(() => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  stopLine(): void {
    if (!this.voiceSource) return;
    try {
      this.voiceSource.stop();
    } catch {
      /* already stopped */
    }
    this.voiceSource = null;
  }

  /** Prefetch a line's bytes so the next speaker starts the instant this one
   *  ends. The CDN/browser cache makes the later real fetch free. */
  static prefetch(url: string): void {
    fetch(url).catch(() => {
      /* best-effort warm-up */
    });
  }

  // ── stingers ───────────────────────────────────────────────────────────────

  /**
   * Fire a stinger and duck everything under it. Returns when the stinger's
   * audible length is over; the duck lifts on its own schedule.
   */
  async playStinger(kind: StingerKind): Promise<void> {
    if (this.disposed) return;
    await this.resume();

    const custom = STINGER_URL ? await fetchBuffer(this.ctx, STINGER_URL) : null;
    const length = custom?.duration ?? (kind === "RED_CARD" ? 1.4 : 2.0);

    const restoresAt = this.duck(length);

    // A goal is the crowd's moment, not just the booth's: as the horn's duck
    // lifts, hand straight over to the swell so the roar carries on instead of
    // snapping back to idle murmur. Queued at the duck's own restore time so the
    // two never schedule competing ramps on the same AudioParam.
    //
    // Red cards are excluded for the same reason they get no horn: a sending-off
    // is not a celebration.
    if (kind !== "RED_CARD") {
      this.swellBed(restoresAt, this.bedLevel * 0.3);
    }

    if (custom) {
      const src = this.ctx.createBufferSource();
      src.buffer = custom;
      src.connect(this.stingerGain);
      src.start();
    } else {
      this.synthStinger(kind);
    }
    await new Promise<void>((r) => setTimeout(r, length * 1000));
  }

  /** Duck the bed and the commentary under a stinger, then restore.
   *  Returns the absolute ctx time the duck lifts, so a caller can queue what
   *  happens next against the same clock instead of guessing. */
  private duck(seconds: number): number {
    const now = this.ctx.currentTime;
    const back = now + seconds;

    this.bedGain.gain.cancelScheduledValues(now);
    this.bedGain.gain.setValueAtTime(this.bedGain.gain.value, now);
    this.bedGain.gain.linearRampToValueAtTime(this.bedLevel * 0.3, now + 0.12);
    this.bedGain.gain.setValueAtTime(this.bedLevel * 0.3, back);
    this.bedGain.gain.linearRampToValueAtTime(this.bedLevel, back + 0.6);

    this.voiceGain.gain.cancelScheduledValues(now);
    this.voiceGain.gain.setValueAtTime(this.voiceGain.gain.value, now);
    this.voiceGain.gain.linearRampToValueAtTime(this.voiceLevel * 0.25, now + 0.12);
    this.voiceGain.gain.setValueAtTime(this.voiceLevel * 0.25, back);
    this.voiceGain.gain.linearRampToValueAtTime(this.voiceLevel, back + 0.5);
    return back;
  }

  /** A crowd roar (swept noise) under a two-note horn. Red cards get the roar
   *  without the horn — a sending-off is not a celebration. */
  private synthStinger(kind: StingerKind): void {
    const t0 = this.ctx.currentTime;
    const length = kind === "RED_CARD" ? 1.4 : 2.0;

    // Roar: short noise burst through a bandpass that sweeps up then decays.
    const rate = this.ctx.sampleRate;
    const noise = this.ctx.createBuffer(1, Math.floor(length * rate), rate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(320, t0);
    bp.frequency.exponentialRampToValueAtTime(1500, t0 + 0.5);
    bp.frequency.exponentialRampToValueAtTime(600, t0 + length);

    const roar = this.ctx.createGain();
    roar.gain.setValueAtTime(0.0001, t0);
    roar.gain.exponentialRampToValueAtTime(0.9, t0 + 0.18);
    roar.gain.exponentialRampToValueAtTime(0.0001, t0 + length);

    src.connect(bp);
    bp.connect(roar);
    roar.connect(this.stingerGain);
    src.start(t0);
    src.stop(t0 + length);

    if (kind === "RED_CARD") return;

    // Horn: root + fifth, square-ish, short and bright.
    const root = kind === "LEAD_CHANGE" ? 392 : 330; // G4 / E4
    for (const [mult, level] of [[1, 0.22], [1.5, 0.16]] as const) {
      const osc = this.ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = root * mult;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(level, t0 + 0.06);
      g.gain.setValueAtTime(level, t0 + 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
      osc.connect(g);
      g.connect(this.stingerGain);
      osc.start(t0);
      osc.stop(t0 + 1.2);
    }
  }

  // ── teardown ───────────────────────────────────────────────────────────────

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const cancel of this.pending) cancel();
    this.pending.clear();
    this.stopLine();
    if (this.bedSource) {
      try {
        this.bedSource.stop();
      } catch {
        /* already stopped */
      }
      this.bedSource = null;
    }
    this.ctx.close().catch(() => {
      /* context already closing */
    });
  }
}
