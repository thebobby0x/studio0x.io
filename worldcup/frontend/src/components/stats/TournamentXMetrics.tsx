import { prisma } from "@/lib/prisma";

// ── Novel cross-metric formulas ────────────────────────────────────────────────
// Each connects traditionally separate stat categories to derive new insight.

// Impact Per Minute™: attack contribution per 90 mins of play
// Cross-connects: goal events + passing creativity + playing time
function impactPerMinute(goals: number, assists: number, keyPasses: number, minutes: number): number {
  if (minutes < 45) return 0;
  return ((goals * 3 + assists * 2 + keyPasses * 0.5) / minutes) * 90;
}

// Shot Efficiency Index™: goals per shot, weighted by on-target accuracy
// Cross-connects: shooting volume + accuracy + conversion — the finisher's trifecta
function shotEfficiencyIndex(goals: number, shotsTotal: number, shotsOnTarget: number): number {
  if (shotsTotal === 0) return 0;
  const accuracy = shotsOnTarget / shotsTotal;
  const conversion = shotsOnTarget > 0 ? goals / shotsOnTarget : 0;
  return (accuracy * 0.4 + conversion * 0.6) * 100;
}

// Duel Dominance™: physical contest win rate, weighted by volume
// Cross-connects: aerial/ground duel count + win rate — not just % but total impact
function duelDominance(duelsWon: number, duelsTotal: number): number {
  if (duelsTotal < 5) return 0;
  return (duelsWon / duelsTotal) * Math.log(duelsTotal + 1) * 10;
}

// Complete Player Score™: all-round contribution vs disciplinary cost
// Cross-connects 5 traditionally separate categories:
// attack (goals+assists), creativity (keyPasses), defense (tackles+interceptions),
// physical (duelsWon), discipline (fouls+cards) — novel synthesis
function completePlayerScore(
  goals: number, assists: number, keyPasses: number,
  tacklesTotal: number, interceptions: number, duelsWon: number,
  foulsCommitted: number, yellows: number, reds: number,
  minutes: number,
): number {
  if (minutes < 45) return 0;
  const contribution = (goals * 3 + assists * 2 + keyPasses + tacklesTotal + interceptions + duelsWon * 0.5);
  const disciplinaryCost = foulsCommitted + yellows * 2 + reds * 5 + 1;
  return (contribution / disciplinaryCost) * (minutes / 90);
}

// Pressure Resistance™: performance quality under physical challenge
// Cross-connects: match rating (composite quality) × how effectively they draw fouls vs give them
// High score = top-rated + wins more fouls than they commit
function pressureResistance(rating: number, foulsDrawn: number, foulsCommitted: number): number {
  if (rating === 0) return 0;
  const foulBalance = (foulsDrawn + 1) / (foulsCommitted + 1);
  return rating * Math.min(foulBalance, 3);
}

type MetricKey = "ipm" | "sei" | "dd" | "cps" | "pr";

interface PlayerRow {
  id: string;
  name: string;
  position: string;
  club: string;
  flag: string;
  matches: number;
  goals: number;
  assists: number;
  minutesPlayed: number;
  ipm: number;
  sei: number;
  dd: number;
  cps: number;
  pr: number;
}

const METRICS: Record<MetricKey, { label: string; desc: string; unit: string; color: string }> = {
  ipm: { label: "Impact Per Minute™",     desc: "Attack contribution per 90 — goals+assists+key passes weighted by time",          unit: "pts/90", color: "text-amber-400" },
  sei: { label: "Shot Efficiency Index™",  desc: "Goals per shot weighted by on-target accuracy — the clinical finisher metric",    unit: "%",      color: "text-sky-400"  },
  dd:  { label: "Duel Dominance™",         desc: "Physical contest win rate weighted by volume — not just % but total impact",      unit: "score",  color: "text-purple-400" },
  cps: { label: "Complete Player Score™",  desc: "Attack+defense+creativity vs disciplinary cost — 5 categories in one number",    unit: "score",  color: "text-brand-green" },
  pr:  { label: "Pressure Resistance™",    desc: "Match rating × foul balance — performance quality under physical challenge",      unit: "score",  color: "text-rose-400"  },
};

export default async function TournamentXMetrics({ limit = 10, metric = "cps" as MetricKey }: { limit?: number; metric?: MetricKey }) {
  const stats = await prisma.playerTournamentStat.findMany({
    where: { matches: { gt: 0 } },
    include: { player: { include: { team: true } } },
    take: 200,
  }).catch(() => []);

  if (stats.length === 0) return null;

  const rows: PlayerRow[] = stats.map((s) => ({
    id: s.id,
    name: s.player.name,
    position: s.player.position,
    club: s.player.club,
    flag: s.player.team.flagEmoji,
    matches: s.matches,
    goals: s.goals,
    assists: s.assists,
    minutesPlayed: s.minutesPlayed,
    ipm: impactPerMinute(s.goals, s.assists, s.passesKey, s.minutesPlayed),
    sei: shotEfficiencyIndex(s.goals, s.shotsTotal, s.shotsOnTarget),
    dd:  duelDominance(s.duelsWon, s.duelsTotal),
    cps: completePlayerScore(s.goals, s.assists, s.passesKey, s.tacklesTotal, s.interceptions, s.duelsWon, s.foulsCommitted, s.yellowCards, s.redCards, s.minutesPlayed),
    pr:  pressureResistance(s.rating, s.foulsDrawn, s.foulsCommitted),
  }));

  const ranked = [...rows].sort((a, b) => b[metric] - a[metric]).filter((r) => r[metric] > 0).slice(0, limit);
  if (ranked.length === 0) return null;

  const maxVal = Math.max(...ranked.map((r) => r[metric]), 1);
  const m = METRICS[metric];

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      <div className="px-4 py-3 border-b border-brand-border">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-black uppercase tracking-widest ${m.color}`}>{m.label}</span>
              <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
            </div>
            <p className="text-[10px] text-slate-600 mt-0.5 max-w-md">{m.desc}</p>
          </div>
          <span className="text-[9px] text-slate-600 uppercase tracking-wider shrink-0">{m.unit}</span>
        </div>
      </div>

      <div className="divide-y divide-brand-border/40">
        {ranked.map((r, i) => {
          const pct = (r[metric] / maxVal) * 100;
          const val = r[metric];
          const displayVal = val < 10 ? val.toFixed(2) : val.toFixed(1);
          return (
            <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
              <span className="text-[10px] font-mono text-slate-600 w-4 shrink-0 tabular-nums">{i + 1}</span>
              <span className="text-base shrink-0">{r.flag}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-200 truncate">{r.name}</span>
                  <span className="text-[9px] text-slate-700 uppercase tracking-wider shrink-0">{r.position}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {r.club && <span className="text-[9px] text-slate-600 truncate">{r.club}</span>}
                  <span className="text-[9px] text-slate-700">·</span>
                  <span className="text-[9px] text-slate-600">{r.matches}g</span>
                  {r.goals > 0 && <span className="text-[9px] text-slate-500">⚽{r.goals}</span>}
                  {r.assists > 0 && <span className="text-[9px] text-slate-500">🎯{r.assists}</span>}
                </div>
                <div className="mt-1 h-0.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${metric === "ipm" ? "from-amber-500 to-amber-300" : metric === "sei" ? "from-sky-500 to-sky-300" : metric === "dd" ? "from-purple-500 to-purple-300" : metric === "cps" ? "from-emerald-500 to-emerald-300" : "from-rose-500 to-rose-300"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <span className={`font-black tabular-nums text-[11px] w-10 text-right ${m.color}`}>{displayVal}</span>
            </div>
          );
        })}
      </div>

      <div className="border-t border-brand-border/50 px-4 py-1.5 text-[9px] text-slate-700 text-center">
        Requires at least 45 min played · powered by api-football × studio0x
      </div>
    </div>
  );
}
