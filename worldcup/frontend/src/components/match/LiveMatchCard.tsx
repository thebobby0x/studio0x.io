"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Activity, Clock, MapPin, Wifi, Users, Goal, Square, ArrowLeftRight, CircleSlash } from "lucide-react";
import type { LiveData, LiveMetrics } from "@/lib/types";
import type { GoalEvent, MissedPen, VarEvent, CardEvent } from "@/app/api/matches/[id]/goals/route";
import type { TeamLiveStats } from "@/lib/liveStats";
import { getVenueInfo, venueCity } from "@/lib/venues";
import VenueWeather from "@/components/ui/VenueWeather";
import MatchDNA from "@/components/stats/MatchDNA";
import FlagImg from "@/components/ui/FlagImg";
import ShareButton from "@/components/ui/ShareButton";
import { BRAND_NAME } from "@/lib/sportConfig";

// Row order IS the reading order of the HUD panel: attacking output first,
// discipline last. Labels are short because they sit in a mono, tracked-out
// centre column between two values — "Shots On Target" wrapped there.
// Possession is excluded: it gets the oversized headline treatment above.
const METRIC_LABELS: Record<string, string> = {
  shots_on:     "Shots On",
  shots_off:    "Shots Off",
  corners:      "Corners",
  saves:        "Saves",
  fouls:        "Fouls",
  offsides:     "Offsides",
  yellow_cards: "Yellow",
  red_cards:    "Red",
};

/** Metric lookup by string key. null = the feed did not report this stat, which
 *  is DIFFERENT from a reported zero and must not render as one. */
function metricVal(m: LiveMetrics[string] | undefined, key: string): number | null {
  const v = (m as Record<string, number | undefined> | undefined)?.[key];
  return typeof v === "number" ? v : null;
}

// Rehydrate the flattened metrics record into the TeamLiveStats shape that
// MatchDNA's Live Pressure block reads. Missing keys stay null (unreported).
function toTeamLiveStats(m: LiveMetrics[string] | undefined): TeamLiveStats {
  return {
    possession:   m?.possession ?? null,
    totalShots:   m?.total_shots ?? null,
    shotsOn:      m?.shots_on ?? null,
    shotsOff:     m?.shots_off ?? null,
    blockedShots: m?.blocked_shots ?? null,
    corners:      m?.corners ?? null,
    fouls:        m?.fouls ?? null,
    offsides:     m?.offsides ?? null,
    yellowCards:  m?.yellow_cards ?? null,
    redCards:     m?.red_cards ?? null,
    saves:        m?.saves ?? null,
    passes:       m?.passes ?? null,
    passAccuracy: m?.pass_accuracy ?? null,
    xg:           m?.xg ?? null,
  };
}

function GoalDisplay({ goals, missedPens = [], varEvents = [], cards = [], homeTeam, awayTeam }: {
  goals: GoalEvent[];
  missedPens?: MissedPen[];
  varEvents?: VarEvent[];
  cards?: CardEvent[];
  homeTeam: string;
  awayTeam: string;
}) {
  if (goals.length === 0 && missedPens.length === 0 && varEvents.length === 0 && cards.length === 0) return null;

  // Honest VAR-delay note: the gap between a VAR decision and a penalty being
  // struck, in MATCH MINUTES (api-football has no wall-clock review duration).
  const penMoments = [
    ...goals.filter((g) => g.isPenalty).map((g) => ({ minute: g.minute, team: g.team, outcome: "scored" as const })),
    ...missedPens.map((p) => ({ minute: p.minute, team: p.team, outcome: "missed" as const })),
  ];
  const varDelayNotes = varEvents
    .filter((v) => /penalty/i.test(v.detail))
    .map((v) => {
      const pen = penMoments.find((pm) => pm.minute >= v.minute && pm.minute - v.minute <= 6);
      if (!pen) return null;
      // Prefer REAL wall-clock delta when we captured both events live
      // (studio0x first-seen timestamps); fall back to match-minute gap.
      let capturedSecs: number | null = null;
      const penTs = missedPens.find((mp) => mp.minute === pen.minute)?.firstSeenAt;
      if (v.firstSeenAt && penTs) {
        const d = Math.round((new Date(penTs).getTime() - new Date(v.firstSeenAt).getTime()) / 1000);
        if (d > 0 && d < 15 * 60) capturedSecs = d;
      }
      return { gap: pen.minute - v.minute, outcome: pen.outcome, minute: v.minute, capturedSecs };
    })
    .filter(Boolean) as { gap: number; outcome: "scored" | "missed"; minute: number; capturedSecs: number | null }[];

  const homeGoals = goals.filter((g) => !g.isOwnGoal ? g.team === homeTeam : g.team !== homeTeam);
  const awayGoals = goals.filter((g) => !g.isOwnGoal ? g.team === awayTeam : g.team !== awayTeam);

  /** Scorer line for a moment card. Reconstructed goals have no confirmed
   *  scorer — a name is never invented, the card says so instead. */
  function goalName(g: GoalEvent): string {
    if (g.pending) return "Scorer TBC";
    return g.isOwnGoal ? `${g.scorer} (OG)` : g.scorer;
  }

  function goalNote(g: GoalEvent): string | null {
    if (g.pending) return "unconfirmed";
    if (g.isPenalty) return "penalty";
    if (g.isOwnGoal) return "own goal";
    return null;
  }

  // Missed penalties are KEY MOMENTS, not goals — shown muted with an ✗ so a
  // saved/skied PK never reads as a score (Mbappé, FRA-MAR QF).
  const homePens = missedPens.filter((p) => p.team === homeTeam);
  const awayPens = missedPens.filter((p) => p.team === awayTeam);
  const homeCards = cards.filter((c) => c.team === homeTeam);
  const awayCards = cards.filter((c) => c.team === awayTeam);

  return (
    <div className="px-4 pb-3 space-y-1.5">
      {/* VAR moments — real events from the feed */}
      {varEvents.length > 0 && (
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-0.5 text-[10px] text-slate-500">
          {varEvents.map((v, i) => (
            <span key={i}>📺 VAR {v.minute}&apos; · {v.detail} ({v.team})</span>
          ))}
          {varDelayNotes.map((n, i) => (
            <span key={`d${i}`} className="text-slate-600">
              ⏱ {n.capturedSecs
                ? `≈${Math.floor(n.capturedSecs / 60)}m ${n.capturedSecs % 60}s whistle to kick (studio0x live capture)`
                : `${n.gap <= 1 ? "under a minute" : `~${n.gap} match min`} from VAR call to the kick`} — {n.outcome}
            </span>
          ))}
        </div>
      )}
      {/* Moment cards — one per event, neon left edge, mono minute, Archivo
          name. Home column mirrors right-to-left so the two sides read inward
          toward the scoreline. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <div className="flex flex-col gap-1.5">
          {homeGoals.map((g, i) => (
            <MomentCard key={`hg${i}`} kind="goal" minute={g.minute} approx={g.pending}
              name={goalName(g)} note={goalNote(g)} align="right" />
          ))}
          {homePens.map((p, i) => (
            <MomentCard key={`hp${i}`} kind="miss" minute={p.minute}
              name={p.player} note="penalty missed" align="right" />
          ))}
          {homeCards.map((c, i) => (
            <MomentCard key={`hc${i}`} kind="card" minute={c.minute}
              name={c.player} note={c.detail.toLowerCase()} align="right" />
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          {awayGoals.map((g, i) => (
            <MomentCard key={`ag${i}`} kind="goal" minute={g.minute} approx={g.pending}
              name={goalName(g)} note={goalNote(g)} align="left" />
          ))}
          {awayPens.map((p, i) => (
            <MomentCard key={`ap${i}`} kind="miss" minute={p.minute}
              name={p.player} note="penalty missed" align="left" />
          ))}
          {awayCards.map((c, i) => (
            <MomentCard key={`ac${i}`} kind="card" minute={c.minute}
              name={c.player} note={c.detail.toLowerCase()} align="left" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * A single match moment as a Gaming-UI card.
 *
 * Accent encodes the event TYPE, not the team: Rosa for goals and cards (the
 * decisive, "hot" events), Riptide for substitutions and everything procedural.
 * A missed penalty is deliberately muted — it is a key moment, but it must
 * never read like a goal (the Mbappé FRA-MAR near-miss that prompted the rule).
 */
function MomentCard({ kind, minute, name, note, align, approx }: {
  kind: "goal" | "card" | "sub" | "miss";
  minute: number;
  name: string;
  note?: string | null;
  align: "left" | "right";
  approx?: boolean;
}) {
  const Icon = kind === "goal" ? Goal : kind === "card" ? Square : kind === "sub" ? ArrowLeftRight : CircleSlash;
  const teal = kind === "sub";
  const muted = kind === "miss";
  return (
    <div
      className={`s0x-moment ${teal ? "s0x-moment-teal" : ""} ${muted ? "opacity-60" : ""} ${
        align === "right" ? "s0x-moment-mirror flex-row-reverse text-right" : ""
      }`}
    >
      <Icon
        size={13}
        className={`s0x-moment-icon shrink-0 ${teal ? "text-s0x-teal" : muted ? "text-s0x-muted" : "text-s0x-accent"}`}
      />
      <div className="min-w-0 flex-1">
        <div className="s0x-display text-[12px] font-bold text-s0x-text leading-tight truncate">{name}</div>
        {note && <div className="s0x-mono text-[8px] text-s0x-muted mt-0.5">{note}</div>}
      </div>
      <span className="s0x-data text-[11px] font-bold tabular-nums text-s0x-muted shrink-0">
        {approx ? "~" : ""}{minute}&apos;
      </span>
    </div>
  );
}

/**
 * One live stat as a HUD row: left value | label | right value, with the
 * proportional Riptide/Rosa split underneath.
 *
 * `unit` renders a suffix (possession is a percentage, everything else a count).
 * When BOTH sides report zero the bar is drawn as an even, dimmed split rather
 * than an arbitrary 50/50 fill — 0–0 corners is not "honours even", it's "no
 * data yet", and the old version made those look identical.
 */
function StatRow({ label, homeVal, awayVal, unit = "" }: {
  label: string;
  homeVal: number;
  awayVal: number;
  unit?: string;
}) {
  const total = homeVal + awayVal;
  const homeW = total > 0 ? Math.round((homeVal / total) * 100) : 50;
  const leading = homeVal === awayVal ? null : homeVal > awayVal ? "home" : "away";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className={`s0x-data text-sm font-bold tabular-nums ${leading === "home" ? "text-s0x-teal" : "text-s0x-text"}`}>
          {homeVal}{unit}
        </span>
        <span className="s0x-mono text-[9px] text-s0x-muted text-center flex-1">{label}</span>
        <span className={`s0x-data text-sm font-bold tabular-nums ${leading === "away" ? "text-s0x-accent" : "text-s0x-text"}`}>
          {awayVal}{unit}
        </span>
      </div>
      <div className="s0x-versus" role="img" aria-label={`${label}: ${homeVal}${unit} to ${awayVal}${unit}`}>
        <span className="s0x-versus-home" style={{ width: `${homeW}%`, opacity: total > 0 ? 1 : 0.25 }} />
        <span className="s0x-versus-away" style={{ width: `${100 - homeW}%`, opacity: total > 0 ? 1 : 0.25 }} />
      </div>
    </div>
  );
}

/**
 * Possession — the headline split, given its own oversized treatment: big
 * mono percentages flanking a thick Riptide-vs-Rosa bar.
 *
 * Possession is already a percentage per side and the two SHOULD sum to 100,
 * but the feed occasionally reports one side only. Normalising against the
 * actual total keeps the bar honest instead of overflowing its track.
 */
function PossessionBar({ homeCode, awayCode, home, away }: {
  homeCode: string;
  awayCode: string;
  home: number;
  away: number;
}) {
  const total = home + away;
  const homeW = total > 0 ? (home / total) * 100 : 50;
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div className="text-left">
          <div className="s0x-data text-2xl font-bold tabular-nums text-s0x-teal s0x-neon-teal leading-none">
            {Math.round(home)}<span className="text-base">%</span>
          </div>
          <div className="s0x-mono text-[9px] text-s0x-muted mt-1">{homeCode}</div>
        </div>
        <div className="s0x-mono text-[9px] text-s0x-muted pb-1">Possession</div>
        <div className="text-right">
          <div className="s0x-data text-2xl font-bold tabular-nums text-s0x-accent leading-none">
            {Math.round(away)}<span className="text-base">%</span>
          </div>
          <div className="s0x-mono text-[9px] text-s0x-muted mt-1">{awayCode}</div>
        </div>
      </div>
      <div className="s0x-versus" style={{ height: 10 }} role="img" aria-label={`Possession: ${Math.round(home)}% ${homeCode}, ${Math.round(away)}% ${awayCode}`}>
        <span className="s0x-versus-home" style={{ width: `${homeW}%` }} />
        <span className="s0x-versus-away" style={{ width: `${100 - homeW}%` }} />
      </div>
    </div>
  );
}

export default function LiveMatchCard({ matchId, hero }: { matchId: string; hero?: boolean }) {
  const [data, setData] = useState<LiveData | null>(null);
  const [goals, setGoals] = useState<GoalEvent[] | null>(null);
  const [missedPens, setMissedPens] = useState<MissedPen[]>([]);
  const [varEvents, setVarEvents] = useState<VarEvent[]>([]);
  const [cards, setCards] = useState<CardEvent[]>([]);
  // "missing" = the route says this match does not exist (404) — permanent, so
  // stop polling. "transient" = anything else; keep polling, because a 5s loop
  // will very likely fix itself.
  const [fault, setFault] = useState<"missing" | "transient" | null>(null);

  const load = useCallback(async () => {
    try {
      const [liveRes, goalsRes] = await Promise.all([
        fetch(`/api/matches/${matchId}/live`),
        fetch(`/api/matches/${matchId}/goals`),
      ]);
      if (!liveRes.ok) {
        // Log the real status and body — the old code threw a bare
        // `new Error("API error")` and rendered `String(e)`, which is how the
        // dashboard came to display the literal string "Error: Error: API
        // error" with nothing in it to debug from.
        const body = await liveRes.text().catch(() => "");
        console.error(
          `[LiveMatchCard] /api/matches/${matchId}/live → ${liveRes.status}`,
          body.slice(0, 300),
        );
        setFault(liveRes.status === 404 ? "missing" : "transient");
        return;
      }
      const [liveData, goalsData] = await Promise.all([
        liveRes.json(),
        goalsRes.ok ? goalsRes.json() : Promise.resolve({ goals: [] }),
      ]);
      setData(liveData);
      setGoals(goalsData.goals ?? []);
      setMissedPens(goalsData.missedPens ?? []);
      setVarEvents(goalsData.varEvents ?? []);
      setCards(goalsData.cards ?? []);
      // Recovered. The old code never cleared the error, so a single blip in a
      // 5s poll left the tile broken until a full page reload.
      setFault(null);
    } catch (e) {
      console.error(`[LiveMatchCard] fetch failed for ${matchId}`, e);
      setFault("transient");
    }
  }, [matchId]);

  useEffect(() => {
    load();
    // A match the API doesn't have will never appear by polling — stop asking.
    if (fault === "missing") return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load, fault]);

  // A live tile that can't reach its data is a degraded state, not a crash: it
  // renders calm, on-palette copy and (when transient) keeps retrying behind it.
  // Raw error strings never reach the dashboard.
  if (fault && !data) {
    return (
      <div className="s0x-card s0x-hud-grid p-6 text-center">
        <span className="s0x-scanline" aria-hidden="true" />
        <Activity size={18} className="mx-auto mb-2 text-s0x-muted" />
        <p className="s0x-mono text-[11px] text-s0x-muted">
          {fault === "missing" ? "Match data unavailable" : "Live data temporarily unavailable"}
        </p>
        <p className="text-[11px] text-s0x-muted/70 mt-1">
          {fault === "missing"
            ? "This fixture isn't in the database yet — run Sync Fixtures."
            : "Reconnecting…"}
        </p>
      </div>
    );
  }
  if (!data) return <div className="rounded-xl bg-brand-card border border-brand-border p-6 animate-pulse h-64" />;

  const { match, metrics, dataSources } = data;
  const homeCode = match.homeTeam.code;
  const awayCode = match.awayTeam.code;
  // Club crest (club deployments) — FlagImg falls back to a flag on nation ones.
  const homeCrest = { logoUrl: match.homeTeam.logoUrl, afId: match.homeTeam.afTeamId };
  const awayCrest = { logoUrl: match.awayTeam.logoUrl, afId: match.awayTeam.afTeamId };
  const hm = metrics[homeCode] ?? {};
  const am = metrics[awayCode] ?? {};
  const isLive = match.status === "LIVE" || match.status === "HT";
  const isDone = match.status === "FT";
  const showGoals = (isLive || isDone) && goals && goals.length > 0;
  const hasMoments = showGoals || missedPens.length > 0 || varEvents.length > 0 || cards.length > 0;
  // Real team stats only — never feed simulated numbers into metric panels
  const statsReal = dataSources?.stats === "api-football" && Object.keys(hm).length > 0;
  const dnaStats = statsReal ? { home: toTeamLiveStats(hm), away: toTeamLiveStats(am) } : null;

  const city = venueCity(match.venue, match.city);
  const venueInfo = getVenueInfo(match.venue);
  const capacityStr = venueInfo ? venueInfo.capacity.toLocaleString() : null;

  if (hero && isLive) {
    return (
      <div className="s0x-hud-grid s0x-hud-scan rounded-s0x overflow-hidden border border-s0x-ink/50" style={{
        // Noir 900/800 body with a Rosa 700 (live) + Riptide (data) halo.
        background: "linear-gradient(135deg, #1D191C 0%, #0F0C0E 45%, #161014 100%)",
        boxShadow: "0 0 60px rgba(202,53,139,0.16), 0 0 120px rgba(93,203,209,0.06)",
      }}>
        <span className="s0x-scanline" aria-hidden="true" />
        {/* LIVE banner */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 font-black text-sm tracking-widest uppercase">Live</span>
            <span className="text-red-300/60 font-black text-sm tabular-nums">{match.elapsed}&apos;</span>
            {match.status === "HT" && <span className="text-amber-400 text-xs font-bold ml-1">· Half Time</span>}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <MapPin size={11} />
            <span>{match.venue !== "World Cup Stadium" ? city || match.venue : "Live"}</span>
            {capacityStr && match.venue !== "World Cup Stadium" && (
              <span className="hidden sm:inline">· cap. {capacityStr}</span>
            )}
            {venueInfo && (
              <VenueWeather lat={venueInfo.lat} lng={venueInfo.lng} timezone={venueInfo.timezone} />
            )}
            <ShareButton
              text={`LIVE: ${match.homeTeam.name} ${match.homeScore}–${match.awayScore} ${match.awayTeam.name} (${match.status === "HT" ? "HT" : `${match.elapsed}'`}) · ${BRAND_NAME} · studio0x.io`}
              url={`/schedule/${match.fixture}`}
              title={`${match.homeTeam.name} vs ${match.awayTeam.name}`}
            />
          </div>
        </div>

        {/* Big scoreboard */}
        <div className="px-4 py-6">
          <div className="grid grid-cols-3 items-center gap-2">
            <Link href={`/team/${homeCode}`} className="text-center group">
              <div className="flex justify-center mb-3"><FlagImg tla={homeCode} {...homeCrest} size={72} className="shadow-lg" /></div>
              <div className="font-black text-lg sm:text-xl text-white group-hover:text-brand-gold transition-colors leading-tight">{match.homeTeam.name}</div>
              <div className="text-xs text-slate-600 uppercase tracking-wider mt-0.5">{homeCode}</div>
            </Link>

            <div className="text-center">
              {/* whitespace-nowrap + tabular-nums: at text-7xl in a 3-column grid
                  on a phone this column is narrower than "0 – 0" renders, so the
                  scoreline wrapped and the two goal totals stacked vertically
                  with the dash between them. It must always read as one line. */}
              <div className="s0x-data text-6xl sm:text-8xl font-bold leading-none text-s0x-text whitespace-nowrap tabular-nums" style={{ textShadow: "0 0 12px rgb(248 189 216 / .55), 0 0 46px rgb(202 53 139 / .45)" }}>
                {match.homeScore}
                <span className="text-slate-700 mx-0.5 sm:mx-1">–</span>
                {match.awayScore}
              </div>
              <div className="mt-3 flex items-center justify-center gap-1.5">
                {/* Honest badge: "sim" means the live feed is unreachable and the
                    score is the last DB state — never claim it's updating. */}
                {dataSources?.match !== "sim" ? (
                  <>
                    <Wifi size={11} className="text-brand-green" />
                    <span className="text-[11px] text-brand-green font-semibold">Updating live</span>
                  </>
                ) : (
                  <>
                    <Wifi size={11} className="text-amber-500" />
                    <span className="text-[11px] text-amber-500 font-semibold">Reconnecting — score may lag</span>
                  </>
                )}
              </div>
            </div>

            <Link href={`/team/${awayCode}`} className="text-center group">
              <div className="flex justify-center mb-3"><FlagImg tla={awayCode} {...awayCrest} size={72} className="shadow-lg" /></div>
              <div className="font-black text-lg sm:text-xl text-white group-hover:text-brand-gold transition-colors leading-tight">{match.awayTeam.name}</div>
              <div className="text-xs text-slate-600 uppercase tracking-wider mt-0.5">{awayCode}</div>
            </Link>
          </div>
        </div>

        {/* Goal scorers */}
        {hasMoments && goals && (
          <GoalDisplay
            goals={goals}
            missedPens={missedPens}
            varEvents={varEvents}
            cards={cards}
            homeTeam={match.homeTeam.name}
            awayTeam={match.awayTeam.name}
          />
        )}

        {/* Match DNA™ */}
        {(isLive || isDone) && goals && (
          <div className="px-4 pb-4">
            <MatchDNA
              goals={goals}
              homeTeamName={match.homeTeam.name}
              awayTeamName={match.awayTeam.name}
              homeTeamCode={homeCode}
              awayTeamCode={awayCode}
              matchStatus={match.status}
              currentMinute={match.elapsed}
              stats={dnaStats}
            />
          </div>
        )}

        {/* Live Stats — HUD panel: circuit corners, scan-line wash, possession
            headline, then the proportional Riptide-vs-Rosa stat rows. */}
        {dataSources?.stats !== "sim" && Object.keys(hm).length > 0 && (
          <div className="px-4 pb-5 pt-2">
            <div className="s0x-circuit s0x-hud-grid s0x-hud-scan rounded-s0x border border-s0x-border bg-s0x-surface/60 p-4 sm:p-5 space-y-4">
              <span className="s0x-scanline" aria-hidden="true" />

              <div className="relative flex items-center gap-2">
                <Activity size={11} className="text-s0x-teal" />
                <span className="s0x-eyebrow">Live Stats</span>
                <div className="s0x-mono ml-auto flex items-center gap-1.5 text-[9px]">
                  <span className="w-2 h-2 rounded-sm bg-s0x-teal" />
                  <span className="text-s0x-muted mr-2">{homeCode}</span>
                  <span className="w-2 h-2 rounded-sm bg-s0x-accent-ink" />
                  <span className="text-s0x-muted">{awayCode}</span>
                </div>
              </div>

              {(hm.possession != null || am.possession != null) && (
                <div className="relative">
                  <PossessionBar
                    homeCode={homeCode}
                    awayCode={awayCode}
                    home={Number(hm.possession ?? 0)}
                    away={Number(am.possession ?? 0)}
                  />
                </div>
              )}

              <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
                {Object.entries(METRIC_LABELS)
                  // Only rows the feed actually reported. Rendering a hardcoded
                  // list meant unreported stats (saves and offsides are often
                  // absent pre-FT) drew as a confident, wrong 0–0.
                  .filter(([key]) => metricVal(hm, key) != null || metricVal(am, key) != null)
                  .map(([key, label]) => (
                    <StatRow
                      key={key}
                      label={label}
                      homeVal={metricVal(hm, key) ?? 0}
                      awayVal={metricVal(am, key) ?? 0}
                    />
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-green/20 via-transparent to-amber-500/20 p-4 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <MapPin size={14} />
            {match.venue && match.venue !== "World Cup Stadium" ? (
              <span>{match.venue}{city ? `, ${city}` : ""}</span>
            ) : (
              <span className="text-slate-600">Venue TBD</span>
            )}
          </div>
          {capacityStr && match.venue !== "World Cup Stadium" && (
            <div className="flex items-center gap-1.5 text-[10px] text-slate-600 ml-5">
              <Users size={10} />
              <span>Capacity {capacityStr}</span>
            </div>
          )}
          {venueInfo && (
            <div className="ml-5">
              <VenueWeather lat={venueInfo.lat} lng={venueInfo.lng} timezone={venueInfo.timezone} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLive && <span className="w-2 h-2 rounded-full bg-red-500 live-dot" />}
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isLive ? "bg-red-500/20 text-red-400" : isDone ? "bg-slate-700 text-slate-400" : "bg-slate-700 text-slate-300"}`}>
            {match.status === "LIVE" ? `${match.elapsed}'` : match.status}
          </span>
          {isLive ? (
            <span className="flex items-center gap-1 text-[10px] text-brand-green font-semibold">
              <Wifi size={10} /> LIVE
            </span>
          ) : isDone ? (
            <span className="text-[10px] text-slate-500 font-semibold">Latest</span>
          ) : (
            <span className="text-[10px] text-amber-500 font-semibold">Upcoming</span>
          )}
        </div>
      </div>

      {/* Scoreboard */}
      <div className="px-4 py-8">
        <div className="grid grid-cols-3 items-center gap-2">
          {/* Home team */}
          <Link href={`/team/${homeCode}`} className="text-center group block">
            <div className="flex justify-center mb-2"><FlagImg tla={homeCode} {...homeCrest} size={56} className="shadow-md" /></div>
            <div className="font-bold text-base sm:text-lg text-white group-hover:text-brand-gold transition-colors leading-tight">{match.homeTeam.name}</div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">{homeCode}</div>
          </Link>

          {/* Score */}
          <div className="text-center">
            <div className="text-5xl sm:text-6xl font-black text-white tabular-nums tracking-tighter leading-none whitespace-nowrap">
              {match.homeScore}<span className="text-brand-border mx-1 sm:mx-2">–</span>{match.awayScore}
            </div>
            <div suppressHydrationWarning className="flex items-center justify-center gap-1 mt-2 text-xs text-slate-500">
              <Clock size={12} />
              <span>{new Date(match.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            </div>
          </div>

          {/* Away team */}
          <Link href={`/team/${awayCode}`} className="text-center group block">
            <div className="flex justify-center mb-2"><FlagImg tla={awayCode} {...awayCrest} size={56} className="shadow-md" /></div>
            <div className="font-bold text-base sm:text-lg text-white group-hover:text-brand-gold transition-colors leading-tight">{match.awayTeam.name}</div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">{awayCode}</div>
          </Link>
        </div>
      </div>

      {/* Match moments — goals, missed pens, cards, VAR */}
      {hasMoments && goals && (
        <GoalDisplay
          goals={goals}
          missedPens={missedPens}
          varEvents={varEvents}
          cards={cards}
          homeTeam={match.homeTeam.name}
          awayTeam={match.awayTeam.name}
        />
      )}

      {/* Match DNA™ — renders on goals OR live stats, so a 0-0 still moves */}
      {(isLive || isDone) && goals && (goals.length > 0 || (isLive && statsReal)) && (
        <div className="px-4 pb-4">
          <MatchDNA
            goals={goals}
            homeTeamName={match.homeTeam.name}
            awayTeamName={match.awayTeam.name}
            homeTeamCode={homeCode}
            awayTeamCode={awayCode}
            matchStatus={match.status}
            currentMinute={match.elapsed}
            stats={dnaStats}
          />
        </div>
      )}

      {/* Live Stats — same HUD panel as the hero, at card scale. */}
      {dataSources?.stats !== "sim" && Object.keys(hm).length > 0 && (
        <div className="px-4 pb-5">
          <div className="s0x-circuit s0x-hud-grid rounded-s0x border border-s0x-border bg-s0x-surface/60 p-4 space-y-4">
            <div className="relative flex items-center gap-2">
              <Activity size={11} className="text-s0x-teal" />
              <span className="s0x-eyebrow">Live Stats</span>
              <div className="s0x-mono ml-auto flex items-center gap-1.5 text-[9px]">
                <span className="w-2 h-2 rounded-sm bg-s0x-teal" />
                <span className="text-s0x-muted mr-2">{homeCode}</span>
                <span className="w-2 h-2 rounded-sm bg-s0x-accent-ink" />
                <span className="text-s0x-muted">{awayCode}</span>
              </div>
            </div>

            {(hm.possession != null || am.possession != null) && (
              <div className="relative">
                <PossessionBar
                  homeCode={homeCode}
                  awayCode={awayCode}
                  home={Number(hm.possession ?? 0)}
                  away={Number(am.possession ?? 0)}
                />
              </div>
            )}

            <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
              {Object.entries(METRIC_LABELS)
                .filter(([key]) => metricVal(hm, key) != null || metricVal(am, key) != null)
                .map(([key, label]) => (
                  <StatRow
                    key={key}
                    label={label}
                    homeVal={metricVal(hm, key) ?? 0}
                    awayVal={metricVal(am, key) ?? 0}
                  />
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
