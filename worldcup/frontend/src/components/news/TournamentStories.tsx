"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, ChevronDown, ChevronUp, Newspaper } from "lucide-react";
import type { Story } from "@/app/api/ai/stories/route";
import FlagImg from "@/components/ui/FlagImg";

const CATEGORY_COLORS: Record<string, string> = {
  "MATCH REPORT":    "bg-blue-500/20 text-blue-300",
  "ANALYSIS":        "bg-brand-gold/20 text-amber-300",
  "STANDINGS":       "bg-emerald-500/20 text-emerald-300",
  "METRIC SPOTLIGHT":"bg-purple-500/20 text-purple-300",
};

function StoryCard({ story }: { story: Story }) {
  const [expanded, setExpanded] = useState(false);
  const catColor = CATEGORY_COLORS[story.category] ?? "bg-slate-700 text-slate-300";
  const age = Math.round((Date.now() - new Date(story.generatedAt).getTime()) / 60_000);
  const ageStr = age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`;

  return (
    <div className="rounded-xl bg-brand-card border border-brand-border p-4 flex flex-col gap-2 transition-all">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${catColor}`}>
          {story.category}
        </span>
        <div className="flex items-center gap-1.5">
          {story.teamsInvolved.slice(0, 2).map((tla) => (
            <FlagImg key={tla} tla={tla} size={18} />
          ))}
          <span className="text-[10px] text-slate-600 ml-1">{ageStr}</span>
        </div>
      </div>

      <h3 className="font-black text-white text-base leading-snug">{story.headline}</h3>

      <p className={`text-sm text-slate-400 leading-relaxed ${expanded ? "" : "line-clamp-3"}`}>
        {story.body}
      </p>

      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors self-start mt-0.5"
      >
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        {expanded ? "Less" : "Read more"}
      </button>
    </div>
  );
}

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
          <span className="text-xs font-black uppercase tracking-widest text-slate-400">Studio0x Analysis</span>
        </div>
        <button
          onClick={() => load(true)}
          disabled={regenerating}
          className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-brand-gold transition-colors disabled:opacity-40"
        >
          <RefreshCw size={11} className={regenerating ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>
      {stories.map((s) => <StoryCard key={s.id} story={s} />)}
    </div>
  );
}
