import { prisma } from "@/lib/prisma";
import { REAL_CLUB_WHERE } from "@/lib/clubData";

interface ClubEntry {
  club: string;
  league: string;
  playerCount: number;
  careerGoals: number;
  score: number; // playerCount*2 + careerGoals*0.5
}

export default async function ClubContributionIndex({ limit = 10 }: { limit?: number }) {
  const players = await prisma.player.findMany({
    where: REAL_CLUB_WHERE, // H-2: real domestic clubs only, not the WC placeholder
    select: { club: true, league: true, goals: true },
  }).catch(() => []);

  if (players.length === 0) {
    return (
      <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Club Contribution Index™</span>
            <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
          </div>
        </div>
        <div className="px-4 py-8 text-center">
          <p className="text-slate-500 text-sm font-semibold">No club data yet</p>
          <p className="text-slate-700 text-xs mt-1">
            Admin: POST <code className="font-mono text-brand-gold text-[10px]">/api/admin/seed-players?mock=true</code>
          </p>
        </div>
      </div>
    );
  }

  // Aggregate by club
  const clubMap = new Map<string, ClubEntry>();
  for (const p of players) {
    if (!p.club) continue;
    const existing = clubMap.get(p.club);
    if (existing) {
      existing.playerCount++;
      existing.careerGoals += p.goals;
    } else {
      clubMap.set(p.club, {
        club: p.club,
        league: p.league,
        playerCount: 1,
        careerGoals: p.goals,
        score: 0,
      });
    }
  }

  const clubs: ClubEntry[] = [...clubMap.values()]
    .map(c => ({ ...c, score: c.playerCount * 2 + c.careerGoals * 0.5 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const maxScore = Math.max(...clubs.map(c => c.score), 1);

  const LEAGUE_FLAGS: Record<string, string> = {
    "Premier League": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    "La Liga": "🇪🇸",
    "Bundesliga": "🇩🇪",
    "Serie A": "🇮🇹",
    "Ligue 1": "🇫🇷",
    "MLS": "🇺🇸",
    "Saudi Pro League": "🇸🇦",
    "Primeira Liga": "🇵🇹",
    "Eredivisie": "🇳🇱",
    "Liga MX": "🇲🇽",
  };

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Club Contribution Index™</span>
          <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
        </div>
        <span className="text-[9px] text-slate-500 uppercase tracking-wider">WC squad representation</span>
      </div>

      <div className="divide-y divide-brand-border/40">
        {clubs.map((c, i) => {
          const pct = (c.score / maxScore) * 100;
          const flag = LEAGUE_FLAGS[c.league] ?? "⚽";
          return (
            <div key={c.club} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/3 transition-colors">
              <span className="text-[10px] font-mono text-slate-600 w-4 shrink-0 tabular-nums">{i + 1}</span>
              <span className="text-sm shrink-0" title={c.league}>{flag}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-200 truncate">{c.club}</div>
                <div className="text-[9px] text-slate-600 mt-0.5">{c.league}</div>
                <div className="mt-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-brand-green"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 text-[10px] text-right">
                <div className="text-center">
                  <div className="font-black text-white tabular-nums">{c.playerCount}</div>
                  <div className="text-[8px] text-slate-600 uppercase">players</div>
                </div>
                {c.careerGoals > 0 && (
                  <div className="text-center hidden sm:block">
                    <div className="font-black text-slate-400 tabular-nums">{c.careerGoals}</div>
                    <div className="text-[8px] text-slate-600 uppercase">int'l goals</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-brand-border/50 px-4 py-2 text-[9px] text-slate-700 text-center">
        CCI score = Players×2 + Career Goals×0.5
      </div>
    </div>
  );
}
