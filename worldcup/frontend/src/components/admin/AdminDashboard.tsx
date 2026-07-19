"use client";

import { useState } from "react";
import { Shield, Eye, Music2, BarChart2, Newspaper, Users, ChevronRight, CheckCircle, Database, UserCheck, Sparkles, Activity, Trash2, BadgeDollarSign, RefreshCw, Thermometer } from "lucide-react";

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
  // Response detail per tool (7/19): '✓ Done' hid the actual outcome — the
  // stats ingest reported success while writing ZERO rows and nobody could
  // tell. Every tool now shows the response's numbers, and they persist on
  // screen (no auto-clear) so results can be read and reported.
  const [seedDetail, setSeedDetail] = useState<Record<string, string>>({});
  const [showMaintenance, setShowMaintenance] = useState(false);

  function summarize(json: unknown): string {
    if (!json || typeof json !== "object") return "";
    const obj = json as Record<string, unknown>;
    const parts: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") parts.push(`${k}: ${v}`);
      else if (Array.isArray(v)) parts.push(`${k}: ${v.length} item(s)${v.length ? ` — ${String(v[0]).slice(0, 120)}` : ""}`);
    }
    return parts.join(" · ").slice(0, 400);
  }

  async function runSeed(key: string, url: string, method: "GET" | "POST" = "POST") {
    setSeedStatus(s => ({ ...s, [key]: "loading" }));
    setSeedDetail(d => ({ ...d, [key]: "" }));
    try {
      const res = await fetch(url, { method });
      const json = await res.json().catch(() => null);
      setSeedStatus(s => ({ ...s, [key]: res.ok ? "done" : "error" }));
      setSeedDetail(d => ({ ...d, [key]: summarize(json) || `HTTP ${res.status}` }));
    } catch (e) {
      setSeedStatus(s => ({ ...s, [key]: "error" }));
      setSeedDetail(d => ({ ...d, [key]: e instanceof Error ? e.message : "request failed" }));
    }
  }

  type SeedTool = {
    key: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    label: string;
    desc: string;
    action: () => void | Promise<void>;
  };

  const renderSeedTool = ({ key, icon: Icon, label, desc, action }: SeedTool) => {
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
            {status === "loading" ? "Running…" : status === "done" ? "✓ Done" : "✗ Failed"}
          </div>
        )}
        {seedDetail[key] && status !== "loading" && (
          <div className="text-[10px] mt-1 font-mono text-slate-400 break-words">{seedDetail[key]}</div>
        )}
      </button>
    );
  };

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
            <p className="text-xs text-slate-500">studio0x · podiumMetrics</p>
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

        {/* Seed Tools — 6 daily-driver buttons; rare/destructive tools live in the
            collapsed Maintenance section below. (Retired as superseded/one-time-done:
            Sync Match Statuses → covered by Sync Fixtures; Purge Placeholder Anthems
            and Purge ALL Anthem Blobs → completed one-time migrations. Endpoints remain.) */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Database size={14} className="text-slate-400" />
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Data</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([
              {
                key: "syncFixtures",
                icon: RefreshCw,
                label: "Sync Fixtures (Safe)",
                desc: "Non-destructive sync, on demand: new fixtures (knockouts!), scores, statuses, TBD→real team upgrades. Also runs nightly. Never deletes anything.",
                action: () => runSeed("syncFixtures", "/api/admin/sync-fixtures?secret=wc2026studio0x", "POST"),
              },
              {
                key: "news",
                icon: Sparkles,
                label: "Generate News Recaps",
                desc: "AI recap for every finished match + end-of-day round-ups. Idempotent — re-run to catch up.",
                action: () => runSeed("news", "/api/news/generate?secret=wc2026studio0x", "POST"),
              },
              {
                key: "fullSquads",
                icon: Users,
                label: "Seed Full Squads (Live API)",
                desc: "Import all 26-man squads for all 48 WC teams from api-football. Populates the Leagues page with all called-up players.",
                action: () => runSeed("fullSquads", "/api/admin/seed-full-squads", "POST"),
              },
              {
                key: "playersLive",
                icon: UserCheck,
                label: "Seed Clubs (Live API)",
                desc: "Pull real club/caps/goals data from api-football for all WC 2026 players.",
                action: () => runSeed("playersLive", "/api/admin/seed-players", "POST"),
              },
              {
                key: "ingest",
                icon: Activity,
                label: "Ingest Player Stats",
                desc: "Pull per-match stats from api-football for all finished games. Powers PPI™, Officials™ and cross-metrics. Also runs nightly.",
                action: () => runSeed("ingest", "/api/admin/ingest-match-stats?secret=wc2026studio0x", "POST"),
              },
              {
                key: "heatBackfill",
                icon: Thermometer,
                label: "Backfill Match Weather (Heat vs. Outcomes)",
                desc: "Stamps every played match with its real kickoff-hour heat index + humidity (Open-Meteo archive) and FT outcome facts. Chunked; safe to re-run — only fills gaps. New matches auto-stamp nightly.",
                action: async () => {
                  setSeedStatus(s => ({ ...s, heatBackfill: "loading" }));
                  try {
                    // Chunks of 8 (1 weather + 1 events call per match) so no
                    // single request nears the 60s Hobby function limit.
                    let created = 0;
                    for (let guard = 0; guard < 25; guard++) {
                      const res = await fetch("/api/admin/backfill-weather?count=8", { method: "POST" });
                      if (!res.ok) throw new Error(`chunk failed (${res.status})`);
                      const data = await res.json() as { created: number; outcomesAdded: number; remaining: number };
                      created += (data.created ?? 0) + (data.outcomesAdded ?? 0);
                      if ((data.remaining ?? 0) === 0) break;
                    }
                    setSeedStatus(s => ({ ...s, heatBackfill: created > 0 ? "done" : "error" }));
                  } catch {
                    setSeedStatus(s => ({ ...s, heatBackfill: "error" }));
                  }
                  setTimeout(() => setSeedStatus(s => ({ ...s, heatBackfill: "idle" })), 6000);
                },
              },
              {
                key: "resetAnthems",
                icon: Music2,
                label: "Wipe + Reimport ALL Anthems (Drive)",
                desc: "Re-imports every manifest track fresh from Google Drive in small chunks, then prunes stale records — correct teams, flags and titles.",
                action: async () => {
                  setSeedStatus(s => ({ ...s, resetAnthems: "loading" }));
                  try {
                    // Import in chunks of 6 so no single request hits the 60s Hobby
                    // function limit, then finalize (prune stale rows).
                    const CHUNK = 6;
                    let offset = 0;
                    let totalImported = 0;
                    for (let guard = 0; guard < 20; guard++) {
                      const res = await fetch(`/api/admin/batch-anthem?secret=wc2026studio0x&preset=true&offset=${offset}&count=${CHUNK}`);
                      if (!res.ok) throw new Error(`chunk ${offset} failed (${res.status})`);
                      const data = await res.json() as { imported: number; done: boolean; nextOffset: number | null };
                      totalImported += data.imported ?? 0;
                      if (data.done || data.nextOffset == null) break;
                      offset = data.nextOffset;
                    }
                    const fin = await fetch("/api/admin/batch-anthem?secret=wc2026studio0x&finalize=true");
                    setSeedStatus(s => ({ ...s, resetAnthems: fin.ok && totalImported > 0 ? "done" : "error" }));
                  } catch {
                    setSeedStatus(s => ({ ...s, resetAnthems: "error" }));
                  }
                  setTimeout(() => setSeedStatus(s => ({ ...s, resetAnthems: "idle" })), 6000);
                },
              },
            ] as SeedTool[]).map(renderSeedTool)}
          </div>

          {/* Maintenance & Danger Zone — rare repairs + destructive resets, collapsed
              so daily use stays clean. Nothing here is needed in normal operation. */}
          <button
            onClick={() => setShowMaintenance(v => !v)}
            className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-slate-600 hover:text-slate-400 transition-colors pt-2"
          >
            <ChevronRight size={12} className={`transition-transform ${showMaintenance ? "rotate-90" : ""}`} />
            Maintenance & Danger Zone
          </button>
          {showMaintenance && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {([
                {
                  key: "matches",
                  icon: Database,
                  label: "Re-seed Matches (Hard Reset)",
                  desc: "DESTRUCTIVE: wipes and rebuilds all match data (stats/markets included). Teams, players and anthems are preserved. Use Sync Fixtures instead unless something is truly broken.",
                  action: () => runSeed("matches", "/api/seed?secret=wc2026studio0x", "GET"),
                },
                {
                  key: "players",
                  icon: UserCheck,
                  label: "Seed Clubs (Mock)",
                  desc: "Testing only: fill club/league data from a curated list without hitting the API.",
                  action: () => runSeed("players", "/api/admin/seed-players?mock=true", "GET"),
                },
                {
                  key: "purge",
                  icon: Trash2,
                  label: "Purge & Regenerate Stories",
                  desc: "DESTRUCTIVE: deletes all news stories, then regenerates from scratch.",
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
                {
                  key: "blobCleanup",
                  icon: Trash2,
                  label: "Free Up Blob Storage",
                  desc: "Purges regenerable TTS/deep-dive caches + orphaned anthem dupes. Runs automatically each night — manual escape hatch if audio shows 'unavailable'.",
                  action: () => runSeed("blobCleanup", "/api/admin/blob-cleanup?secret=wc2026studio0x", "POST"),
                },
                {
                  key: "relinkAnthems",
                  icon: Music2,
                  label: "Relink Anthems + Fix Titles",
                  desc: "Repair tool: re-links anthem records to teams by filename country code and restores manifest titles. Rarely needed since links no longer sever.",
                  action: () => runSeed("relinkAnthems", "/api/admin/anthem-relink?secret=wc2026studio0x", "GET"),
                },
              ] as SeedTool[]).map(renderSeedTool)}
            </div>
          )}
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
