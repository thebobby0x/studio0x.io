"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

// Collapsed tiles show a preview (a few key lines ~ the height of a standings
// card) rather than shrinking to a single-line button. Clicking "Show more"
// expands to the full content.
const COLLAPSED_PREVIEW_HEIGHT = 220; // px — roughly one standings card

export default function CollapsibleSection({
  title,
  eyebrow = "studio0x",
  defaultExpanded = false,
  children,
}: {
  title: string;
  /** Rosa 700 mono kicker above the title (studio0x section-header pattern). */
  eyebrow?: string;
  defaultExpanded?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div>
      {/* Title row */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-end justify-between gap-3 px-4 py-2 mb-2 text-left group"
      >
        {/* Rosa 700 mono eyebrow above the Archivo-expanded section title. */}
        <span className="flex flex-col gap-1.5 min-w-0">
          <span className="s0x-eyebrow">{eyebrow}</span>
          <span className="s0x-display text-sm font-bold text-s0x-text transition-colors group-hover:text-s0x-accent truncate">
            {title}
          </span>
        </span>
        <span className="s0x-mono flex items-center gap-1.5 text-[10px] font-semibold text-s0x-accent transition-colors group-hover:text-s0x-teal shrink-0">
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
            className="absolute inset-x-0 bottom-0 h-20 flex items-end justify-center pb-3 bg-gradient-to-t from-s0x-bg via-s0x-bg/85 to-transparent cursor-pointer group"
          >
            <span className="s0x-btn s0x-btn-secondary !px-3 !py-1 !text-[10px] group-hover:border-s0x-ink group-hover:text-s0x-accent">
              Show more
              <ChevronDown size={12} />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
