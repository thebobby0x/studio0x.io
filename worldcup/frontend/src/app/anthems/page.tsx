export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import AnthemHub from "@/components/anthem/AnthemHub";
import AppNav from "@/components/ui/AppNav";
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
    <div className="min-h-screen bg-brand-dark text-slate-200">
      <AppNav />
      <AnthemHub
        streams={streams as unknown as (AudioStream & { team: { code: string; name: string; flagEmoji: string } | null })[]}
        allTeams={allTeams}
      />
    </div>
  );
}
