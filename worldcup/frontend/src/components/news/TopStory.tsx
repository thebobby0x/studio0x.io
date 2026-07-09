"use client";

// The dashboard's lead headline — the freshest AI story, served as a single
// bold strip at the very top of the landing page (owner 7/9). Click to expand
// the full story inline (Listen / Go Deeper / Share via the standard card);
// collapse to get out of the way. Freshness comes free: previews generate
// ~1h before kickoff and recaps within minutes of full time, so this strip
// always leads with the moment.

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Sparkles } from "lucide-react";
import FlagImg from "@/components/ui/FlagImg";
import StoryCard, { type StoryCardData } from "@/components/news/StoryCard";

export default function TopStory({ story }: { story: StoryCardData }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl overflow-hidden border border-brand-gold/25 bg-gradient-to-r from-brand-gold/10 via-brand-card to-brand-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-5 py-4 flex items-center gap-4 group"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={11} className="text-brand-gold shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">
              Top Story
            </span>
            <span className="text-[9px] text-slate-600 uppercase tracking-wider hidden sm:inline">
              {story.category} · AI-generated
            </span>
          </div>
          <h2 className="text-base sm:text-xl font-black text-white leading-snug group-hover:text-brand-gold transition-colors">
            {story.headline}
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {story.teamsInvolved.slice(0, 2).map((tla) => (
            <FlagImg key={tla} tla={tla} size={22} />
          ))}
          <ChevronDown
            size={16}
            className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          <StoryCard story={story} showAge />
          <div className="text-right">
            <Link
              href="/news"
              className="text-[11px] font-semibold text-brand-gold hover:text-amber-300 transition-colors"
            >
              All stories →
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
