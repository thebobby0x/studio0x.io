"use client";

import { useState } from "react";
import { Shield, Eye, Music2, BarChart2, Newspaper, Users, ChevronRight, CheckCircle, Database, UserCheck, Sparkles, Activity, Trash2, BadgeDollarSign } from "lucide-react";

type Role = "SUPER_ADMIN" | "ADMIN" | "WHITE_LABEL" | "USER";

interface User {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  role: Role;
}

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  WHITE_LABEL: "White Label",
  USER: "End User",
};

const ROLE_COLORS: Record<Role, string> = {
  SUPER_ADMIN: "text-brand-gold bg-brand-gold/10 border-brand-gold/30",
  ADMIN: "text-blue-300 bg-blue-500/10 border-blue-500/30",
  WHITE_LABEL: "text-purple-300 bg-purple-500/10 border-purple-500/30",
  USER: "text-slate-300 bg-slate-500/10 border-slate-500/30",
};

const VIEW_OPTIONS = [
  { role: "SUPER_ADMIN" as Role, label: "Super Admin", description: "Full access — your real view", color: "border-brand-gold/50 bg-brand-gold/5 hover:bg-brand-gold/10" },
  { role: "ADMIN" as Role,       label: "Admin / White Label", description: "Partner dashboard + embed view", color: "border-blue-500/50 bg-blue-500/5 hover:bg-blue-500/10" },
  { role: "USER" as Role,        label: "End User", description: "Public fan experience", color: "border-slate-500/50 bg-slate-500/5 hover:bg-slate-500/10" },
];

export default function AdminDashboard({ users }: { users: User[] }) {
  const [viewLoading, setViewLoading] = useState<Role | null>(null);
  const [userRoles, setUserRoles] = useState<Record<string, Role>>(
    Object.fromEntries(users.map((u) => [u.id, u.role]))
  );
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [savedRole, setSavedRole] = useState<string | null>(null);
  const [seedStatus, setSeedStatus] = useState<Record<string, "idle" | "loading" | "done" | "error">>({});

  async function runSeed(key: string, url: string, method: "GET" | "POST" = "POST") {
    setSeedStatus(s => ({ ...s, [key]: "loading" }));
    try {
      const res = await fetch(url, { method });
      setSeedStatus(s => ({ ...s, [key]: res.ok ? "done" : "error" }));
      setTimeout(() => setSeedStatus(s => ({ ...s, [key]: "idle" })), 4000);
    } catch {
      setSeedStatus(s => ({ ...s, [key]: "error" }));
      setTimeout(() => setSeedStatus(s => ({ ...s, [key]: "idle" })), 4000);
    }
  }

  async function switchView(role: Role) {
    setViewLoading(role);
    await fetch("/api/admin/view-as", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    window.location.href = "/";
  }

  async function updateUserRole(userId: string, newRole: Role) {
    setSavingRole(userId);
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role: newRole }),
    });
    setUserRoles((prev) => ({ ...prev, [userId]: newRole }));
    setSavingRole(null);
    setSavedRole(userId);
    setTimeout(() => setSavedRole(null), 2000);
  }

  return (
    <div className="min-h-screen bg-brand-dark">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-gold/10 border border-brand-gold/20">
            <Shield size={20} className="text-brand-gold" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Super Admin</h1>
            <p className="text-xs text-slate-500">Studio0x · World Cup 2026</p>
          </div>
        </div>

        {/* View As */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-slate-400" />
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Preview as Role</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {VIEW_OPTIONS.map((opt) => (
              <button
                key={opt.role}
                onClick={() => switchView(opt.role)}
                disabled={!!viewLoading}
                className={`text-left rounded-xl border p-4 transition-all disabled:opacity-50 ${opt.color}`}
              >
                <div className="font-bold text-white text-sm mb-0.5">{opt.label}</div>
                <div className="text-xs text-slate-400">{opt.description}</div>
                {viewLoading === opt.role && (
                  <div className="mt-2 text-[10px] text-slate-500 animate-pulse">Switching…</div>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Seed Tools */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Database size={14} className="text-slate-400" />
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Data Seeds</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                key: "matches",
                icon: Database,
                label: "Re-seed Matches",
                desc: "Fetch all 48 WC fixtures from api-football & update DB statuses/scores",
                action: () => runSeed("matches", "/api/seed?secret=wc2026studio0x", "GET"),
              },
              {
                key: "players",
                icon: UserCheck,
                label: "Seed Clubs (Mock)",
                desc: "Fill club/league data from curated list — works without API. Good for testing.",
                action: () => runSeed("players", "/api/admin/seed-players?mock=true", "GET"),
              },
              {
                key: "playersLive",
                icon: UserCheck,
                label: "Seed Clubs (Live API)",
                desc: "Pull real club/caps/goals data from api-football for all WC 2026 players. Requires API key.",
                action: () => runSeed("playersLive", "/api/admin/seed-players", "POST"),
              },
              {
                key: "news",
                icon: Sparkles,
                label: "Generate News Recaps",
                desc: "AI recap for every finished match + end-of-day round-ups. Idempotent — re-run to catch up.",
                action: () => runSeed("news", "/api/news/generate?secret=wc2026studio0x", "POST"),
              },
              {
                key: "ingest",
                icon: Activity,
                label: "Ingest Player Stats",
                desc: "Pull per-match stats from api-football for all finished games. Powers PPI™ and cross-metrics.",
                action: () => runSeed("ingest", "/api/admin/ingest-match-stats?secret=wc2026studio0x", "POST"),
              },
              {
                key: "purge",
                icon: Trash2,
                label: "Purge & Regenerate Stories",
                desc: "Delete all existing news stories then regenerate from scratch with corrected prompts.",
                action: async () => {
                  setSeedStatus(s => ({ ...s, purge: "loading" }));
                  try {
                    const del = await fetch("/api/admin/purge-stories?secret=wc2026studio0x", { method: "POST" });
                    if (!del.ok) throw new Error("purge failed");
                    const gen = await fetch("/api/news/generate?secret=wc2026studio0x", { method: "POST" });
                    setSeedStatus(s => ({ ...s, purge: gen.ok ? "done" : "error" }));
                  } catch {
                    setSeedStatus(s => ({ ...s, purge: "error" }));
                  }
                  setTimeout(() => setSeedStatus(s => ({ ...s, purge: "idle" })), 5000);
                },
              },
            ].map(({ key, icon: Icon, label, desc, action }) => {
              const status = seedStatus[key] ?? "idle";
              return (
                <button
                  key={key}
                  onClick={action}
                  disabled={status === "loading"}
                  className="text-left rounded-xl border border-brand-border bg-brand-card p-4 hover:border-brand-gold/50 transition-colors disabled:opacity-60"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={14} className={status === "done" ? "text-brand-green" : status === "error" ? "text-red-400" : "text-brand-gold"} />
                    <div className="font-bold text-white text-sm">{label}</div>
                  </div>
                  <div className="text-[11px] text-slate-500">{desc}</div>
                  {status !== "idle" && (
                    <div className={`text-[10px] mt-2 font-semibold ${status === "loading" ? "text-slate-400 animate-pulse" : status === "done" ? "text-brand-green" : "text-red-400"}`}>
                      {status === "loading" ? "Running…" : status === "done" ? "✓ Done" : "✗ Failed — check Vercel logs"}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Quick Tools */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <ChevronRight size={14} className="text-slate-400" />
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Admin Tools</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { href: "/admin/anthems",  icon: Music2,            label: "Anthem Manager",  desc: "Upload & manage team anthems" },
              { href: "/admin/stats",    icon: BarChart2,          label: "Play Stats",      desc: "Audio stream analytics" },
              { href: "/admin/sponsors", icon: BadgeDollarSign,    label: "Sponsors",        desc: "View sponsors, ad slots & impression stats" },
              { href: `https://worldcup-2026-sandy.vercel.app/api/admin/publish-stories?secret=wc2026studio0x`, icon: Newspaper, label: "Publish Stories", desc: "Push AI stories to content repo", external: true },
            ].map(({ href, icon: Icon, label, desc, external }) => (
              <a
                key={href}
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                className="rounded-xl border border-brand-border bg-brand-card p-4 hover:border-slate-600 transition-colors group"
              >
                <Icon size={16} className="text-brand-gold mb-2" />
                <div className="font-bold text-white text-sm">{label}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{desc}</div>
              </a>
            ))}
          </div>
        </section>

        {/* User Management */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-slate-400" />
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Users ({users.length})</h2>
          </div>
          <div className="rounded-xl border border-brand-border bg-brand-card divide-y divide-brand-border overflow-hidden">
            {users.map((user) => (
              <div key={user.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  {user.image
                    ? <img src={user.image} alt="" className="w-7 h-7 rounded-full shrink-0" />
                    : <div className="w-7 h-7 rounded-full bg-slate-700 shrink-0" />
                  }
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{user.name ?? "—"}</div>
                    <div className="text-[11px] text-slate-500 truncate">{user.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {savedRole === user.id && <CheckCircle size={14} className="text-brand-green" />}
                  <select
                    value={userRoles[user.id]}
                    disabled={savingRole === user.id}
                    onChange={(e) => updateUserRole(user.id, e.target.value as Role)}
                    className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border bg-transparent cursor-pointer disabled:opacity-50 ${ROLE_COLORS[userRoles[user.id]]}`}
                  >
                    {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                      <option key={r} value={r} className="bg-slate-900 text-white">{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
