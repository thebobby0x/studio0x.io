export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import AnthemHub from "@/components/anthem/AnthemHub";
import type { AudioStream } from "@/lib/types";

export default async function AnthemsPage() {
  const [streams, allTeams] = await Promise.all([
    prisma.audioStream.findMany({
      include: { team: true },
      orderBy: { team: { name: "asc" } },
    }),
    prisma.team.findMany({
      select: { id: true, code: true, name: true, flagEmoji: true, groupStage: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <AnthemHub
      streams={streams as unknown as (AudioStream & { team: { code: string; name: string; flagEmoji: string } | null })[]}
      allTeams={allTeams}
    />
  );
}
