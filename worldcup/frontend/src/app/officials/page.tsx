export const dynamic = "force-dynamic";

import AppNav from "@/components/ui/AppNav";
import ShareButton from "@/components/ui/ShareButton";
import { Shield, Plane, MapPin } from "lucide-react";
import type { OfficialProfile } from "@/app/api/officials/route";
import { GET as officialsGET } from "@/app/api/officials/route";

// Metric badge with the standard studio0x™ treatment
function Metric({ label, value, suffix, hint }: { label: string; value: number | null; suffix?: string; hint: string }) {
  return (
    <div className="rounded-xl bg-brand-dark/60 border border-brand-border px-3 py-2.5">
      <div className="text-[9px] font-black uppercase tracking-widest text-brand-gold">{label}</div>
      <div className="text-xl font-black tabular-nums text-white mt-0.5">
        {value !== null ? value : <span className="text-slate-700 text-sm font-semibold">—</span>}
        {value !== null && suffix ? <span className="text-[10px] text-slate-500 font-semibold ml-1">{suffix}</span> : null}
      </div>
      <div className="text-[9px] text-slate-600 mt-0.5 leading-tight">{hint}</div>
    </div>
  );
}

function FlowBar({ value }: { value: number | null }) {
  if (value === null) {
    return <div className="text-[10px] text-slate-600">Let It Flow™ — pending match stats</div>;
  }
  const label = value >= 70 ? "Lets it flow" : value >= 40 ? "Balanced" : "Quick trigger";
  return (
    <div>
      <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest mb-1">
        <span className="text-brand-gold">Let It Flow™</span>
        <span className={value >= 70 ? "text-brand-green" : value >= 40 ? "text-slate-400" : "text-red-400"}>
          {label} · {value}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-brand-border overflow-hidden">
        <div
          className={`h-full rounded-full ${value >= 70 ? "bg-brand-green" : value >= 40 ? "bg-brand-gold" : "bg-red-500"}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export default async function OfficialsPage() {
  let officials: OfficialProfile[] = [];
  try {
    const res = await officialsGET();
    const data = (await res.json()) as { officials: OfficialProfile[] };
    officials = data.officials ?? [];
  } catch {
    // render empty state
  }

  const withUpcoming = officials.filter((o) => o.nextAssignment);

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      <AppNav />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Shield size={22} className="text-brand-gold" />
            <h1 className="text-3xl font-black text-white tracking-tight">
              The <span className="text-brand-gold">Officials</span>
            </h1>
            <ShareButton
              text="The Officials — WC 2026 referee profiles with Whistle Index™, Card Threshold™ and Let It Flow™ ratings · studio0x.io"
              url="/officials"
              title="podiumMetrics — The Officials"
            />
          </div>
          <p className="text-slate-500 text-sm">
            Referee profiles & movements · built from real WC 2026 assignments and match data ·{" "}
            <span className="font-mono text-slate-700">studio0x</span>
          </p>
        </div>

        {/* Officials on the Move */}
        {withUpcoming.length > 0 && (
          <section className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
            <div className="px-4 py-3 border-b border-brand-border flex items-center gap-2">
              <Plane size={13} className="text-brand-green" />
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Officials on the Move
              </span>
            </div>
            <div className="divide-y divide-brand-border/60">
              {withUpcoming.slice(0, 10).map((o) => (
                <div key={o.name} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="font-bold text-white truncate">{o.name}</span>
                  <span className="text-slate-600 text-xs flex items-center gap-1 min-w-0">
                    <MapPin size={10} className="shrink-0" />
                    <span className="truncate">
                      {o.lastCity ? `${o.lastCity} → ` : ""}
                      {o.nextAssignment!.city}
                    </span>
                  </span>
                  <span className="ml-auto text-xs text-slate-500 tabular-nums shrink-0">
                    {o.nextAssignment!.home} v {o.nextAssignment!.away}
                  </span>
                  <span
                    className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0 ${
                      o.status === "in-transit"
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-brand-green/15 text-brand-green"
                    }`}
                  >
                    {o.status === "in-transit" ? "In transit" : "On site"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Profile cards */}
        {officials.length === 0 ? (
          <div className="rounded-2xl bg-brand-card border border-brand-border p-10 text-center">
            <Shield size={28} className="text-slate-700 mx-auto mb-3" />
            <p className="text-slate-400 font-semibold">No referee assignments yet</p>
            <p className="text-slate-600 text-sm mt-1">
              Assignments load automatically from api-football via the nightly fixture sync.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {officials.map((o) => (
              <div key={o.name} className="rounded-2xl bg-brand-card border border-brand-border p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-black text-white text-lg leading-tight">{o.name}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {o.gamesWorked} game{o.gamesWorked === 1 ? "" : "s"} worked
                      {o.upcoming > 0 ? ` · ${o.upcoming} upcoming` : ""}
                      {o.statsGames > 0 && o.statsGames < o.gamesWorked
                        ? ` · metrics from ${o.statsGames}`
                        : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[9px] uppercase tracking-widest text-slate-600">Cards shown</div>
                    <div className="text-sm font-black tabular-nums">
                      <span className="text-amber-400">{o.yellows}Y</span>
                      <span className="text-slate-600 mx-1">·</span>
                      <span className="text-red-400">{o.reds}R</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Whistle Index™" value={o.whistleIndex} suffix="/gm" hint="fouls called per game" />
                  <Metric label="Card Threshold™" value={o.cardThreshold} suffix="fouls" hint="fouls allowed per card" />
                  <Metric label="Booking Rate™" value={o.bookingRate} suffix="/gm" hint="cards per game" />
                </div>

                <FlowBar value={o.letItFlow} />
                <div className="text-[9px] text-slate-700 font-mono">studio0x · WC 2026 data only</div>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="mt-16 border-t border-brand-border py-8 text-center text-xs text-slate-600">
        studio0x.io · Officials™ · assignments via api-football · metrics computed from ingested match stats
      </footer>
    </div>
  );
}
