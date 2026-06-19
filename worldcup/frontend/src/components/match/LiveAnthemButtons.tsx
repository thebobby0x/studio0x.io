"use client";

import { useAudio, type Track } from "@/lib/AudioContext";
import { Music2, Volume2 } from "lucide-react";

interface AnthemTrack {
  id: string;
  title: string;
  audioUrl: string;
  durationSecs: number;
  teamName: string;
  teamCode: string;
  flagEmoji: string;
}

interface Props {
  homeAnthem: AnthemTrack | null;
  awayAnthem: AnthemTrack | null;
  homeTeamName: string;
  awayTeamName: string;
}

export default function LiveAnthemButtons({ homeAnthem, awayAnthem, homeTeamName, awayTeamName }: Props) {
  const { play, pause, current, isPlaying } = useAudio();

  if (!homeAnthem && !awayAnthem) return null;

  const handlePlay = (anthem: AnthemTrack) => {
    const track: Track = {
      id: anthem.id,
      title: anthem.title,
      audioUrl: anthem.audioUrl,
      durationSecs: anthem.durationSecs,
      teamName: anthem.teamName,
      teamCode: anthem.teamCode,
      flagEmoji: anthem.flagEmoji,
    };
    if (current?.id === anthem.id && isPlaying) {
      pause();
    } else {
      play(track, [track], 0);
    }
  };

  const isActiveAnthem = (anthem: AnthemTrack | null) =>
    anthem && current?.id === anthem.id && isPlaying;

  return (
    <div className="flex items-center justify-center gap-3 pt-2 pb-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 flex items-center gap-1">
        <Music2 size={9} />
        Anthems
      </span>
      {[{ anthem: homeAnthem, teamName: homeTeamName }, { anthem: awayAnthem, teamName: awayTeamName }].map(
        ({ anthem, teamName }) =>
          anthem ? (
            <button
              key={anthem.id}
              onClick={() => handlePlay(anthem)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                isActiveAnthem(anthem)
                  ? "bg-brand-green text-brand-dark shadow-lg shadow-brand-green/30"
                  : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-brand-border/50"
              }`}
            >
              <span className="text-sm">{anthem.flagEmoji}</span>
              <Volume2 size={10} className={isActiveAnthem(anthem) ? "animate-pulse" : ""} />
              <span>{teamName}</span>
            </button>
          ) : null
      )}
    </div>
  );
}
