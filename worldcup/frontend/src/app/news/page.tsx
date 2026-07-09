import { prisma } from "@/lib/prisma";
import StoryCard, { type StoryCardData } from "@/components/news/StoryCard";
import AppNav from "@/components/ui/AppNav";
import { Newspaper } from "lucide-react";
import { maybeScheduleRefresh } from "@/lib/storyRefresh";

export const dynamic = "force-dynamic";

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function prettyDay(key: string): string {
  return new Date(`${key}T12:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  });
}

export default async function NewsPage() {
  // Viewing the news page opportunistically refreshes stories (post-response,
  // throttled) so freshness isn't solely dependent on dashboard traffic.
  maybeScheduleRefresh();

  let stories: Awaited<ReturnType<typeof prisma.newsStory.findMany>> = [];
  try {
    stories = await prisma.newsStory.findMany({
      orderBy: [{ date: "desc" }, { generatedAt: "desc" }],
      take: 400,
    });
  } catch {
    // Table may not exist yet on first deploy — render empty state gracefully
  }

  // Group by day, daily recap first within each day
  const groups = new Map<string, StoryCardData[]>();
  for (const s of stories) {
    const k = dayKey(s.date);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push({
      id: s.id,
      category: s.category,
      headline: s.headline,
      body: s.body,
      teamsInvolved: s.teamsInvolved,
      generatedAt: s.generatedAt.toISOString(),
      audioUrl: s.audioUrl,
    });
  }
  for (const list of groups.values()) {
    list.sort((a, b) => (a.category === "DAILY RECAP" ? -1 : 0) - (b.category === "DAILY RECAP" ? -1 : 0));
  }
  const days = [...groups.keys()].sort().reverse();

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      <AppNav />
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-black text-white">
          cup26 <span className="text-brand-gold">News</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          AI match recaps & daily round-ups · every result, archived · <span className="font-mono text-slate-700">studio0x</span>
        </p>
      </div>

      {days.length === 0 ? (
        <div className="rounded-xl bg-brand-card border border-brand-border p-8 text-center">
          <Newspaper size={28} className="text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-semibold">No recaps yet</p>
          <p className="text-slate-600 text-sm mt-1">
            An admin can generate them from <span className="text-brand-gold">/admin</span> → Generate News Recaps.
          </p>
        </div>
      ) : (
        days.map((k) => (
          <section key={k} className="space-y-3">
            <div className="flex items-center gap-2 sticky top-14 bg-brand-dark/80 backdrop-blur py-1 z-10">
              <h2 className="text-xs font-black uppercase tracking-widest text-brand-gold">{prettyDay(k)}</h2>
              <span className="text-[10px] text-slate-600">{groups.get(k)!.length} stor{groups.get(k)!.length === 1 ? "y" : "ies"}</span>
            </div>
            <div className="space-y-3">
              {groups.get(k)!.map((s) => <StoryCard key={s.id} story={s} showAge={false} />)}
            </div>
          </section>
        ))
      )}
    </div>
    </div>
  );
}
