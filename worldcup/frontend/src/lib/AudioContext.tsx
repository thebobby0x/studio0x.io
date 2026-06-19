"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export interface Track {
  id: string;
  title: string;
  audioUrl: string;
  durationSecs: number;
  teamName: string;
  teamCode: string;
  flagEmoji: string;
}

export type LoopMode = "none" | "all" | "one";

interface AudioContextType {
  current: Track | null;
  isPlaying: boolean;
  progress: number;      // 0–1
  currentTime: number;
  duration: number;
  playlist: Track[];
  currentIndex: number;
  volume: number;        // 0–1
  isMuted: boolean;
  loopMode: LoopMode;
  isShuffling: boolean;
  play: (track: Track, playlist?: Track[], index?: number) => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  seekTo: (pct: number) => void;   // takes 0–1
  next: () => void;
  prev: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  cycleLoop: () => void;
  toggleShuffle: () => void;
}

const noop = () => {};

const defaultCtx: AudioContextType = {
  current: null,
  isPlaying: false,
  progress: 0,
  currentTime: 0,
  duration: 0,
  playlist: [],
  currentIndex: -1,
  volume: 1,
  isMuted: false,
  loopMode: "none",
  isShuffling: false,
  play: noop,
  pause: noop,
  resume: noop,
  togglePlay: noop,
  seekTo: noop,
  next: noop,
  prev: noop,
  setVolume: noop,
  toggleMute: noop,
  cycleLoop: noop,
  toggleShuffle: noop,
};

const AudioCtx = createContext<AudioContextType>(defaultCtx);

export function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [current, setCurrent] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [volume, setVolumeState] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [loopMode, setLoopMode] = useState<LoopMode>("none");
  const [isShuffling, setIsShuffling] = useState(false);

  // Stable refs for values needed inside event handlers
  const playlistRef = useRef<Track[]>([]);
  const currentIndexRef = useRef(-1);
  const loopModeRef = useRef<LoopMode>("none");
  const isShufflingRef = useRef(false);

  // ── Listen tracking (fire-and-forget) ──────────────────────────────────────
  const playSessionStartRef = useRef<number | null>(null);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playSessionFiredRef = useRef(false);
  const currentTrackRef = useRef<Track | null>(null);
  currentTrackRef.current = current;

  const fireListenPost = useCallback((streamId: string, seconds: number) => {
    if (seconds < 1) return;
    fetch(`/api/audio/${streamId}/listen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seconds: Math.round(seconds) }),
    }).catch(() => {});
  }, []);

  // Internal: play a track at a given index of the active playlist
  const playInternal = useCallback((track: Track, pl: Track[], idx: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    setPlaylist(pl);
    playlistRef.current = pl;
    setCurrentIndex(idx);
    currentIndexRef.current = idx;
    setCurrent(track);

    audio.src = track.audioUrl;
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, []);

  // Resolve the next track honoring shuffle / loop
  const resolveNext = useCallback((): { track: Track; idx: number } | null => {
    const pl = playlistRef.current;
    const idx = currentIndexRef.current;
    if (pl.length === 0) return null;

    if (isShufflingRef.current && pl.length > 1) {
      let r = idx;
      while (r === idx) r = Math.floor(Math.random() * pl.length);
      return { track: pl[r], idx: r };
    }
    if (idx < pl.length - 1) return { track: pl[idx + 1], idx: idx + 1 };
    // At end of list — wrap around only when "loop all" is enabled
    if (loopModeRef.current === "all") return { track: pl[0], idx: 0 };
    return null;
  }, []);

  // Create the audio element only on the client
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;

    const onTimeUpdate = () => {
      const dur = audio.duration || 0;
      setCurrentTime(audio.currentTime);
      setDuration(dur);
      setProgress(dur > 0 ? audio.currentTime / dur : 0);
    };

    const onEnded = () => {
      // Loop one — replay current
      if (loopModeRef.current === "one") {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }
      const nextUp = resolveNext();
      if (nextUp) {
        playInternal(nextUp.track, playlistRef.current, nextUp.idx);
      } else {
        setIsPlaying(false);
      }
    };

    const onLoadedMetadata = () => setDuration(audio.duration || 0);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.pause();
      audioRef.current = null;
    };
  }, [playInternal, resolveNext]);

  // Keep audio element volume/mute synced
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Listen-tracking session — start/flush on play/pause + track change
  useEffect(() => {
    const stream = currentTrackRef.current;
    if (isPlaying && stream) {
      playSessionStartRef.current = Date.now();
      playSessionFiredRef.current = false;
      playTimerRef.current = setTimeout(() => {
        const s = currentTrackRef.current;
        if (s) {
          fireListenPost(s.id, 10);
          playSessionFiredRef.current = true;
        }
      }, 10_000);
    } else {
      if (playTimerRef.current) {
        clearTimeout(playTimerRef.current);
        playTimerRef.current = null;
      }
      if (playSessionStartRef.current !== null && stream) {
        const sessionElapsed = (Date.now() - playSessionStartRef.current) / 1000;
        if (sessionElapsed >= 10) {
          const toSend = playSessionFiredRef.current ? sessionElapsed - 10 : sessionElapsed;
          if (toSend >= 1) fireListenPost(stream.id, toSend);
        }
        playSessionStartRef.current = null;
      }
    }
    return () => {
      if (playTimerRef.current) {
        clearTimeout(playTimerRef.current);
        playTimerRef.current = null;
      }
    };
  }, [isPlaying, current, fireListenPost]);

  const play = useCallback((track: Track, newPlaylist?: Track[], index?: number) => {
    const resolvedPlaylist = newPlaylist ?? [track];
    const resolvedIndex = index ?? 0;
    playInternal(track, resolvedPlaylist, resolvedIndex);
  }, [playInternal]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => {});
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [isPlaying]);

  const seekTo = useCallback((pct: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    audio.currentTime = Math.max(0, Math.min(1, pct)) * audio.duration;
  }, []);

  const next = useCallback(() => {
    const nextUp = resolveNext();
    if (nextUp) playInternal(nextUp.track, playlistRef.current, nextUp.idx);
  }, [resolveNext, playInternal]);

  const prev = useCallback(() => {
    const audio = audioRef.current;
    const pl = playlistRef.current;
    const idx = currentIndexRef.current;
    // If more than 3s into track, restart; otherwise go to previous
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
    } else if (pl.length > 0) {
      const prevIdx = (idx - 1 + pl.length) % pl.length;
      playInternal(pl[prevIdx], pl, prevIdx);
    }
  }, [playInternal]);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (v > 0) setIsMuted(false);
  }, []);

  const toggleMute = useCallback(() => setIsMuted((m) => !m), []);

  const cycleLoop = useCallback(() => {
    setLoopMode((m) => {
      const nextMode = m === "none" ? "all" : m === "all" ? "one" : "none";
      loopModeRef.current = nextMode;
      return nextMode;
    });
  }, []);

  const toggleShuffle = useCallback(() => {
    setIsShuffling((s) => {
      isShufflingRef.current = !s;
      return !s;
    });
  }, []);

  return (
    <AudioCtx.Provider
      value={{
        current,
        isPlaying,
        progress,
        currentTime,
        duration,
        playlist,
        currentIndex,
        volume,
        isMuted,
        loopMode,
        isShuffling,
        play,
        pause,
        resume,
        togglePlay,
        seekTo,
        next,
        prev,
        setVolume,
        toggleMute,
        cycleLoop,
        toggleShuffle,
      }}
    >
      {children}
    </AudioCtx.Provider>
  );
}

export function useAudio(): AudioContextType {
  return useContext(AudioCtx);
}
