"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

// Collapsed tiles show a preview (a few key lines ~ the height of a standings
// card) rather than shrinking to a single-line button. Clicking "Show more"
// expands to the full content.
const COLLAPSED_PREVIEW_HEIGHT = 220; // px — roughly one standings card

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
      {/* Title row */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-2 mb-2 text-left group"
      >
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest group-hover:text-slate-300 transition-colors">
          {title}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-gold group-hover:text-amber-300 transition-colors">
          {expanded ? "Collapse" : "Expand"}
          <ChevronDown
            size={13}
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {/* Content — clipped preview when collapsed */}
      <div
        className="relative overflow-hidden transition-[max-height] duration-300"
        style={expanded ? undefined : { maxHeight: COLLAPSED_PREVIEW_HEIGHT }}
      >
        {children}

        {!expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="absolute inset-x-0 bottom-0 h-20 flex items-end justify-center pb-3 bg-gradient-to-t from-brand-dark via-brand-dark/85 to-transparent cursor-pointer group"
          >
            <span className="flex items-center gap-1 text-[11px] font-semibold text-brand-gold group-hover:text-amber-300 transition-colors bg-brand-card border border-brand-border rounded-full px-3 py-1 shadow-lg">
              Show more
              <ChevronDown size={12} />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
