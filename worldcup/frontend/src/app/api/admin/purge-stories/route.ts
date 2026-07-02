import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed as authed } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";


export async function POST(req: Request) {
  if (!(await authed(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { count } = await prisma.newsStory.deleteMany({});
  return NextResponse.json({ ok: true, deleted: count });
}
