"use client";

import type { GoalEvent } from "@/app/api/matches/[id]/goals/route";
import type { TeamLiveStats } from "@/lib/liveStats";

// ── Live Pressure (from real team stats) ──────────────────────────────────────
// Momentum share derived from api-football live statistics so the panel moves
// even at 0-0. Weights: possession 35%, total shots 25%, on target 25%,
// corners 15% — each component only counts when the feed reports it.
function computeLivePressure(home: TeamLiveStats, away: TeamLiveStats) {
  const parts: { w: number; h: number; a: number }[] = [];
  if (home.possession !== null && away.possession !== null && home.possession + away.possession > 0)
    parts.push({ w: 0.35, h: home.possession, a: away.possession });
  if (home.totalShots !== null && away.totalShots !== null && home.totalShots + away.totalShots > 0)
    parts.push({ w: 0.25, h: home.totalShots, a: away.totalShots });
  if (home.shotsOn !== null && away.shotsOn !== null && home.shotsOn + away.shotsOn > 0)
    parts.push({ w: 0.25, h: home.shotsOn, a: away.shotsOn });
  if (home.corners !== null && away.corners !== null && home.corners + away.corners > 0)
    parts.push({ w: 0.15, h: home.corners, a: away.corners });

  if (parts.length === 0) return null;

  const totalW = parts.reduce((s, p) => s + p.w, 0);
  const homeShare = parts.reduce((s, p) => s + (p.h / (p.h + p.a)) * (p.w / totalW), 0);
  return Math.round(homeShare * 100);
}

function StatDuel({ label, home, away, suffix = "" }: { label: string; home: number | null; away: number | null; suffix?: string }) {
  if (home === null && away === null) return null;
  return (
    <div className="bg-slate-900/40 rounded-lg px-2.5 py-1.5 text-center">
      <div className="flex items-center justify-between gap-1 text-xs font-black tabular-nums">
        <span className="text-brand-green">{home ?? "—"}{home !== null ? suffix : ""}</span>
        <span className="text-amber-400">{away ?? "—"}{away !== null ? suffix : ""}</span>
      </div>
      <div className="text-[8px] text-slate-500 uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

// ── Clutch Index™ ─────────────────────────────────────────────────────────────
// Weight per goal: lead-changing = 3, equalising = 2.5, extending = 1, OG = 0.5
// Late-goal multiplier: ×1.5 if minute ≥ 80
function computeClutchIndex(goals: GoalEvent[], homeTeam: string) {
  const sorted = [...goals].sort((a, b) => a.minute - b.minute);
  let h = 0, a = 0;
  const scores = new Map<string, { ci: number; n: number; team: string }>();

  for (const g of sorted) {
    const isHome = g.team === homeTeam;
    const prevH = h, prevA = a;

    if (g.isOwnGoal) { isHome ? a++ : h++; }
    else              { isHome ? h++ : a++; }

    if (!g.isOwnGoal) {
      let w = 1;
      if (isHome) {
        if (prevH <= prevA) w = prevH === prevA ? 3 : 2.5;
      } else {
        if (prevA <= prevH) w = prevA === prevH ? 3 : 2.5;
      }
      if (g.minute >= 80) w *= 1.5;

      const key = g.scorer;
      const e = scores.get(key) ?? { ci: 0, n: 0, team: g.team };
      scores.set(key, { ci: e.ci + w, n: e.n + 1, team: e.team });
    }
  }

  return [...scores.entries()]
    .map(([name, d]) => ({ name, team: d.team, goals: d.n, ci: +(d.ci / d.n).toFixed(1) }))
    .sort((a, b) => b.ci - a.ci || b.goals - a.goals);
}

// ── Strike Clock™ ─────────────────────────────────────────────────────────────
// Measures goal timing patterns: first strike minute, avg gap, rhythm label
function computeStrikeClock(goals: GoalEvent[]) {
  if (goals.length === 0) return null;
  const sorted = [...goals].sort((a, b) => a.minute - b.minute);
  const first = sorted[0].minute;
  const last = sorted[sorted.length - 1].minute;

  let avgGap: number | null = null;
  if (sorted.length > 1) {
    const gaps = sorted.slice(1).map((g, i) => g.minute - sorted[i].minute);
    avgGap = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
  }

  const rhythm =
    first <= 10           ? "Explosive"    :
    sorted.length >= 4    ? "High-Scoring" :
    last >= 85            ? "Late Drama"   : "Steady";
  const rhythmEmoji =
    first <= 10           ? "⚡" :
    sorted.length >= 4    ? "🎯" :
    last >= 85            ? "🔥" : "⏱";

  return { first, last, avgGap, rhythm, rhythmEmoji, total: sorted.length };
}

// ── Score Volatility™ ─────────────────────────────────────────────────────────
// Counts lead changes and equalisers to quantify match drama
function computeScoreVolatility(goals: GoalEvent[], homeTeam: string) {
  const sorted = [...goals].sort((a, b) => a.minute - b.minute);
  let h = 0, a = 0, leadChanges = 0, equalisers = 0;
  let prevLead: "home" | "away" | "level" = "level";

  for (const g of sorted) {
    const isHome = !g.isOwnGoal ? g.team === homeTeam : g.team !== homeTeam;
    if (isHome) h++; else a++;

    const lead: "home" | "away" | "level" = h > a ? "home" : a > h ? "away" : "level";
    if (lead === "level" && prevLead !== "level") equalisers++;
    if (lead !== "level" && prevLead !== "level" && lead !== prevLead) leadChanges++;
    prevLead = lead;
  }

  const dramaLabel =
    leadChanges >= 2 ? "High Drama"  :
    equalisers >= 2  ? "Tense"       :
    leadChanges === 1 ? "Shifted"    : "Dominant";
  const dramaEmoji =
    leadChanges >= 2 ? "🎭" :
    equalisers >= 2  ? "😤" :
    leadChanges === 1 ? "↔️" : "⬛";

  return { leadChanges, equalisers, dramaLabel, dramaEmoji };
}

// ── Momentum Pulse™ ──────────────────────────────────────────────────────────
// Returns annotated goal events with running score for the timeline.
function computeMomentumPulse(
  goals: GoalEvent[],
  homeTeam: string,
  matchStatus?: string,
  currentMinute?: number,
) {
  const MAX_MINUTE = matchStatus === "LIVE" && currentMinute != null
    ? Math.max(currentMinute, 1)
    : matchStatus === "HT" ? 45 : 90;

  const sorted = [...goals]
    .filter(g => g.minute <= MAX_MINUTE + 5)
    .sort((a, b) => a.minute - b.minute);

  let h = 0, a = 0;
  const events = sorted.map(g => {
    const isHome = !g.isOwnGoal ? g.team === homeTeam : g.team !== homeTeam;
    if (isHome) h++; else a++;
    return { ...g, isHome, h, a };
  });

  return { events, maxMinute: MAX_MINUTE };
}

// ── Momentum Timeline component ───────────────────────────────────────────────
type PulseResult = ReturnType<typeof computeMomentumPulse>;

function MomentumTimeline({
  pulse,
  matchStatus,
  currentMinute,
}: {
  pulse: PulseResult;
  matchStatus?: string;
  currentMinute?: number;
}) {
  const { events, maxMinute } = pulse;
  const DISPLAY_MAX = Math.max(maxMinute, 90);
  const pct = (m: number) => `${Math.min((m / DISPLAY_MAX) * 100, 100).toFixed(2)}%`;
  const isLive = matchStatus === "LIVE";
  const filledPct = isLive && currentMinute != null
    ? `${Math.min((currentMinute / DISPLAY_MAX) * 100, 100).toFixed(2)}%`
    : "100%";

  const timeMarkers = [0, 15, 30, 45, 60, 75, 90];

  return (
    <div className="space-y-1">
      {/* Home goals — above the bar */}
      <div className="relative h-7">
        {events.filter(e => e.isHome).map((e, i) => (
          <div
            key={i}
            className="absolute bottom-0 -translate-x-1/2 flex flex-col items-center"
            style={{ left: pct(e.minute) }}
          >
            <span className="text-[9px] font-black text-brand-green tabular-nums whitespace-nowrap">
              {e.h}–{e.a}
            </span>
            <span className="text-[10px] leading-none">⚽</span>
          </div>
        ))}
      </div>

      {/* Timeline bar */}
      <div className="relative h-2">
        {/* Track */}
        <div className="absolute inset-0 bg-slate-800 rounded-full" />
        {/* Filled portion */}
        <div
          className="absolute top-0 left-0 h-full bg-slate-600 rounded-full transition-all duration-500"
          style={{ width: filledPct }}
        />
        {/* HT marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-px h-3.5 bg-slate-500"
          style={{ left: pct(45) }}
        />
        {/* Goal dots on bar */}
        {events.map((e, i) => (
          <div
            key={i}
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-brand-dark ${
              e.isHome ? "bg-brand-green" : "bg-amber-400"
            }`}
            style={{ left: pct(e.minute) }}
          />
        ))}
        {/* Live "now" pulsing indicator */}
        {isLive && currentMinute != null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
            style={{ left: filledPct }}
          >
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          </div>
        )}
      </div>

      {/* Away goals — below the bar */}
      <div className="relative h-7">
        {events.filter(e => !e.isHome).map((e, i) => (
          <div
            key={i}
            className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
            style={{ left: pct(e.minute) }}
          >
            <span className="text-[10px] leading-none">⚽</span>
            <span className="text-[9px] font-black text-amber-400 tabular-nums whitespace-nowrap">
              {e.h}–{e.a}
            </span>
          </div>
        ))}
      </div>

      {/* Minute labels */}
      <div className="relative flex justify-between text-[8px] text-slate-700 font-mono px-0">
        {timeMarkers.filter(t => t <= DISPLAY_MAX || t === 0).map(t => (
          <span key={t} style={{ position: "absolute", left: pct(t), transform: "translateX(-50%)" }}>
            {t === 0 ? "0" : `${t}'`}
          </span>
        ))}
        <span style={{ position: "absolute", left: "100%", transform: "translateX(-100%)" }}>
          {DISPLAY_MAX > 90 ? `${DISPLAY_MAX}'` : "90'"}
        </span>
      </div>
      <div className="h-3" />
    </div>
  );
}

// ── Match DNA timeline ────────────────────────────────────────────────────────
function DNATimeline({
  goals, side,
}: {
  goals: GoalEvent[];
  side: "home" | "away";
}) {
  const MAX_MIN = 95;
  const pct = (m: number) => `${Math.min((m / MAX_MIN) * 100, 100).toFixed(1)}%`;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] font-bold text-slate-500 w-6 shrink-0 text-right">
        {side === "home" ? "H" : "A"}
      </span>
      <div className="relative flex-1 h-1 bg-slate-800 rounded-full overflow-visible">
        {/* Half-time marker */}
        <div className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 bg-slate-700" style={{ left: `${(45 / MAX_MIN) * 100}%` }} />
        {/* Goal markers */}
        {goals.map((g, i) => (
          <div
            key={i}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
            style={{ left: pct(g.minute) }}
          >
            <span className="text-[11px] leading-none">{g.isOwnGoal ? "🙈" : "⚽"}</span>
            <span className={`text-[8px] font-mono mt-0.5 whitespace-nowrap ${side === "home" ? "text-brand-green" : "text-amber-400"}`}>
              {g.minute}&apos;{g.minute > 90 ? "+" : ""}
            </span>
          </div>
        ))}
      </div>
      <span className="text-[9px] font-bold text-white tabular-nums shrink-0 w-3 text-center">
        {goals.length}
      </span>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
interface Props {
  goals: GoalEvent[];
  homeTeamName: string;
  awayTeamName: string;
  homeTeamCode: string;
  awayTeamCode?: string;
  matchStatus?: string;
  currentMinute?: number;
  // Real live team stats (api-football /fixtures/statistics). When present the
  // panel moves even at 0-0 — possession, shots, corners drive Live Pressure.
  stats?: { home: TeamLiveStats; away: TeamLiveStats } | null;
}

export default function MatchDNA({ goals, homeTeamName, awayTeamName, homeTeamCode, awayTeamCode, matchStatus, currentMinute, stats }: Props) {
  const homeGoals = goals.filter(g => !g.isOwnGoal ? g.team === homeTeamName : g.team !== homeTeamName);
  const awayGoals = goals.filter(g => !g.isOwnGoal ? g.team !== homeTeamName : g.team === homeTeamName);
  // Clutch Index credits named scorers — reconstructed (pending) goals have no
  // confirmed scorer and must never appear as a player row.
  const ci  = computeClutchIndex(goals.filter(g => !g.pending), homeTeamName);
  const maxCI = Math.max(...ci.map(p => p.ci), 3);
  const sc  = computeStrikeClock(goals);
  const sv  = computeScoreVolatility(goals, homeTeamName);
  const mp  = computeMomentumPulse(goals, homeTeamName, matchStatus, currentMinute);
  const noGoals = goals.length === 0;
  const hasPending = goals.some(g => g.pending);
  const svLabel = noGoals ? "Level" : sv.dramaLabel;
  const svEmoji = noGoals ? "⚖️" : sv.dramaEmoji;

  const isLive = matchStatus === "LIVE" || matchStatus === "HT";
  const pressure = stats ? computeLivePressure(stats.home, stats.away) : null;
  const combinedSOG = stats && (stats.home.shotsOn !== null || stats.away.shotsOn !== null)
    ? (stats.home.shotsOn ?? 0) + (stats.away.shotsOn ?? 0)
    : null;
  const combinedShots = stats && (stats.home.totalShots !== null || stats.away.totalShots !== null)
    ? (stats.home.totalShots ?? 0) + (stats.away.totalShots ?? 0)
    : null;

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Match DNA™</span>
          <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
        </div>
        <span className="text-[9px] text-slate-700 uppercase tracking-wider">Goal timeline · 0–95&apos;</span>
      </div>

      {/* Reconstructed-timeline disclosure — events feed lagging the score */}
      {hasPending && (
        <div className="px-4 py-1.5 bg-amber-500/5 border-b border-amber-500/10 text-[9px] text-amber-500/80">
          ⏳ Goal times approximate — timeline reconstructed from the scoreline while the events feed catches up. Scorers to be confirmed.
        </div>
      )}

      <div className="px-4 py-4 space-y-4">

        {/* Timeline */}
        <div className="space-y-3">
          <DNATimeline goals={homeGoals} side="home" />
          <div className="flex items-center gap-2">
            <span className="w-6" />
            <div className="flex-1 flex justify-between text-[8px] text-slate-800 font-mono px-0.5">
              <span>0</span><span>15</span><span>30</span><span>45</span><span>60</span><span>75</span><span>90+</span>
            </div>
            <span className="w-3" />
          </div>
          <DNATimeline goals={awayGoals} side="away" />
        </div>

        {/* Momentum Pulse™ */}
        <div className="border-t border-brand-border/50 pt-3">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Momentum Pulse™</span>
            <span className="text-[8px] text-slate-600">{stats ? "Goals + live pressure" : "Live goal timeline"}</span>
          </div>
          <MomentumTimeline pulse={mp} matchStatus={matchStatus} currentMinute={currentMinute} />

          {/* Live Pressure — real team stats, moves every refresh even at 0-0 */}
          {stats && pressure !== null && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-bold">
                <span className="text-brand-green">{homeTeamCode} {pressure}%</span>
                <span className="text-[8px] text-slate-600 uppercase tracking-wider">Live pressure</span>
                <span className="text-amber-400">{100 - pressure}% {awayTeamCode ?? ""}</span>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden bg-slate-800">
                <div className="bg-brand-green/80 transition-all duration-700" style={{ width: `${pressure}%` }} />
                <div className="bg-amber-500/80 transition-all duration-700" style={{ width: `${100 - pressure}%` }} />
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                <StatDuel label="Possession" home={stats.home.possession} away={stats.away.possession} suffix="%" />
                <StatDuel label="Shots" home={stats.home.totalShots} away={stats.away.totalShots} />
                <StatDuel label="On Target" home={stats.home.shotsOn} away={stats.away.shotsOn} />
                <StatDuel label="Corners" home={stats.home.corners} away={stats.away.corners} />
                <StatDuel label="Passes" home={stats.home.passes} away={stats.away.passes} />
                <StatDuel label="xG" home={stats.home.xg} away={stats.away.xg} />
              </div>
              <div className="text-[8px] text-slate-700">
                Pressure = possession · shots · on-target · corners, weighted — live team stats via api-football
              </div>
            </div>
          )}
        </div>

        {/* Strike Clock™ */}
        <div className="border-t border-brand-border/50 pt-3">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Strike Clock™</span>
            <span className="text-[8px] text-slate-600">Goal timing patterns</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-900/60 rounded-xl p-2.5 text-center">
              <div className="text-xl font-black text-white tabular-nums leading-none">{sc ? `${sc.first}'` : "—"}</div>
              <div className="text-[8px] text-slate-500 uppercase tracking-wider mt-1">First Strike</div>
            </div>
            <div className="bg-slate-900/60 rounded-xl p-2.5 text-center">
              <div className="text-xl font-black text-white tabular-nums leading-none">
                {sc ? (sc.avgGap !== null ? `${sc.avgGap}m` : `${sc.total}G`) : combinedShots !== null ? combinedShots : "—"}
              </div>
              <div className="text-[8px] text-slate-500 uppercase tracking-wider mt-1">
                {sc ? (sc.avgGap !== null ? "Avg Gap" : "Goals") : combinedShots !== null ? "Total Shots" : "Goals"}
              </div>
            </div>
            <div className="bg-slate-900/60 rounded-xl p-2.5 text-center">
              <div className="text-xl leading-none">
                {sc ? sc.rhythmEmoji : combinedSOG !== null ? (combinedSOG >= 5 ? "🧨" : "🔒") : "⏱"}
              </div>
              <div className="text-[8px] text-slate-500 uppercase tracking-wider mt-1">
                {sc ? sc.rhythm : combinedSOG !== null ? (combinedSOG >= 5 ? "Brewing" : "Cagey") : "Awaiting"}
              </div>
            </div>
          </div>
        </div>

        {/* Score Volatility™ */}
        <div className="border-t border-brand-border/50 pt-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Score Volatility™</span>
            <span className="text-[8px] text-slate-600">{svEmoji} {svLabel}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between bg-slate-900/40 rounded-lg px-3 py-2">
              <span className="text-[10px] text-slate-400">Lead changes</span>
              <span className="text-sm font-black text-white tabular-nums">{sv.leadChanges}</span>
            </div>
            <div className="flex items-center justify-between bg-slate-900/40 rounded-lg px-3 py-2">
              <span className="text-[10px] text-slate-400">Equalisers</span>
              <span className="text-sm font-black text-white tabular-nums">{sv.equalisers}</span>
            </div>
          </div>
          {noGoals && isLive && combinedSOG !== null && (
            <div className="mt-2 text-[10px] text-slate-500">
              Scoreboard level — but {combinedSOG} shot{combinedSOG === 1 ? "" : "s"} on target say the breakthrough is coming.
            </div>
          )}
        </div>

        {/* Clutch Index™ */}
        <div className="border-t border-brand-border/50 pt-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Clutch Index™</span>
            <span className="text-[8px] text-slate-600">Lead-change weight × late-goal bonus</span>
          </div>
          {ci.length > 0 ? (
            <div className="space-y-1.5">
              {ci.map(p => (
                <div key={p.name} className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 w-24 truncate">
                    {p.name.split(" ").map((w, i) => i === 0 ? w[0] + "." : w).join(" ")}
                  </span>
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-brand-gold to-amber-300 rounded-full transition-all"
                      style={{ width: `${(p.ci / maxCI) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-black text-brand-gold tabular-nums w-6 text-right">{p.ci}</span>
                  <span className="text-[8px] text-slate-700 w-8 shrink-0">{p.goals}G</span>
                </div>
              ))}
            </div>
          ) : hasPending ? (
            <div className="text-[10px] text-slate-600 italic py-1">Scorer confirmation pending — Clutch Index resumes once the events feed names the scorer.</div>
          ) : isLive && combinedSOG !== null ? (
            <div className="text-[10px] text-slate-600 italic py-1">
              Awaiting first goal — {combinedSOG} shot{combinedSOG === 1 ? "" : "s"} on target so far. Someone is warming up.
            </div>
          ) : (
            <div className="text-[10px] text-slate-600 italic py-1">Awaiting first goal…</div>
          )}
        </div>

      </div>
    </div>
  );
}
