"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Database, KeyRound } from "lucide-react";

interface CompetitionRow {
  slug: string;
  name: string;
  sport: string;
  region: string;
  season: string;
  source: string;
  sourceId: string;
  status: string;
  lastSyncAt: string | null;
  syncError: string | null;
  eventCount: number;
}

export default function SyncCenter() {
  const [rows, setRows] = useState<CompetitionRow[]>([]);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, { sourceId: string; season: string }>>({});

  useEffect(() => {
    setSecret(localStorage.getItem("ps_sync_secret") ?? "");
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/competitions");
    const json = await res.json();
    setRows(json.competitions ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  function saveSecret(v: string) {
    setSecret(v);
    localStorage.setItem("ps_sync_secret", v);
  }

  async function saveMapping(slug: string) {
    const e = edits[slug];
    if (!e) return;
    setBusy(slug);
    const res = await fetch(`/api/competitions?secret=${encodeURIComponent(secret)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, sourceId: e.sourceId, season: e.season }),
    });
    setMsg((m) => ({ ...m, [slug]: res.ok ? "mapping saved" : `save failed (${res.status})` }));
    setBusy(null);
    load();
  }

  async function sync(slug: string) {
    setBusy(slug);
    setMsg((m) => ({ ...m, [slug]: "syncing…" }));
    try {
      const res = await fetch(`/api/sync?slug=${encodeURIComponent(slug)}&secret=${encodeURIComponent(secret)}`, { method: "POST" });
      const json = await res.json();
      const r = json.results?.[slug];
      setMsg((m) => ({
        ...m,
        [slug]: res.ok && r?.ok
          ? `✓ ${r.eventsUpserted} events, ${r.teamsUpserted} teams`
          : `✗ ${r?.error ?? json.error ?? res.status}`,
      }));
    } catch (e) {
      setMsg((m) => ({ ...m, [slug]: `✗ ${String(e)}` }));
    }
    setBusy(null);
    load();
  }

  async function syncAll() {
    setBusy("__all__");
    setMsg((m) => ({ ...m, __all__: "syncing all mapped…" }));
    const res = await fetch(`/api/sync?all=true&secret=${encodeURIComponent(secret)}`, { method: "POST" });
    const json = await res.json();
    setMsg((m) => ({ ...m, __all__: res.ok ? `✓ done (${Object.keys(json.results ?? {}).length} competitions)` : `✗ ${json.error ?? res.status}` }));
    setBusy(null);
    load();
  }

  const synced = rows.filter((r) => r.status === "synced").length;
  const unmapped = rows.filter((r) => !r.sourceId).length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <Database size={18} className="text-brand-gold" /> Data Sync Center
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            podiumSchedule depot · TheSportsDB + Jolpica · non-destructive sync
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-card px-2 py-1.5">
            <KeyRound size={12} className="text-slate-500" />
            <input
              type="password"
              value={secret}
              onChange={(e) => saveSecret(e.target.value)}
              placeholder="sync secret"
              className="bg-transparent text-xs text-slate-300 outline-none w-28"
            />
          </div>
          <button
            onClick={syncAll}
            disabled={busy !== null || !secret}
            className="text-xs font-bold px-3 py-2 rounded-lg bg-brand-gold/15 border border-brand-gold/40 text-brand-gold hover:bg-brand-gold/25 transition-colors disabled:opacity-50"
          >
            Sync All Mapped
          </button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: "Competitions", value: rows.length },
          { label: "Synced", value: synced },
          { label: "Unmapped", value: unmapped },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl bg-brand-card border border-brand-border p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{s.label}</div>
            <div className="text-2xl font-black text-white mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      {msg.__all__ && <div className="text-xs text-slate-400 mb-4">{msg.__all__}</div>}

      <div className="space-y-2">
        {rows.map((r) => {
          const edit = edits[r.slug] ?? { sourceId: r.sourceId, season: r.season };
          return (
            <div key={r.slug} className="rounded-2xl bg-brand-card border border-brand-border px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-white text-sm">{r.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {r.sport} · {r.region} · {r.source}
                    {r.eventCount > 0 && <span className="text-brand-green"> · {r.eventCount} events</span>}
                    {r.status === "synced" && r.lastSyncAt && (
                      <span suppressHydrationWarning> · synced {new Date(r.lastSyncAt).toLocaleString()}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {r.source === "thesportsdb" && (
                    <>
                      <input
                        value={edit.sourceId}
                        onChange={(e) => setEdits((m) => ({ ...m, [r.slug]: { ...edit, sourceId: e.target.value } }))}
                        placeholder="TSDB id"
                        className="bg-brand-dark border border-brand-border rounded-lg px-2 py-1.5 text-xs text-slate-300 w-20 outline-none focus:border-brand-gold/50"
                      />
                      <input
                        value={edit.season}
                        onChange={(e) => setEdits((m) => ({ ...m, [r.slug]: { ...edit, season: e.target.value } }))}
                        placeholder="season"
                        className="bg-brand-dark border border-brand-border rounded-lg px-2 py-1.5 text-xs text-slate-300 w-24 outline-none focus:border-brand-gold/50"
                      />
                      <button
                        onClick={() => saveMapping(r.slug)}
                        disabled={busy !== null || !secret}
                        className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-brand-border text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                      >
                        Save
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => sync(r.slug)}
                    disabled={busy !== null || !secret || (r.source === "thesportsdb" && !r.sourceId)}
                    className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-brand-green/10 border border-brand-green/30 text-brand-green hover:bg-brand-green/20 transition-colors disabled:opacity-40"
                  >
                    <RefreshCw size={11} className={busy === r.slug ? "animate-spin" : ""} /> Sync
                  </button>
                </div>
              </div>
              {(msg[r.slug] || r.syncError) && (
                <div className={`text-[11px] mt-2 ${msg[r.slug]?.startsWith("✓") ? "text-brand-green" : "text-slate-400"}`}>
                  {msg[r.slug] ?? `last error: ${r.syncError}`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-slate-600 mt-6">
        Popular TheSportsDB ids: Premier League 4328 · La Liga 4335 · Bundesliga 4331 · Serie A 4332 ·
        Ligue 1 4334 · UCL 4480 · FIFA World Cup 4429 · NBA 4387 · NFL 4391
      </p>
    </div>
  );
}
