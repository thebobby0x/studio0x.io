"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap, Trophy, Sparkles } from "lucide-react";
import { NAV_GROUPS, activeGroupFor } from "@/lib/navGroups";
import ThemeToggle from "./ThemeToggle";

const GROUP_ICONS = { now: Zap, race: Trophy, fan: Sparkles } as const;

// Mobile-only fixed bottom tab bar — three fan intents + the theme toggle,
// all in thumb reach. Desktop uses the grouped top nav instead.
export default function BottomNav() {
  const path = usePathname();
  const active = activeGroupFor(path);

  return (
    <nav
      className="sm:hidden fixed bottom-0 inset-x-0 z-50 border-t border-s0x-border bg-s0x-bg/92 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* HUD hairline along the top edge of the tab bar */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-s0x-ink/70 to-transparent" />
      <div className="grid grid-cols-4 h-16">
        {NAV_GROUPS.map((g) => {
          const Icon = GROUP_ICONS[g.key];
          const isActive = active.key === g.key;
          return (
            <Link
              key={g.key}
              href={g.lead}
              className={`relative flex flex-col items-center justify-center gap-1 transition-colors ${
                isActive ? "text-s0x-accent" : "text-s0x-muted hover:text-s0x-accent"
              }`}
            >
              <Icon size={19} strokeWidth={isActive ? 2.4 : 1.8} />
              <span className={`s0x-mono text-[9px] ${isActive ? "font-bold" : "font-medium"}`}>
                {g.label}
              </span>
              {isActive && (
                <span className="absolute top-0 w-8 h-0.5 rounded-full bg-s0x-ink shadow-glow-rosa" />
              )}
            </Link>
          );
        })}

        {/* Theme toggle — the 4th thumb slot 😉 */}
        <div className="flex flex-col items-center justify-center gap-1">
          <ThemeToggle size={19} />
          <span className="s0x-mono text-[9px] font-medium text-s0x-muted">Theme</span>
        </div>
      </div>
    </nav>
  );
}
