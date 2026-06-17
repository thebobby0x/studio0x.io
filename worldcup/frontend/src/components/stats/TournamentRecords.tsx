import { GET } from "@/app/api/tournament/records/route";
import type { TournamentRecords, TopScorerEntry, TopAssisterEntry } from "@/app/api/tournament/records/route";
import { getFlag } from "@/lib/flags";

async function fetchRecords(): Promise<TournamentRecords> {
  try {
    const res = await GET();
    return res.json() as Promise<TournamentRecords>;
  } catch {
    return {
      topScorers: [],
      topAssisters: [],
      totalGoals: 0,
      totalMatches: 0,
      avgGoalsPerMatch: "0.00",
    };
  }
}

function ScorerRow({
  entry,
  rank,
  maxGoals,
  kind,
}: {
  entry: TopScorerEntry | TopAssisterEntry;
  rank: number;
  maxGoals: number;
  kind: "scorer" | "assister";
}) {
  const primary = kind === "scorer"
    ? (entry as TopScorerEntry).goals
    : (entry as TopAssisterEntry).assists;
  const secondary = kind === "scorer"
    ? (entry as TopScorerEntry).assists
    : (entry as TopAssisterEntry).goals;
  const secondaryLabel = kind === "scorer" ? "ast" : "gls";
  const barColor = kind === "scorer"
    ? "from-brand-gold to-amber-300"
    : "from-brand-green to-emerald-300";
  const primaryColor = kind === "scorer" ? "text-brand-gold" : "text-brand-green";

  const flag = getFlag(entry.tla || undefined);
  const barWidth = maxGoals > 0 ? Math.round((primary / maxGoals) * 100) : 0;

  // Shorten name: "Lionel Messi" → "L. Messi"
  const shortName = entry.name
    .split(" ")
    .map((w, i) => (i === 0 ? w[0] + "." : w))
    .join(" ");

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <span className="text-[10px] text-slate-600 w-4 text-right font-mono tabular-nums shrink-0">
        {rank}
      </span>
      <span className="text-base leading-none shrink-0">{flag}</span>
      <span className="text-xs font-semibold text-slate-200 w-24 truncate shrink-0">
        {shortName}
      </span>
      <span className="text-[9px] text-slate-600 font-mono w-7 text-center shrink-0 hidden sm:inline">
        {entry.tla || entry.team.slice(0, 3).toUpperCase()}
      </span>
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden min-w-0">
        <div
          className={`h-full bg-gradient-to-r ${barColor} rounded-full`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <span className={`text-sm font-black tabular-nums w-5 text-right shrink-0 ${primaryColor}`}>
        {primary}
      </span>
      <span className="text-[9px] text-slate-600 tabular-nums w-10 text-right shrink-0 hidden sm:inline">
        {secondary} {secondaryLabel}
      </span>
    </div>
  );
}

export default async function TournamentRecords() {
  const data = await fetchRecords();

  const hasData =
    data.totalMatches > 0 ||
    data.topScorers.length > 0 ||
    data.topAssisters.length > 0;

  if (!hasData) return null;

  const topScorers = data.topScorers.slice(0, 5);
  const topAssisters = data.topAssisters.slice(0, 5);
  const maxGoals = topScorers[0]?.goals ?? 1;
  const maxAssists = topAssisters[0]?.assists ?? 1;

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden mt-6">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">
            Tournament Records™
          </span>
          <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
        </div>
        <span className="text-[9px] text-slate-700 uppercase tracking-wider">
          Live · api-football + DB
        </span>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-3 divide-x divide-brand-border/50 border-b border-brand-border">
        <div className="flex flex-col items-center py-4 gap-0.5">
          <span className="text-2xl font-black text-white tabular-nums">
            {data.totalGoals}
          </span>
          <span className="text-[9px] text-slate-600 uppercase tracking-wider">
            Total Goals
          </span>
        </div>
        <div className="flex flex-col items-center py-4 gap-0.5">
          <span className="text-2xl font-black text-white tabular-nums">
            {data.totalMatches}
          </span>
          <span className="text-[9px] text-slate-600 uppercase tracking-wider">
            Matches Played
          </span>
        </div>
        <div className="flex flex-col items-center py-4 gap-0.5">
          <span className="text-2xl font-black text-brand-green tabular-nums">
            {data.avgGoalsPerMatch}
          </span>
          <span className="text-[9px] text-slate-600 uppercase tracking-wider">
            Avg Goals/Match
          </span>
        </div>
      </div>

      {/* Golden Boot Race */}
      {topScorers.length > 0 && (
        <>
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">
              Golden Boot Race
            </span>
            <span className="text-[9px] text-slate-700">Top 5 scorers</span>
          </div>
          <div className="pb-2 divide-y divide-brand-border/20">
            {topScorers.map((entry, i) => (
              <ScorerRow
                key={entry.name}
                entry={entry}
                rank={i + 1}
                maxGoals={maxGoals}
                kind="scorer"
              />
            ))}
          </div>
        </>
      )}

      {/* Top Assisters */}
      {topAssisters.length > 0 && (
        <>
          <div className={`flex items-center gap-2 px-4 pt-3 pb-1 ${topScorers.length > 0 ? "border-t border-brand-border/50" : ""}`}>
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-green">
              Top Assisters
            </span>
            <span className="text-[9px] text-slate-700">Top 5 providers</span>
          </div>
          <div className="pb-2 divide-y divide-brand-border/20">
            {topAssisters.map((entry, i) => (
              <ScorerRow
                key={entry.name}
                entry={entry}
                rank={i + 1}
                maxGoals={maxAssists}
                kind="assister"
              />
            ))}
          </div>
        </>
      )}

      {/* Footer */}
      <div className="px-5 py-2 border-t border-brand-border/30 text-[9px] text-slate-700">
        Goals/assists from api-football · match counts from live DB · revalidates every 5 min
      </div>
    </div>
  );
}
