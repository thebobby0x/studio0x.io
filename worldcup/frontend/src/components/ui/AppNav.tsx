"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trophy, CalendarDays, Radio, Star, Music2, LogIn, LogOut, User, BarChart2 } from "lucide-react";
import { useSession, signIn, signOut } from "next-auth/react";
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
            <NavLink href="/pulse"><Radio size={14} /><span className="hidden sm:inline">Pulse</span></NavLink>
            <NavLink href="/predict"><Star size={13} /><span className="hidden sm:inline">Predict</span></NavLink>
            <NavLink href="/standings"><BarChart2 size={14} /><span className="hidden sm:inline">Standings</span></NavLink>
            <NavLink href="/anthems"><Music2 size={14} /><span className="hidden sm:inline">Anthems</span></NavLink>

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
              isLoggedIn ? (
                <button
                  onClick={() => signOut()}
                  className="flex items-center gap-1 shrink-0"
                  title={`Signed in as ${session.user.email} — click to sign out`}
                >
                  {session.user.image
                    ? <img src={session.user.image} alt="" className="w-5 h-5 rounded-full" />
                    : <User size={14} className="text-slate-400" />
                  }
                  <LogOut size={10} className="text-slate-600 hidden sm:block" />
                </button>
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
