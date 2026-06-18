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

interface AudioContextType {
  current: Track | null;
  isPlaying: boolean;
  progress: number;      // 0–1
  currentTime: number;
  duration: number;
  playlist: Track[];
  currentIndex: number;
  play: (track: Track, playlist?: Track[], index?: number) => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  seekTo: (pct: number) => void;   // takes 0–1
  next: () => void;
  prev: () => void;
}

const defaultCtx: AudioContextType = {
  current: null,
  isPlaying: false,
  progress: 0,
  currentTime: 0,
  duration: 0,
  playlist: [],
  currentIndex: -1,
  play: () => {},
  pause: () => {},
  resume: () => {},
  togglePlay: () => {},
  seekTo: () => {},
  next: () => {},
  prev: () => {},
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

  // Stable refs for values needed inside event handlers
  const playlistRef = useRef<Track[]>([]);
  const currentIndexRef = useRef(-1);

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
      setIsPlaying(false);
      const pl = playlistRef.current;
      const idx = currentIndexRef.current;
      if (idx >= 0 && idx < pl.length - 1) {
        const nextIdx = idx + 1;
        const nextTrack = pl[nextIdx];
        if (audioRef.current) {
          audioRef.current.src = nextTrack.audioUrl;
          audioRef.current.play().then(() => {
            setCurrent(nextTrack);
            setCurrentIndex(nextIdx);
            currentIndexRef.current = nextIdx;
            setIsPlaying(true);
          }).catch(() => {});
        }
      }
    };

    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

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
  }, []);

  const play = useCallback((track: Track, newPlaylist?: Track[], index?: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const resolvedPlaylist = newPlaylist ?? [track];
    const resolvedIndex = index ?? 0;

    setPlaylist(resolvedPlaylist);
    playlistRef.current = resolvedPlaylist;
    setCurrentIndex(resolvedIndex);
    currentIndexRef.current = resolvedIndex;
    setCurrent(track);

    audio.src = track.audioUrl;
    audio.play().then(() => {
      setIsPlaying(true);
    }).catch(() => {
      setIsPlaying(false);
    });
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play().then(() => {
      setIsPlaying(true);
    }).catch(() => {});
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      audioRef.current?.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {});
    }
  }, [isPlaying]);

  const seekTo = useCallback((pct: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const clamped = Math.max(0, Math.min(1, pct));
    audio.currentTime = clamped * audio.duration;
  }, []);

  const next = useCallback(() => {
    const pl = playlistRef.current;
    const idx = currentIndexRef.current;
    if (idx < pl.length - 1) {
      const nextIdx = idx + 1;
      play(pl[nextIdx], pl, nextIdx);
    }
  }, [play]);

  const prev = useCallback(() => {
    const audio = audioRef.current;
    const pl = playlistRef.current;
    const idx = currentIndexRef.current;
    // If more than 3s into track, restart; otherwise go to previous
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
    } else if (idx > 0) {
      const prevIdx = idx - 1;
      play(pl[prevIdx], pl, prevIdx);
    }
  }, [play]);

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
        play,
        pause,
        resume,
        togglePlay,
        seekTo,
        next,
        prev,
      }}
    >
      {children}
    </AudioCtx.Provider>
  );
}

export function useAudio(): AudioContextType {
  return useContext(AudioCtx);
}
