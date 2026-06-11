"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Music2, ChevronLeft, Check, Plus, Save, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";

interface TeamWithAnthem {
  id: string;
  name: string;
  code: string;
  flagEmoji: string;
  groupStage: string;
  anthem: {
    id: string;
    audioUrl: string;
    title: string;
    artistCredit: string;
    durationSecs: number;
    tiktokDeepLink: string | null;
    playCount: number;
  } | null;
}

const EMPTY_FORM = {
  teamCode: "",
  audioUrl: "",
  title: "",
  artistCredit: "Suno AI × Studio0x",
  durationSecs: "",
  tiktokDeepLink: "",
};

export default function AnthemAdmin() {
  const [secret, setSecret] = useState("");
  const [secretInput, setSecretInput] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [authError, setAuthError] = useState("");

  const [teams, setTeams] = useState<TeamWithAnthem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<TeamWithAnthem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const isAuthed = !!secret;

  async function authenticate() {
    setAuthError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/anthem?secret=${encodeURIComponent(secretInput)}`);
      if (res.status === 401) { setAuthError("Incorrect secret."); return; }
      const data: TeamWithAnthem[] = await res.json();
      setTeams(data);
      setSecret(secretInput);
    } catch {
      setAuthError("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshTeams() {
    const res = await fetch(`/api/admin/anthem?secret=${encodeURIComponent(secret)}`);
    if (res.ok) setTeams(await res.json());
  }

  function selectTeam(team: TeamWithAnthem) {
    setSelected(team);
    setSaveResult(null);
    setForm({
      teamCode: team.code,
      audioUrl: team.anthem?.audioUrl ?? "",
      title: team.anthem?.title ?? `${team.name} World Cup Anthem 2026`,
      artistCredit: team.anthem?.artistCredit ?? "Suno AI × Studio0x",
      durationSecs: team.anthem?.durationSecs ? String(team.anthem.durationSecs) : "",
      tiktokDeepLink: team.anthem?.tiktokDeepLink ?? "",
    });
  }

  function clearForm() {
    setSelected(null);
    setSaveResult(null);
    setForm(EMPTY_FORM);
  }

  async function saveAnthem() {
    if (!form.teamCode || !form.audioUrl) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch(`/api/admin/anthem?secret=${encodeURIComponent(secret)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamCode: form.teamCode,
          audioUrl: form.audioUrl.trim(),
          title: form.title.trim() || undefined,
          artistCredit: form.artistCredit.trim() || undefined,
          durationSecs: form.durationSecs ? Number(form.durationSecs) : undefined,
          tiktokDeepLink: form.tiktokDeepLink.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveResult({ ok: false, msg: data.error ?? "Save failed." });
      } else {
        setSaveResult({ ok: true, msg: `✓ Anthem saved for ${data.team?.name ?? form.teamCode}` });
        await refreshTeams();
      }
    } catch {
      setSaveResult({ ok: false, msg: "Network error — try again." });
    } finally {
      setSaving(false);
    }
  }

  const teamsWithAnthem = teams.filter((t) => t.anthem);
  const teamsWithout = teams.filter((t) => !t.anthem);

  // ── Auth Gate ──
  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 text-brand-gold">
            <Music2 size={20} />
            <span className="font-bold text-white text-lg">Admin · Anthem Manager</span>
          </div>
          <div className="rounded-2xl bg-brand-card border border-brand-border p-6 space-y-4">
            <label className="block text-sm font-semibold text-slate-300">Enter admin secret</label>
            <div className="relative">
              <input
                type={showSecret ? "text" : "password"}
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && authenticate()}
                placeholder="wc2026studio0x"
                className="w-full bg-brand-dark border border-brand-border rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-green text-sm pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {authError && (
              <p className="flex items-center gap-1.5 text-sm text-red-400">
                <AlertCircle size={14} /> {authError}
              </p>
            )}
            <button
              onClick={authenticate}
              disabled={!secretInput || loading}
              className="w-full py-3 rounded-xl bg-brand-green text-black font-bold text-sm hover:bg-green-400 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? "Checking…" : "Unlock Admin"}
            </button>
            <Link href="/" className="block text-center text-xs text-slate-500 hover:text-slate-300 mt-2">
              ← Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Main Admin UI ──
  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-brand-border bg-brand-dark/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm">
            <ChevronLeft size={16} /> Dashboard
          </Link>
          <span className="text-brand-border">·</span>
          <Music2 size={15} className="text-brand-gold" />
          <span className="font-bold text-white">Anthem Manager</span>
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-brand-border text-slate-400">
            {teamsWithAnthem.length} / {teams.length} teams
          </span>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* ── Team List ── */}
        <div className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Teams</h2>

          {/* Teams with anthems */}
          {teamsWithAnthem.length > 0 && (
            <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
              <div className="px-4 py-2 border-b border-brand-border text-[10px] font-semibold uppercase tracking-widest text-brand-green flex items-center gap-1.5">
                <Check size={10} /> Has Anthem ({teamsWithAnthem.length})
              </div>
              <div className="divide-y divide-brand-border">
                {teamsWithAnthem.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectTeam(t)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors ${selected?.id === t.id ? "bg-brand-green/10" : ""}`}
                  >
                    <span className="text-2xl">{t.flagEmoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-semibold ${selected?.id === t.id ? "text-brand-green" : "text-white"}`}>{t.name}</div>
                      <div className="text-xs text-slate-500 truncate">{t.anthem!.title}</div>
                    </div>
                    <div className="text-[10px] text-slate-500 flex-shrink-0">
                      {t.anthem!.playCount.toLocaleString()} plays
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Teams without anthems */}
          {teamsWithout.length > 0 && (
            <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
              <div className="px-4 py-2 border-b border-brand-border text-[10px] font-semibold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                <Plus size={10} /> No Anthem Yet ({teamsWithout.length})
              </div>
              <div className="divide-y divide-brand-border">
                {teamsWithout.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectTeam(t)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors ${selected?.id === t.id ? "bg-brand-green/10" : ""}`}
                  >
                    <span className="text-2xl">{t.flagEmoji}</span>
                    <div className="text-sm text-slate-400">{t.name}</div>
                    <span className="ml-auto text-[10px] text-slate-600">Group {t.groupStage}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Edit / Add Form ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              {selected ? `Editing: ${selected.name}` : "Select a team to edit"}
            </h2>
            {selected && (
              <button onClick={clearForm} className="text-xs text-slate-500 hover:text-white transition-colors">
                Clear
              </button>
            )}
          </div>

          <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
            {!selected ? (
              <div className="px-6 py-12 text-center text-slate-600">
                <Music2 size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Click a team on the left to edit or add their anthem.</p>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                {/* Team badge */}
                <div className="flex items-center gap-3 pb-3 border-b border-brand-border">
                  <span className="text-3xl">{selected.flagEmoji}</span>
                  <div>
                    <div className="font-bold text-white">{selected.name}</div>
                    <div className="text-xs text-slate-500">Code: {selected.code} · Group {selected.groupStage}</div>
                  </div>
                </div>

                {/* Audio URL */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Audio URL <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="url"
                    value={form.audioUrl}
                    onChange={(e) => setForm((f) => ({ ...f, audioUrl: e.target.value }))}
                    placeholder="https://cdn1.suno.ai/your-track.mp3"
                    className="w-full bg-brand-dark border border-brand-border rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-green text-sm"
                  />
                  <p className="text-[10px] text-slate-600 mt-1">
                    From Suno: right-click track → Copy audio address, or paste the CDN URL
                  </p>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Track Title</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder={`${selected.name} World Cup Anthem 2026`}
                    className="w-full bg-brand-dark border border-brand-border rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-green text-sm"
                  />
                </div>

                {/* Artist Credit */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Artist Credit</label>
                  <input
                    type="text"
                    value={form.artistCredit}
                    onChange={(e) => setForm((f) => ({ ...f, artistCredit: e.target.value }))}
                    placeholder="Suno AI × Studio0x"
                    className="w-full bg-brand-dark border border-brand-border rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-green text-sm"
                  />
                </div>

                {/* Duration */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Duration (seconds)</label>
                  <input
                    type="number"
                    value={form.durationSecs}
                    onChange={(e) => setForm((f) => ({ ...f, durationSecs: e.target.value }))}
                    placeholder="180"
                    min="1"
                    className="w-full bg-brand-dark border border-brand-border rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-green text-sm"
                  />
                  <p className="text-[10px] text-slate-600 mt-1">e.g. 3:15 = 195 seconds</p>
                </div>

                {/* TikTok Deep Link */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">TikTok Sound Link</label>
                  <input
                    type="url"
                    value={form.tiktokDeepLink}
                    onChange={(e) => setForm((f) => ({ ...f, tiktokDeepLink: e.target.value }))}
                    placeholder="https://www.tiktok.com/music/..."
                    className="w-full bg-brand-dark border border-brand-border rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-green text-sm"
                  />
                  <p className="text-[10px] text-slate-600 mt-1">From Suno: Share → TikTok, then copy the sound URL</p>
                </div>

                {/* Save button */}
                <button
                  onClick={saveAnthem}
                  disabled={!form.audioUrl || saving}
                  className="w-full py-3 rounded-xl bg-brand-green text-black font-bold text-sm hover:bg-green-400 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {saving
                    ? <><Loader2 size={16} className="animate-spin" /> Saving…</>
                    : <><Save size={16} /> Save Anthem</>}
                </button>

                {/* Result message */}
                {saveResult && (
                  <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-xl ${saveResult.ok ? "bg-brand-green/10 text-brand-green" : "bg-red-500/10 text-red-400"}`}>
                    {saveResult.ok ? <Check size={14} /> : <AlertCircle size={14} />}
                    {saveResult.msg}
                  </div>
                )}

                {/* Preview link */}
                {selected.anthem && (
                  <Link
                    href="/anthems"
                    className="block text-center text-xs text-brand-gold hover:text-amber-300 transition-colors"
                  >
                    → Preview in Anthem Hub
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
