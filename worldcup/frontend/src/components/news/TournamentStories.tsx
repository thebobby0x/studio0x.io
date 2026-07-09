"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { RefreshCw, Newspaper } from "lucide-react";
import type { Story } from "@/app/api/ai/stories/route";
import StoryCard from "@/components/news/StoryCard";

export default function TournamentStories() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      if (force) setRegenerating(true);
      else setLoading(true);
      const res = await fetch("/api/ai/stories", { method: force ? "POST" : "GET" });
      const data = await res.json() as { stories: Story[]; error?: string };
      setStories(data.stories ?? []);
      if (data.error) setError(data.error);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl bg-brand-card border border-brand-border h-32 animate-pulse" />
        ))}
      </div>
    );
  }

  if (stories.length === 0) {
    return (
      <div className="rounded-xl bg-brand-card border border-brand-border p-6 text-center text-slate-500 text-sm">
        {error ? `Could not generate stories: ${error}` : "No completed matches yet — check back after the first games."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Newspaper size={15} className="text-brand-gold" />
          <span className="text-xs font-black uppercase tracking-widest text-slate-400">studio0x Analysis</span>
          <span className="text-[10px] text-slate-600">· AI + ElevenLabs voice</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => load(true)}
            disabled={regenerating}
            className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-brand-gold transition-colors disabled:opacity-40"
          >
            <RefreshCw size={11} className={regenerating ? "animate-spin" : ""} />
            Refresh
          </button>
          <Link
            href="/news"
            className="text-[11px] font-semibold text-brand-gold hover:text-amber-300 transition-colors"
          >
            Archive →
          </Link>
        </div>
      </div>
      {/* Dashboard keeps a compact top-3 — /news is the full archive (owner
          7/9 #8: one canonical home for every story, no duplication). */}
      {stories.slice(0, 3).map((s) => <StoryCard key={s.id} story={s} />)}
      <div className="text-center">
        <Link
          href="/news"
          className="inline-block text-[11px] font-semibold text-slate-500 hover:text-brand-gold transition-colors py-1"
        >
          All stories, previews & recaps in the archive →
        </Link>
      </div>
    </div>
  );
}
