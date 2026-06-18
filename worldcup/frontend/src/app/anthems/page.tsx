export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import AnthemHub from "@/components/anthem/AnthemHub";
import type { AudioStream } from "@/lib/types";

export default async function AnthemsPage() {
  const streams = await prisma.audioStream.findMany({
    include: { team: true },
    orderBy: { title: "asc" },
  });
  return <AnthemHub streams={streams as unknown as (AudioStream & { team: { code: string; name: string; flagEmoji: string } | null })[]} />;
}
