"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trophy, CalendarDays, Radio, Star, Music2, LogIn, LogOut, User, BarChart2, Shield, Building2, Newspaper, GitBranch } from "lucide-react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import LiveClock from "./LiveClock";
import LiveMatchBanner from "./LiveMatchBanner";
import { useUnits } from "@/lib/units";

function NavLink({ href, children, exact, className = "" }: { href: string; children: React.ReactNode; exact?: boolean; className?: string }) {
  const path = usePathname();
  const active = exact ? path === href : path.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex items-center gap-1 text-xs transition-colors ${
        active ? "font-semibold text-brand-gold" : "text-slate-500 hover:text-slate-300"
      } ${className}`}
    >
      {children}
    </Link>
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
  const isLoggedIn = !!session?.user;

  return (
    <div className="sticky top-0 z-50">
      <nav className="border-b border-brand-border bg-brand-dark/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group shrink-0 mr-4">
            <Trophy size={17} className="text-brand-gold" />
            <div className="leading-none">
              <div className="font-black text-white text-sm tracking-tight group-hover:text-brand-gold transition-colors">
                WC <span className="text-brand-gold">2026</span>
              </div>
              <div className="text-[8px] text-slate-700 tracking-widest uppercase">studio0x.io</div>
            </div>
          </Link>

          <div className="flex items-center gap-3 sm:gap-5 flex-1 justify-end">
            <NavLink href="/" exact className="hidden sm:flex">Dashboard</NavLink>
            <NavLink href="/schedule"><CalendarDays size={14} /><span className="hidden sm:inline">Schedule</span></NavLink>
            <NavLink href="/news"><Newspaper size={14} /><span className="hidden sm:inline">News</span></NavLink>
            <NavLink href="/pulse"><Radio size={14} /><span className="hidden sm:inline">Pulse</span></NavLink>
            <NavLink href="/predict"><Star size={13} /><span className="hidden sm:inline">Predict</span></NavLink>
            <NavLink href="/bracket"><GitBranch size={14} /><span className="hidden sm:inline">Bracket</span></NavLink>
            <NavLink href="/standings"><BarChart2 size={14} /><span className="hidden sm:inline">Standings</span></NavLink>
            <NavLink href="/leagues"><Building2 size={14} /><span className="hidden sm:inline">Leagues</span></NavLink>
            <NavLink href="/anthems"><Music2 size={14} /><span className="hidden sm:inline">Anthems</span></NavLink>
            {session?.user?.role === "SUPER_ADMIN" && (
              <NavLink href="/admin"><Shield size={13} /><span className="hidden sm:inline">Admin</span></NavLink>
            )}

            <button
              onClick={toggleUnits}
              className="text-[10px] font-mono text-slate-500 hover:text-slate-300 border border-brand-border hover:border-slate-600 rounded px-1.5 py-0.5 transition-colors shrink-0"
              title="Toggle metric / imperial"
            >
              <span className="hidden sm:inline">{units === "metric" ? "°C · km" : "°F · mi"}</span>
              <span className="sm:hidden">{units === "metric" ? "°C" : "°F"}</span>
            </button>

            <div className="hidden sm:flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
              <LiveClock />
            </div>

            {status !== "loading" && (
              isLoggedIn && session ? (
                <UserMenu session={session} />
              ) : (
                <button
                  onClick={() => signIn("google")}
                  className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-brand-gold hover:text-amber-300 transition-colors"
                >
                  <LogIn size={11} />
                  <span className="hidden sm:inline">Sign in</span>
                </button>
              )
            )}
          </div>
        </div>
      </nav>
      <LiveMatchBanner />
    </div>
  );
}
