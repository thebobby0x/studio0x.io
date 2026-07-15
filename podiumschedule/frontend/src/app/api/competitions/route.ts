export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { COMPETITION_REGISTRY } from "@/lib/registry";
import { isAuthorized } from "@/lib/adminAuth";

// Idempotent registry seed: catalog entries exist as rows; DB keeps runtime
// state (sourceId edits, sync status). create-only — never clobbers edits.
async function ensureRegistry() {
  for (const r of COMPETITION_REGISTRY) {
    await prisma.competition.upsert({
      where: { slug: r.slug },
      create: { ...r },
      update: {}, // registry never overwrites DB state
    });
  }
}

export async function GET() {
  await ensureRegistry();
  const competitions = await prisma.competition.findMany({
    orderBy: [{ status: "desc" }, { name: "asc" }],
    include: { _count: { select: { events: true } } },
  });
  return NextResponse.json({
    competitions: competitions.map((c) => ({
      slug: c.slug,
      name: c.name,
      sport: c.sport,
      region: c.region,
      season: c.season,
      source: c.source,
      sourceId: c.sourceId,
      status: c.status,
      lastSyncAt: c.lastSyncAt,
      syncError: c.syncError,
      eventCount: c._count.events,
    })),
  });
}

// PATCH: edit a competition's vendor mapping (sourceId/season) from /admin.
export async function PATCH(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json()) as { slug?: string; sourceId?: string; season?: string };
  if (!body.slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
  const updated = await prisma.competition.update({
    where: { slug: body.slug },
    data: {
      ...(body.sourceId !== undefined ? { sourceId: body.sourceId.trim() } : {}),
      ...(body.season !== undefined ? { season: body.season.trim() } : {}),
    },
  }).catch(() => null);
  if (!updated) return NextResponse.json({ error: "unknown slug" }, { status: 404 });
  return NextResponse.json({ ok: true, slug: updated.slug, sourceId: updated.sourceId, season: updated.season });
}
