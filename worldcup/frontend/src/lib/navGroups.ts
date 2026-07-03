// ─────────────────────────────────────────────────────────────────────────────
// Navigation, organized by fan INTENT rather than by page inventory.
// Three questions a fan arrives with → three groups. Every current and future
// page has an obvious home here instead of demanding another top-level slot.
// Used by both the desktop grouped nav and the mobile bottom tab bar.
// ─────────────────────────────────────────────────────────────────────────────

export interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
}

export interface NavGroup {
  key: "now" | "race" | "fan";
  label: string;
  // The tab's landing page on mobile
  lead: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "now",
    label: "Now",
    lead: "/",
    items: [
      { href: "/", label: "Dashboard", exact: true },
      { href: "/schedule", label: "Schedule" },
      { href: "/news", label: "News" },
    ],
  },
  {
    key: "race",
    label: "The Race",
    lead: "/standings",
    items: [
      { href: "/standings", label: "Standings" },
      { href: "/bracket", label: "Bracket" },
      { href: "/leagues", label: "Leagues" },
      { href: "/officials", label: "Officials" },
    ],
  },
  {
    key: "fan",
    label: "Fan Zone",
    lead: "/predict",
    items: [
      { href: "/predict", label: "Predict" },
      { href: "/anthems", label: "Anthems" },
      { href: "/pulse", label: "Pulse" },
    ],
  },
];

export function activeGroupFor(path: string): NavGroup {
  for (const g of NAV_GROUPS) {
    for (const item of g.items) {
      if (item.exact ? path === item.href : path.startsWith(item.href) && item.href !== "/") {
        return g;
      }
    }
  }
  return NAV_GROUPS[0]; // "/" and unknown routes live under Now
}
