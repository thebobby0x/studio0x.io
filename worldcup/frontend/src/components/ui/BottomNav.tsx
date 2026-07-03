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
      className="sm:hidden fixed bottom-0 inset-x-0 z-50 border-t border-brand-border bg-brand-dark/90 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-4 h-16">
        {NAV_GROUPS.map((g) => {
          const Icon = GROUP_ICONS[g.key];
          const isActive = active.key === g.key;
          return (
            <Link
              key={g.key}
              href={g.lead}
              className={`relative flex flex-col items-center justify-center gap-1 transition-colors ${
                isActive ? "text-brand-gold" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon size={19} strokeWidth={isActive ? 2.4 : 1.8} />
              <span className={`text-[10px] tracking-wide ${isActive ? "font-bold" : "font-medium"}`}>
                {g.label}
              </span>
              {isActive && <span className="absolute top-0 w-8 h-0.5 rounded-full bg-brand-gold" />}
            </Link>
          );
        })}

        {/* Theme toggle — the 4th thumb slot 😉 */}
        <div className="flex flex-col items-center justify-center gap-1">
          <ThemeToggle size={19} />
          <span className="text-[10px] font-medium text-slate-600 tracking-wide">Theme</span>
        </div>
      </div>
    </nav>
  );
}
