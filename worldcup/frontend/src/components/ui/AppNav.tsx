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
        className={`flex items-center gap-1.5 px-3 py-2 text-xs uppercase tracking-[0.14em] transition-colors ${
          isActive ? "font-bold text-brand-gold" : "font-semibold text-slate-500 hover:text-slate-300"
        }`}
      >
        {group.label}
        <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {isActive && <span className="absolute -bottom-[13px] left-3 right-3 h-px bg-brand-gold/70" />}
      {open && (
        <div className="absolute left-0 top-full pt-1 z-50">
          <div className="w-44 rounded-xl border border-brand-border bg-brand-card shadow-2xl shadow-black/50 overflow-hidden py-1">
            {group.items.map((item) => {
              const itemActive = item.exact ? path === item.href : path.startsWith(item.href) && item.href !== "/";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`block px-4 py-2.5 text-xs transition-colors ${
                    itemActive
                      ? "font-bold text-brand-gold bg-brand-gold/10"
                      : "font-medium text-slate-400 hover:text-white hover:bg-white/5"
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
        <div className="absolute right-0 top-8 w-44 rounded-xl border border-brand-border bg-brand-card shadow-xl z-50 overflow-hidden py-1">
          <div className="px-3 py-2 border-b border-brand-border">
            <div className="text-[11px] font-semibold text-white truncate">{session.user?.name}</div>
            <div className="text-[10px] text-slate-500 truncate">{session.user?.email}</div>
          </div>
          {isSuperAdmin && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs text-brand-gold hover:bg-brand-gold/10 transition-colors"
            >
              <Shield size={12} /> Admin Panel
            </Link>
          )}
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppNav() {
  const { data: session, status } = useSession();
  const { units, toggleUnits } = useUnits();
  const path = usePathname();
  const isLoggedIn = !!session?.user;
  const activeGroup = activeGroupFor(path);

  return (
    <div className="sticky top-0 z-50">
      <nav className="border-b border-brand-border bg-brand-dark/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <Trophy size={17} className="text-brand-gold" />
            <div className="leading-none">
              <div className="font-black text-white text-sm tracking-tight group-hover:text-brand-gold transition-colors">
                footy<span className="text-brand-gold">26</span>
              </div>
              <div className="text-[8px] text-slate-700 tracking-widest uppercase">studio0x.io</div>
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
              className="text-[10px] font-mono text-slate-500 hover:text-slate-300 border border-brand-border hover:border-slate-600 rounded px-1.5 py-0.5 transition-colors shrink-0"
              title="Toggle metric / imperial"
            >
              <span className="hidden sm:inline">{units === "metric" ? "°C · km" : "°F · mi"}</span>
              <span className="sm:hidden">{units === "metric" ? "°C" : "°F"}</span>
            </button>

            {/* Desktop theme toggle (mobile's lives in the bottom bar) */}
            <ThemeToggle className="hidden sm:flex" />

            <div className="hidden lg:flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
              <LiveClock />
            </div>

            {status !== "loading" && (
              isLoggedIn && session ? (
                <UserMenu session={session} />
              ) : (
                <button
                  onClick={() => signIn("google")}
                  className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-brand-gold hover:opacity-80 transition-opacity"
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
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs transition-colors ${
                    itemActive
                      ? "font-bold text-brand-dark bg-brand-gold"
                      : "font-medium text-slate-400 bg-white/5 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/anthems"
              className={`ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors ${
                path.startsWith("/anthems")
                  ? "font-bold text-brand-dark bg-brand-gold"
                  : "font-semibold text-brand-gold bg-brand-gold/10 border border-brand-gold/20"
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
