import { prisma } from "@/lib/prisma";
import { getVenueInfo } from "@/lib/venues";
import { BatteryLow } from "lucide-react";

// ── Fatigue Factor™ (owner 7/9: "did we account for short turnaround / travel
// between games?") ────────────────────────────────────────────────────────────
// Real, computable inputs only: kickoff-to-kickoff rest and great-circle
// distances between the venues each squad actually played in. We do NOT know
// training-base locations or actual flight routes, so we say exactly what the
// number is — venue-to-venue — and never present it as total travel.

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}

interface SideFatigue {
  teamName: string;
  restDays: number;      // kickoff to kickoff, 1 decimal
  hopKm: number | null;  // last venue → this venue
  tourKm: number | null; // sum of venue-to-venue hops this tournament
  lastVenueCity: string;
}

async function sideFatigue(
  teamId: string,
  teamName: string,
  matchDate: Date,
  matchVenue: string
): Promise<SideFatigue | null> {
  const prev = await prisma.match.findMany({
    where: {
      status: "FT",
      date: { lt: matchDate },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    orderBy: { date: "asc" },
    select: { date: true, venue: true, city: true },
  });
  if (prev.length === 0) return null; // first match — nothing honest to compare

  const last = prev[prev.length - 1];
  const restDays = +((matchDate.getTime() - last.date.getTime()) / 86_400_000).toFixed(1);

  const here = getVenueInfo(matchVenue);
  const lastInfo = getVenueInfo(last.venue);
  const hopKm = here && lastInfo ? haversineKm(lastInfo, here) : null;

  // Venue-to-venue tour distance: hops between consecutive match venues,
  // plus the hop into tonight's venue.
  let tourKm: number | null = 0;
  const stops = [...prev.map((p) => p.venue), matchVenue];
  for (let i = 1; i < stops.length; i++) {
    const a = getVenueInfo(stops[i - 1]);
    const b = getVenueInfo(stops[i]);
    if (!a || !b) { tourKm = null; break; }
    tourKm += haversineKm(a, b);
  }

  return { teamName, restDays, hopKm, tourKm, lastVenueCity: last.city || last.venue };
}

export default async function FatigueFactor({ fixtureId }: { fixtureId: number }) {
  let home: SideFatigue | null = null;
  let away: SideFatigue | null = null;
  try {
    const match = await prisma.match.findUnique({
      where: { fixture: fixtureId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match || match.homeTeam.code === "TBD" || match.awayTeam.code === "TBD") return null;
    [home, away] = await Promise.all([
      sideFatigue(match.homeTeamId, match.homeTeam.name, match.date, match.venue),
      sideFatigue(match.awayTeamId, match.awayTeam.name, match.date, match.venue),
    ]);
  } catch {
    return null;
  }
  if (!home || !away) return null;

  const restGap = +(away.restDays - home.restDays).toFixed(1);
  const gapNote =
    Math.abs(restGap) >= 1.5
      ? `${restGap > 0 ? home.teamName : away.teamName} arrive on ${Math.abs(restGap).toFixed(1)} fewer days' rest`
      : null;

  const Side = ({ s, accent }: { s: SideFatigue; accent: string }) => (
    <div className="flex-1 min-w-0">
      <div className={`text-xs font-black truncate ${accent}`}>{s.teamName}</div>
      <div className="mt-1 space-y-0.5 text-[11px] text-slate-400">
        <div>
          <span className="text-white font-bold tabular-nums">{s.restDays}</span> days rest
        </div>
        {s.hopKm !== null && (
          <div>
            <span className="text-white font-bold tabular-nums">{s.hopKm.toLocaleString()}</span> km
            from {s.lastVenueCity}
          </div>
        )}
        {s.tourKm !== null && (
          <div className="text-slate-500">
            {s.tourKm.toLocaleString()} km toured this WC
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <BatteryLow size={14} className="text-brand-gold" />
        <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">
          Fatigue Factor™
        </span>
        <span className="text-[9px] text-slate-700 font-mono">studio0x</span>
      </div>
      <div className="px-4 pb-3 flex gap-4">
        {/* Duel colors: home green · away gold (color discipline 7/9) */}
        <Side s={home} accent="text-brand-green" />
        <Side s={away} accent="text-brand-gold" />
      </div>
      {gapNote && (
        <div className="px-4 pb-2 text-[11px] text-slate-300">{gapNote}</div>
      )}
      <div className="px-4 pb-3 text-[9px] text-slate-700">
        kickoff-to-kickoff rest · great-circle distance between match venues — training-base
        travel not included
      </div>
    </div>
  );
}
