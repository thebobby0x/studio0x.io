import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function authed(req: Request): boolean {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") === "wc2026studio0x") return true;
  if (process.env.SEED_SECRET && searchParams.get("secret") === process.env.SEED_SECRET) return true;
  return false;
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { count } = await prisma.newsStory.deleteMany({});
  return NextResponse.json({ ok: true, deleted: count });
}
