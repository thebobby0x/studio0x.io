import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AdminDashboard from "@/components/admin/AdminDashboard";
import AppNav from "@/components/ui/AppNav";

export default async function AdminPage() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") redirect("/");

  const users = await prisma.user.findMany({
    orderBy: { email: "asc" },
    select: { id: true, email: true, name: true, image: true, role: true },
  });

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      <AppNav />
      <AdminDashboard users={users} />
    </div>
  );
}
