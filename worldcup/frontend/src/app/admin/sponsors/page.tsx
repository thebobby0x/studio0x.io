import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppNav from "@/components/ui/AppNav";
import { AdSlotPlacement, SponsorTier } from "@prisma/client";

export const dynamic = "force-dynamic";

const TIER_LABELS: Record<SponsorTier, string> = {
  TITLE: "Title",
  MATCH: "Match",
  GROUP: "Group",
  ANTHEM: "Anthem",
  BANNER: "Banner",
};

const TIER_COLORS: Record<SponsorTier, string> = {
  TITLE: "text-brand-gold border-brand-gold/40 bg-brand-gold/10",
  MATCH: "text-blue-300 border-blue-500/40 bg-blue-500/10",
  GROUP: "text-purple-300 border-purple-500/40 bg-purple-500/10",
  ANTHEM: "text-pink-300 border-pink-500/40 bg-pink-500/10",
  BANNER: "text-slate-300 border-slate-500/40 bg-slate-500/10",
};

const PLACEMENT_LABELS: Record<AdSlotPlacement, string> = {
  HOME_HERO: "Home Hero",
  SCHEDULE_TOP: "Schedule Top",
  MATCH_DETAIL: "Match Detail",
  STANDINGS: "Standings",
  ANTHEMS: "Anthems",
  SIDEBAR: "Sidebar",
};

export default async function SponsorsPage() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") redirect("/");

  const sponsors = await prisma.sponsor.findMany({
    include: {
      adSlots: {
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ active: "desc" }, { tier: "asc" }, { name: "asc" }],
  });

  const totalImpressions = sponsors
    .flatMap((s) => s.adSlots)
    .reduce((sum, slot) => sum + slot.impressions, 0);

  const totalClicks = sponsors
    .flatMap((s) => s.adSlots)
    .reduce((sum, slot) => sum + slot.clicks, 0);

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      <AppNav />
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-white">Sponsor Management</h1>
            <p className="text-xs text-slate-500 mt-0.5">studio0x · footy26</p>
          </div>
          <div className="flex gap-4 text-right">
            <div>
              <div className="text-lg font-black text-brand-gold">{totalImpressions.toLocaleString()}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">Impressions</div>
            </div>
            <div>
              <div className="text-lg font-black text-brand-green">{totalClicks.toLocaleString()}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">Clicks</div>
            </div>
          </div>
        </div>

        {/* DB notice */}
        <div className="rounded-xl border border-brand-border bg-brand-card p-4 text-sm text-slate-400">
          <span className="font-semibold text-slate-300">Managing sponsors:</span>{" "}
          Sponsors and ad slots are managed via the database. Use Prisma Studio (
          <code className="text-[11px] bg-slate-800 px-1 py-0.5 rounded">npx prisma studio</code>
          ) or direct DB access to add, edit, or deactivate sponsors and slots.
        </div>

        {/* Sponsors list */}
        {sponsors.length === 0 ? (
          <div className="rounded-2xl bg-brand-card border border-brand-border p-8 text-center text-slate-500 text-sm">
            No sponsors yet. Add one via Prisma Studio or direct DB access.
          </div>
        ) : (
          <div className="space-y-4">
            {sponsors.map((sponsor) => {
              const ctr =
                sponsor.adSlots.reduce((s, sl) => s + sl.impressions, 0) > 0
                  ? (
                      (sponsor.adSlots.reduce((s, sl) => s + sl.clicks, 0) /
                        sponsor.adSlots.reduce((s, sl) => s + sl.impressions, 0)) *
                      100
                    ).toFixed(2)
                  : "—";

              return (
                <div
                  key={sponsor.id}
                  className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden"
                >
                  {/* Sponsor header */}
                  <div className="flex items-center gap-4 px-5 py-4 border-b border-brand-border">
                    {sponsor.logoUrl && (
                      <img
                        src={sponsor.logoUrl}
                        alt={sponsor.name}
                        className="h-8 w-auto object-contain opacity-90"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white">{sponsor.name}</span>
                        <span
                          className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${TIER_COLORS[sponsor.tier]}`}
                        >
                          {TIER_LABELS[sponsor.tier]}
                        </span>
                        {!sponsor.active && (
                          <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full border text-red-400 border-red-500/40 bg-red-500/10">
                            Inactive
                          </span>
                        )}
                      </div>
                      {sponsor.websiteUrl && (
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">{sponsor.websiteUrl}</div>
                      )}
                    </div>
                    <div className="text-right shrink-0 space-y-0.5">
                      <div className="text-xs font-semibold text-slate-300">
                        {sponsor.adSlots.reduce((s, sl) => s + sl.impressions, 0).toLocaleString()} imp
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {sponsor.adSlots.reduce((s, sl) => s + sl.clicks, 0).toLocaleString()} clicks · {ctr}% CTR
                      </div>
                    </div>
                  </div>

                  {/* Ad slots */}
                  {sponsor.adSlots.length === 0 ? (
                    <div className="px-5 py-3 text-[11px] text-slate-600 italic">No ad slots configured.</div>
                  ) : (
                    <div className="divide-y divide-brand-border/50">
                      {sponsor.adSlots.map((slot) => (
                        <div key={slot.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border text-slate-300 border-brand-border bg-slate-800/40`}
                          >
                            {PLACEMENT_LABELS[slot.placement]}
                          </span>
                          {!slot.active && (
                            <span className="text-[10px] text-red-400 border border-red-500/30 rounded-full px-1.5 py-0.5">
                              Off
                            </span>
                          )}
                          {slot.imageUrl && (
                            <span className="text-[10px] text-slate-400">Image</span>
                          )}
                          {slot.ctaText && (
                            <span className="text-[10px] text-slate-400">&ldquo;{slot.ctaText}&rdquo;</span>
                          )}
                          {slot.linkUrl && (
                            <a
                              href={slot.linkUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-brand-blue hover:underline truncate max-w-[200px]"
                            >
                              {slot.linkUrl}
                            </a>
                          )}
                          <div className="ml-auto text-[11px] text-slate-500">
                            {slot.impressions.toLocaleString()} imp · {slot.clicks.toLocaleString()} clicks
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
