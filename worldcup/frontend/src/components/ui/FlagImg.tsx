"use client";

import Image from "next/image";
import { getFlagUrl } from "@/lib/teamMeta";
import { getFlag } from "@/lib/flags";
import { SPORT } from "@/lib/sportConfig";

interface FlagImgProps {
  tla: string | undefined | null;
  size?: number;   // rendered width in px
  className?: string;
  /** api-football team id. On club deployments this yields the club crest —
   *  the only correct badge for a club. */
  afId?: number | null;
  /** Crest URL straight from Team.logoUrl. Preferred over afId when present:
   *  it is the exact URL the feed gave us rather than a derived path. */
  logoUrl?: string | null;
}

// A 3-letter code identifies a NATION only on a nation deployment. On a club
// competition the same codes belong to clubs and collide with FIFA TLAs, so
// mapping code → country flag rendered Colombia's flag on Columbus Crew ("COL"),
// Portugal's on Portland Timbers ("POR") and Chile's on Chicago Fire ("CHI").
// Club deployments therefore never derive a flag from the code: they show the
// crest when we know the team id, and a neutral monogram when we don't.
const CODES_ARE_NATIONS = SPORT.feedCodesAreNationTlas;

/** api-football serves crests at a stable public path, already allow-listed in
 *  next.config.ts remotePatterns. */
function crestUrl(afId: number): string {
  return `https://media.api-sports.io/football/teams/${afId}.png`;
}

export default function FlagImg({ tla, size = 40, className = "", afId, logoUrl }: FlagImgProps) {
  if (!CODES_ARE_NATIONS) {
    const crest = logoUrl || (afId ? crestUrl(afId) : null);
    if (crest) {
      return (
        <Image
          src={crest}
          alt={tla ?? "crest"}
          width={size}
          height={size}
          className={`object-contain ${className}`}
          unoptimized
        />
      );
    }
    // No crest available — a neutral monogram, never a country's flag.
    return (
      <span
        className={`inline-flex items-center justify-center rounded-sm bg-slate-800 text-slate-300 font-black ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.38 }}
      >
        {(tla ?? "?").slice(0, 3)}
      </span>
    );
  }

  const url = getFlagUrl(tla, size <= 40 ? 40 : 80);

  if (!url) {
    return (
      <span className={className} style={{ fontSize: size * 0.7 }}>
        {getFlag(tla)}
      </span>
    );
  }

  return (
    <Image
      src={url}
      alt={tla ?? "flag"}
      width={size}
      height={Math.round(size * 0.67)}
      className={`rounded-sm object-cover ${className}`}
      unoptimized
    />
  );
}
