import { WORDMARK, BRAND_IS_PLATFORM } from "@/lib/sportConfig";

// Global sportOS family strip (owner 7/15): podiumMetrics is the platform
// product; quiet links cross-promote the sibling products. podiumSelect and
// podiumSchedule render greyed "coming soon" until their URLs are provided —
// swap the <span>s for <a>s when the owner supplies links.
//
// On a deployment that leads with the tournament name (LC26), this strip is
// where the platform lineage is stated instead — "… — powered by podiumMetrics,
// part of sportOS by studio0x". On podiumMetrics itself that clause would be
// redundant, so it is omitted and the strip renders exactly as before.
export default function SportOSFooter() {
  return (
    <footer className="relative border-t border-s0x-border bg-s0x-bg py-6 text-center space-y-2.5">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-s0x-ink/50 to-transparent" />
      <div className="s0x-display text-xs font-black text-s0x-text tracking-tight">
        {WORDMARK.lead}<span className="text-s0x-accent">{WORDMARK.accent}</span>
        <span className="text-s0x-muted font-medium">
          {BRAND_IS_PLATFORM ? " — part of " : " — powered by podiumMetrics, part of "}
        </span>
        sportOS
        <span className="text-s0x-muted font-medium"> by studio0x</span>
      </div>
      <div className="s0x-mono flex items-center justify-center gap-4 text-[9px] text-s0x-muted">
        <span title="VIP sport travel — coming soon" className="cursor-default">
          podiumSelect
        </span>
        <span aria-hidden className="text-s0x-ink">·</span>
        <span title="Global sport calendar — coming soon" className="cursor-default">
          podiumSchedule
        </span>
      </div>
    </footer>
  );
}
