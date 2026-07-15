export const dynamic = "force-dynamic";

import Link from "next/link";
import { CalendarDays, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";

const SPORT_LABELS: Record<string, string> = { soccer: "Soccer", f1: "Formula 1" };

async function getUpcoming(sport?: string) {
  try {
    return await prisma.event.findMany({
      where: {
        date: { gte: new Date(Date.now() - 6 * 3600_000) },
        ...(sport ? { competition: { sport } } : {}),
      },
      include: {
        competition: { select: { name: true, sport: true, slug: true } },
        venue: { select: { name: true, city: true, country: true } },
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
      orderBy: { date: "asc" },
      take: 60,
    });
  } catch {
    return [];
  }
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ sport?: string }> }) {
  const { sport } = await searchParams;
  const events = await getUpcoming(sport);
  const sports = ["soccer", "f1"];

  // Group by calendar day
  const byDay = new Map<string, typeof events>();
  for (const e of events) {
    const day = e.date.toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(e);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <header className="mb-10">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-brand-gold" />
          <h1 className="text-2xl font-black text-white tracking-tight">
            podium<span className="text-brand-gold">Schedule</span>
          </h1>
        </div>
        <p className="text-slate-500 text-sm mt-1">
          The global sport calendar · one depot for tournaments, fixtures and race weekends
        </p>
      </header>

      <div className="flex items-center gap-2 mb-8">
        <Link
          href="/"
          className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${!sport ? "bg-brand-gold/15 border-brand-gold/40 text-brand-gold" : "border-brand-border text-slate-400 hover:text-white"}`}
        >
          All sports
        </Link>
        {sports.map((s) => (
          <Link
            key={s}
            href={`/?sport=${s}`}
            className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${sport === s ? "bg-brand-gold/15 border-brand-gold/40 text-brand-gold" : "border-brand-border text-slate-400 hover:text-white"}`}
          >
            {SPORT_LABELS[s] ?? s}
          </Link>
        ))}
      </div>

      {events.length === 0 ? (
        <div className="rounded-2xl bg-brand-card border border-brand-border p-12 text-center">
          <CalendarDays size={48} className="mx-auto mb-4 text-slate-600" />
          <p className="text-slate-400 font-semibold">No upcoming events synced yet.</p>
          <p className="text-slate-600 text-sm mt-1">Run a sync from the admin sync center.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {[...byDay.entries()].map(([day, dayEvents]) => (
            <section key={day}>
              <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3" suppressHydrationWarning>
                {new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </h2>
              <div className="space-y-2">
                {dayEvents.map((e) => (
                  <div key={e.id} className="rounded-2xl bg-brand-card border border-brand-border px-4 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-bold text-white text-sm truncate">{e.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {e.competition.name}
                        {e.venue ? ` · ${e.venue.name}${e.venue.city ? `, ${e.venue.city}` : ""}` : ""}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {e.status === "live" ? (
                        <span className="flex items-center gap-1.5 text-xs font-bold text-red-400"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />LIVE</span>
                      ) : e.homeScore !== null && e.awayScore !== null ? (
                        <span className="text-sm font-black text-white">{e.homeScore}–{e.awayScore}</span>
                      ) : (
                        <span className="text-xs text-slate-400" suppressHydrationWarning>
                          {e.date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
