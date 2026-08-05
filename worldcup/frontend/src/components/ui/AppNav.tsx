"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trophy, LogIn, LogOut, User, Shield, ChevronDown, Music2 } from "lucide-react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import LiveClock from "./LiveClock";
import LiveMatchBanner from "./LiveMatchBanner";
import ThemeToggle from "./ThemeToggle";
import { useUnits } from "@/lib/units";
import { NAV_GROUPS, activeGroupFor, type NavGroup } from "@/lib/navGroups";
import { WORDMARK } from "@/lib/sportConfig";

// ── Desktop: one button per intent group, dropdown with its pages ─────────────
function GroupMenu({ group, path }: { group: NavGroup; path: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = activeGroupFor(path).key === group.key;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`s0x-mono flex items-center gap-1.5 px-3 py-2 text-[11px] transition-colors ${
          isActive
            ? "font-bold text-s0x-accent s0x-neon-rosa"
            : "font-medium text-s0x-muted hover:text-s0x-accent"
        }`}
      >
        {group.label}
        <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {isActive && (
        <span className="absolute -bottom-[13px] left-3 right-3 h-px bg-s0x-ink shadow-glow-rosa" />
      )}
      {open && (
        <div className="absolute left-0 top-full pt-1 z-50">
          <div className="w-44 rounded-s0x border border-s0x-border bg-s0x-surface shadow-2xl shadow-black/50 overflow-hidden py-1">
            {group.items.map((item) => {
              const itemActive = item.exact ? path === item.href : path.startsWith(item.href) && item.href !== "/";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`s0x-mono block px-4 py-2.5 text-[10px] transition-colors ${
                    itemActive
                      ? "font-bold text-s0x-accent bg-s0x-ink/15"
                      : "font-medium text-s0x-muted hover:text-s0x-accent hover:bg-s0x-ink/10"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu({ session }: { session: NonNullable<ReturnType<typeof useSession>["data"]> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isSuperAdmin = session.user?.role === "SUPER_ADMIN";

  return (
    <div ref={ref} className="relative shrink-0">
      <button onClick={() => setOpen((o) => !o)} title={session.user?.email ?? ""}>
        {session.user?.image
          ? <img src={session.user.image} alt="" className="w-6 h-6 rounded-full" />
          : <User size={14} className="text-slate-400" />
        }
      </button>
      {open && (
        <div className="absolute right-0 top-8 w-44 rounded-s0x border border-s0x-border bg-s0x-surface shadow-xl z-50 overflow-hidden py-1">
          <div className="px-3 py-2 border-b border-s0x-border">
            <div className="text-[11px] font-semibold text-s0x-text truncate">{session.user?.name}</div>
            <div className="s0x-data text-[10px] text-s0x-muted truncate">{session.user?.email}</div>
          </div>
          {isSuperAdmin && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="s0x-mono flex items-center gap-2 px-3 py-2 text-[10px] text-s0x-accent hover:bg-s0x-ink/15 transition-colors"
            >
              <Shield size={12} /> Admin Panel
            </Link>
          )}
          <button
            onClick={() => signOut()}
            className="s0x-mono w-full flex items-center gap-2 px-3 py-2 text-[10px] text-s0x-muted hover:text-s0x-text hover:bg-s0x-ink/10 transition-colors"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// Nav subline: always just the domain (owner 8/4).
//
// The mark itself is the deployment's own name (SPORT.wordmark). The subline
// briefly carried "podiumMetrics · studio0x.io" to keep the platform visible,
// but two product names stacked in the header read as indecision — the sportOS
// family footer already states the lineage ("Leagues Cup 2026 — powered by
// podiumMetrics, part of sportOS by studio0x"), which is the right place for it.
const NAV_SUBLINE = "studio0x.io";

export default function AppNav() {
  const { data: session, status } = useSession();
  const { units, toggleUnits } = useUnits();
  const path = usePathname();
  const isLoggedIn = !!session?.user;
  const activeGroup = activeGroupFor(path);

  return (
    <div className="sticky top-0 z-50">
      {/* Noir 900 command bar — a hairline Rosa rule under it reads as the HUD chrome. */}
      <nav className="relative border-b border-s0x-border bg-s0x-bg/85 backdrop-blur-xl">
        <span className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-s0x-ink/60 to-transparent" />
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <Trophy size={17} className="text-s0x-ink" />
            <div className="leading-none">
              <div className="s0x-display font-black text-s0x-text text-sm tracking-tight transition-colors group-hover:text-s0x-accent">
                {WORDMARK.lead}<span className="text-s0x-accent">{WORDMARK.accent}</span>
              </div>
              {/* Deployment subline. The mark above is SPORT.wordmark — LC26
                  leads with "Leagues Cup 2026" (owner 8/4); WC26 and F1 keep
                  "podiumMetrics", because putting a FIFA / Formula One mark into
                  a user-facing product title needs explicit owner sign-off. */}
              <div className="s0x-mono text-[8px] text-s0x-muted/70 mt-0.5">{NAV_SUBLINE}</div>
            </div>
          </Link>

          {/* Desktop: three intents */}
          <div className="hidden sm:flex items-center gap-1 flex-1 justify-center">
            {NAV_GROUPS.map((g) => (
              <GroupMenu key={g.key} group={g} path={path} />
            ))}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={toggleUnits}
              className="s0x-data text-[10px] text-s0x-muted hover:text-s0x-teal border border-s0x-border hover:border-s0x-teal/60 rounded px-1.5 py-0.5 transition-colors shrink-0"
              title="Toggle metric / imperial"
            >
              <span className="hidden sm:inline">{units === "metric" ? "°C · km" : "°F · mi"}</span>
              <span className="sm:hidden">{units === "metric" ? "°C" : "°F"}</span>
            </button>

            {/* Desktop theme toggle (mobile's lives in the bottom bar) */}
            <ThemeToggle className="hidden sm:flex" />

            <div className="hidden lg:flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-s0x-teal animate-pulse shadow-glow-teal" />
              <LiveClock />
            </div>

            {status !== "loading" && (
              isLoggedIn && session ? (
                <UserMenu session={session} />
              ) : (
                <button
                  onClick={() => signIn("google")}
                  className="s0x-mono shrink-0 flex items-center gap-1 text-[10px] font-semibold text-s0x-accent hover:opacity-80 transition-opacity"
                >
                  <LogIn size={11} />
                  <span className="hidden sm:inline">Sign in</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* Mobile: the ACTIVE group's pages as a pill row (groups switch via bottom bar).
            Anthems shortcut sits right-aligned here — moved up out of the ticker,
            where it was overlapping the results text (owner 7/9 markup). */}
        <div className="sm:hidden border-t border-brand-border/50">
          <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {activeGroup.items.map((item) => {
              const itemActive = item.exact ? path === item.href : path.startsWith(item.href) && item.href !== "/";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`s0x-mono shrink-0 px-3 py-1.5 rounded-full text-[10px] transition-colors ${
                    itemActive
                      ? "font-bold text-s0x-text bg-s0x-ink shadow-glow-rosa"
                      : "font-medium text-s0x-muted bg-s0x-surface border border-s0x-border hover:text-s0x-accent"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            {/* Anthems shortcut — the audio surface is Riptide territory. */}
            <Link
              href="/anthems"
              className={`s0x-mono ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] transition-colors ${
                path.startsWith("/anthems")
                  ? "font-bold text-s0x-onink bg-s0x-teal shadow-glow-teal"
                  : "font-semibold text-s0x-teal bg-s0x-teal/10 border border-s0x-teal/40"
              }`}
            >
              <Music2 size={12} />
              Anthems
            </Link>
          </div>
        </div>
      </nav>
      <LiveMatchBanner />
    </div>
  );
}
