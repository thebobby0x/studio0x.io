import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AdminDashboard from "@/components/admin/AdminDashboard";
import AppNav from "@/components/ui/AppNav";
import { AF_LEAGUE, AF_SEASON, SPORT } from "@/lib/sportConfig";

export default async function AdminPage() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") redirect("/");

  const [users, matchCount, foreignMatchCount, teamCount, newsCount, foreignNewsCount] = await Promise.all([
    prisma.user.findMany({
      orderBy: { email: "asc" },
      select: { id: true, email: true, name: true, image: true, role: true },
    }),
    prisma.match.count({ where: { leagueId: AF_LEAGUE } }),
    // leagueId 0 = seeded before the column existed; counted as not-yet-verified
    // rather than as ours, so the panel never claims data it hasn't confirmed.
    prisma.match.count({ where: { NOT: { leagueId: AF_LEAGUE } } }),
    prisma.team.count(),
    prisma.newsStory.count({ where: { tournamentId: SPORT.id } }),
    prisma.newsStory.count({ where: { NOT: { tournamentId: SPORT.id } } }),
  ]);

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      <AppNav />
      <AdminDashboard
        users={users}
        tournament={{
          id: SPORT.id,
          eventName: SPORT.eventName,
          brandName: SPORT.brandName,
          leagueId: AF_LEAGUE,
          season: AF_SEASON,
          expectedEvents: SPORT.calendar.totalEvents,
          matchCount,
          foreignMatchCount,
          teamCount,
          newsCount,
          foreignNewsCount,
        }}
      />
    </div>
  );
}
