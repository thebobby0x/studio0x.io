// Coordination module for story audio playback.
// Ensures only one story (including deep dive) plays at a time across all StoryCard instances.

type StopFn = () => void;
const _registry = new Set<StopFn>();

/** Register a stop callback. Returns an unregister function. */
export function registerStoryStop(fn: StopFn): StopFn {
  _registry.add(fn);
  return () => { _registry.delete(fn); };
}

/** Stop every registered story audio player. */
export function stopAllStories(): void {
  _registry.forEach(fn => fn());
}

// ── Optional ambient audio ────────────────────────────────────────────────────
// Set NEXT_PUBLIC_AMBIENT_AUDIO_URL to a publicly-hosted crowd noise / stadium
// ambient MP3. If unset the feature is silently disabled.
// Recommended: upload a looping crowd-noise file to Vercel Blob and paste the URL.

let _ambientEl: HTMLAudioElement | null = null;

function getAmbient(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  const url = process.env.NEXT_PUBLIC_AMBIENT_AUDIO_URL;
  if (!url) return null;
  if (!_ambientEl) {
    _ambientEl = new Audio(url);
    _ambientEl.loop = true;
    _ambientEl.volume = 0.12;
    _ambientEl.preload = "auto";
  }
  return _ambientEl;
}

export function startAmbient(): void {
  const a = getAmbient();
  if (!a) return;
  a.play().catch(() => { /* browser may block autoplay — TTS still plays */ });
}

export function stopAmbient(): void {
  const a = getAmbient();
  if (!a) return;
  a.pause();
}
