export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCompetition } from "@/lib/sync";
import { isAuthorized } from "@/lib/adminAuth";

// POST /api/sync?slug=<competition>       — sync one
// POST /api/sync?all=true                 — sync every mapped competition
// (GET allowed for the Vercel cron, same auth.)
async function run(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const slug = q.get("slug");
  const all = q.get("all") === "true";

  if (!slug && !all) return NextResponse.json({ error: "pass ?slug= or ?all=true" }, { status: 400 });

  const competitions = slug
    ? await prisma.competition.findMany({ where: { slug } })
    : await prisma.competition.findMany({ where: { NOT: { sourceId: "" } } });

  if (competitions.length === 0) return NextResponse.json({ error: "no matching competitions" }, { status: 404 });

  const results: Record<string, unknown> = {};
  for (const c of competitions) {
    results[c.slug] = await syncCompetition(c);
  }
  return NextResponse.json({ ok: true, results });
}

export async function POST(req: Request) { return run(req); }
export async function GET(req: Request) { return run(req); }
