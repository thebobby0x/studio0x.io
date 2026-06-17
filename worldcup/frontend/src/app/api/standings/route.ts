export const dynamic = "force-dynamic";

import { GET as scheduleGET } from "@/app/api/schedule/route";
import type { ScheduleMatch } from "@/app/api/schedule/route";
import { getFlag } from "@/lib/flags";
import { NextResponse } from "next/server";

export interface TeamStanding {
  tla: string;
  name: string;
  flag: string;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}

export interface GroupStanding {
  group: string;
  teams: TeamStanding[];
}

function emptyTeam(tla: string, name: string): TeamStanding {
  return { tla, name, flag: getFlag(tla), p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
}

export async function GET() {
  try {
    const res = await scheduleGET();
    const matches: ScheduleMatch[] = await res.json();

    // Only count finished GROUP_STAGE matches
    const finished = matches.filter(
      (m) => m.status === "FT" && m.stage === "GROUP_STAGE"
    );

    // group letter → team tla → standing
    const groups = new Map<string, Map<string, TeamStanding>>();

    for (const m of finished) {
      if (m.homeScore === null || m.awayScore === null) continue;

      const grp = m.group || "?";
      if (!groups.has(grp)) groups.set(grp, new Map());
      const teams = groups.get(grp)!;

      if (!teams.has(m.homeTeam.tla)) {
        teams.set(m.homeTeam.tla, emptyTeam(m.homeTeam.tla, m.homeTeam.name));
      }
      if (!teams.has(m.awayTeam.tla)) {
        teams.set(m.awayTeam.tla, emptyTeam(m.awayTeam.tla, m.awayTeam.name));
      }

      const home = teams.get(m.homeTeam.tla)!;
      const away = teams.get(m.awayTeam.tla)!;

      const hs = m.homeScore;
      const as_ = m.awayScore;

      // Played
      home.p += 1;
      away.p += 1;

      // Goals
      home.gf += hs;
      home.ga += as_;
      away.gf += as_;
      away.ga += hs;

      // Result
      if (hs > as_) {
        home.w += 1; home.pts += 3;
        away.l += 1;
      } else if (hs < as_) {
        away.w += 1; away.pts += 3;
        home.l += 1;
      } else {
        home.d += 1; home.pts += 1;
        away.d += 1; away.pts += 1;
      }
    }

    // Build sorted output
    const result: GroupStanding[] = Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, teamsMap]) => {
        const teams = Array.from(teamsMap.values()).map((t) => ({
          ...t,
          gd: t.gf - t.ga,
        }));

        teams.sort((a, b) => {
          if (b.pts !== a.pts) return b.pts - a.pts;
          if (b.gd !== a.gd) return b.gd - a.gd;
          if (b.gf !== a.gf) return b.gf - a.gf;
          return a.name.localeCompare(b.name);
        });

        return { group, teams };
      });

    return NextResponse.json(result);
  } catch (e) {
    console.error("[standings] error:", e);
    return NextResponse.json([], { status: 503 });
  }
}
