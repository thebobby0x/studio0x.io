import { prisma } from "@/lib/prisma";

// PPI = goals×3 + assists×2 + rating×1.5 − redCards×3 − yellowCards×0.5
// Normalised 0–100 against tournament leader
function computePPI(goals: number, assists: number, rating: number, yellows: number, reds: number): number {
  return Math.max(0, goals * 3 + assists * 2 + rating * 1.5 - reds * 3 - yellows * 0.5);
}

export default async function PlayerPerformanceIndex({ limit = 12 }: { limit?: number }) {
  const stats = await prisma.playerTournamentStat.findMany({
    where: { matches: { gt: 0 } },
    include: { player: { include: { team: true } } },
    orderBy: [{ goals: "desc" }, { assists: "desc" }],
    take: 50,
  }).catch(() => []);

  if (stats.length === 0) {
    return (
      <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Player Performance Index™</span>
            <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
          </div>
        </div>
        <div className="px-4 py-8 text-center">
          <p className="text-slate-500 text-sm font-semibold">No tournament stats yet</p>
          <p className="text-slate-700 text-xs mt-1">
            Admin: POST <code className="font-mono text-brand-gold text-[10px]">/api/admin/seed-players?mock=true</code> then update stats as matches play out.
          </p>
        </div>
      </div>
    );
  }

  const withPPI = stats
    .map(s => ({
      ...s,
      ppi: computePPI(s.goals, s.assists, s.rating, s.yellowCards, s.redCards),
    }))
    .sort((a, b) => b.ppi - a.ppi)
    .slice(0, limit);

  const maxPPI = Math.max(...withPPI.map(s => s.ppi), 1);

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Player Performance Index™</span>
          <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
        </div>
        <span className="text-[9px] text-slate-500 uppercase tracking-wider">Goals · assists · impact · cards</span>
      </div>

      <div className="divide-y divide-brand-border/40">
        {withPPI.map((s, i) => {
          const pct = (s.ppi / maxPPI) * 100;
          return (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/3 transition-colors">
              <span className="text-[10px] font-mono text-slate-600 w-4 shrink-0 tabular-nums">{i + 1}</span>
              <span className="text-base shrink-0">{s.player.team.flagEmoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-200 truncate">{s.player.name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[9px] text-slate-600 uppercase tracking-wider">{s.player.position}</span>
                  {s.player.club && (
                    <>
                      <span className="text-[9px] text-slate-700">·</span>
                      <span className="text-[9px] text-slate-600">{s.player.club}</span>
                    </>
                  )}
                </div>
                <div className="mt-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-gold to-amber-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 text-[10px]">
                {s.goals > 0 && <span className="text-slate-300 font-semibold">⚽ {s.goals}</span>}
                {s.assists > 0 && <span className="text-slate-400">🎯 {s.assists}</span>}
                {s.rating > 0 && <span className="text-slate-500">{s.rating.toFixed(1)}</span>}
                <span className="font-black text-brand-gold tabular-nums w-8 text-right">
                  {s.ppi.toFixed(1)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-brand-border/50 px-4 py-2 text-[9px] text-slate-700 text-center">
        PPI = Goals×3 + Assists×2 + Rating×1.5 − Cards
      </div>
    </div>
  );
}
