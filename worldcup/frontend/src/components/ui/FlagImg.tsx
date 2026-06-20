"use client";

import Image from "next/image";
import { getFlagUrl } from "@/lib/teamMeta";
import { getFlag } from "@/lib/flags";

interface FlagImgProps {
  tla: string | undefined | null;
  size?: number;   // rendered width in px
  className?: string;
}

export default function FlagImg({ tla, size = 40, className = "" }: FlagImgProps) {
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
