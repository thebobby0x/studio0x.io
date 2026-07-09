export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import AppNav from "@/components/ui/AppNav";
import { CopyUrlButton } from "./CopyUrlButton";

function formatListenTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const totalMins = Math.floor(seconds / 60);
  if (totalMins < 60) return `${totalMins} min`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default async function AdminStatsPage() {
  const streams = await prisma.audioStream.findMany({
    orderBy: { playCount: "desc" },
    include: { team: { select: { name: true, flagEmoji: true } } },
  });

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      <AppNav />
      <div className="p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Anthem Stats</h1>
          <p className="text-slate-500 text-sm mt-1">
            {streams.length} track{streams.length !== 1 ? "s" : ""} · ordered by play count
          </p>
        </div>

        <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border bg-brand-dark/60">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-widest">Track</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-widest">Plays</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-widest">Listen Time</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-widest">Shares</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-widest">URL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {streams.map((s) => (
                <tr key={s.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xl flex-shrink-0">{s.team?.flagEmoji ?? "🏆"}</span>
                      <div className="min-w-0">
                        <div className="font-semibold text-white truncate">{s.title}</div>
                        <div className="text-xs text-slate-500 truncate">{s.team?.name ?? "footy26"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-brand-gold font-semibold">
                    {s.playCount.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-300 font-mono">
                    {formatListenTime(s.listenSeconds)}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-300 font-mono">
                    {s.shareClicks.toLocaleString()}
                  </td>
                  <td className="px-5 py-3">
                    <CopyUrlButton url={s.audioUrl} />
                  </td>
                </tr>
              ))}
              {streams.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-600">
                    No audio streams found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}
