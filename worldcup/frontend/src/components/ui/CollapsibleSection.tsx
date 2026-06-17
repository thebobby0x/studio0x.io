"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export default function CollapsibleSection({
  title,
  defaultExpanded = false,
  children,
}: {
  title: string;
  defaultExpanded?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div>
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-between px-5 py-5 rounded-2xl bg-brand-card border border-brand-border hover:border-slate-600 transition-all text-left group"
        >
          <span className="text-sm font-semibold text-slate-400 group-hover:text-slate-200 transition-colors">
            {title}
          </span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-gold group-hover:text-amber-300 transition-colors">
            Show
            <ChevronDown size={14} />
          </span>
        </button>
      ) : (
        <div>
          <button
            onClick={() => setExpanded(false)}
            className="w-full flex items-center justify-between px-4 py-2 mb-2 text-left group"
          >
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest group-hover:text-slate-300 transition-colors">
              {title}
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors">
              Collapse
              <ChevronDown size={12} className="rotate-180" />
            </span>
          </button>
          {children}
        </div>
      )}
    </div>
  );
}
