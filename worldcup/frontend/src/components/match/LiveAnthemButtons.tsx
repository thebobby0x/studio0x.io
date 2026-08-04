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
      <span className="s0x-mono text-[10px] font-semibold text-s0x-muted flex items-center gap-1.5">
        <Music2 size={9} />
        Anthems
      </span>
      {[{ anthem: homeAnthem, teamName: homeTeamName }, { anthem: awayAnthem, teamName: awayTeamName }].map(
        ({ anthem, teamName }) =>
          anthem ? (
            // Riptide is the audio/anthem accent — teal fill + glow while playing.
            <button
              key={anthem.id}
              onClick={() => handlePlay(anthem)}
              data-active={isActiveAnthem(anthem) ? "true" : "false"}
              className="s0x-btn s0x-btn-teal !px-3 !py-1.5"
            >
              <span className="text-sm not-italic tracking-normal">{anthem.flagEmoji}</span>
              <Volume2 size={10} className={isActiveAnthem(anthem) ? "animate-pulse" : ""} />
              <span>{teamName}</span>
            </button>
          ) : null
      )}
    </div>
  );
}
