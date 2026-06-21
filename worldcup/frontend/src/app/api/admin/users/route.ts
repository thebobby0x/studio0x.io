import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId, role } = await req.json() as { userId: string; role: string };
  const allowed = ["SUPER_ADMIN", "ADMIN", "WHITE_LABEL", "USER"];
  if (!allowed.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role: role as "SUPER_ADMIN" | "ADMIN" | "WHITE_LABEL" | "USER" },
  });

  return NextResponse.json({ ok: true });
}
