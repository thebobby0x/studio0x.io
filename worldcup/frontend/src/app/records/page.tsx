export const dynamic = "force-dynamic";

import AppNav from "@/components/ui/AppNav";
import ShareButton from "@/components/ui/ShareButton";
import { prisma } from "@/lib/prisma";
import { Trophy, Medal } from "lucide-react";

// ── Tournament Records (owner 7/9: "we have Golden Boot for most goals — can
// we also create other things?") ──────────────────────────────────────────────
// Every board below is computed from data we actually hold: PlayerTournamentStat
// (nightly ingest from api-football per-match player stats), the match table,
// and MatchEventLog (our own live capture). Boards we CANNOT honestly build are
// listed at the bottom with the reason — never approximated silently.

interface BoardRow {
  rank: number;
  flag: string;
  name: string;
  team: string;
  value: string;
  sub?: string;
}

interface Board {
  key: string;
  title: string;
  metric: string;
  rows: BoardRow[];
  note?: string;
}

type StatWithPlayer = {
  player: { name: string; team: { code: string; flagEmoji: string } };
  [k: string]: unknown;
};

function toRows<T extends StatWithPlayer>(
  stats: T[],
  value: (s: T) => number,
  fmt: (s: T) => string,
  sub?: (s: T) => string
): BoardRow[] {
  return stats
    .filter((s) => value(s) > 0)
    .sort((a, b) => value(b) - value(a))
    .slice(0, 5)
    .map((s, i) => ({
      rank: i + 1,
      flag: s.player.team.flagEmoji,
      name: s.player.name,
      team: s.player.team.code,
      value: fmt(s),
      sub: sub?.(s),
    }));
}

async function buildPlayerBoards(): Promise<Board[]> {
  const stats = await prisma.playerTournamentStat.findMany({
    where: { matches: { gt: 0 } },
    include: { player: { include: { team: true } } },
  });
  if (stats.length === 0) return [];

  type S = (typeof stats)[number];
  const b = (key: string, title: string, metric: string, value: (s: S) => number, fmt: (s: S) => string, sub?: (s: S) => string, note?: string): Board => ({
    key, title, metric, rows: toRows(stats, value, fmt, sub), note,
  });

  return [
    b("boot", "Golden Boot", "most goals", (s) => s.goals, (s) => `${s.goals}`, (s) => `${s.matches} matches`),
    b("assists", "The Playmaker", "most assists", (s) => s.assists, (s) => `${s.assists}`, (s) => `${s.passesKey} key passes`),
    b("minutes", "The Iron Man", "most minutes played", (s) => s.minutesPlayed, (s) => `${s.minutesPlayed.toLocaleString()}′`, (s) => `${s.matches} matches`),
    b("shots", "The Trigger", "most shots", (s) => s.shotsTotal, (s) => `${s.shotsTotal}`, (s) => `${s.shotsOnTarget} on target`),
    b("fouls", "The Enforcer", "most fouls committed", (s) => s.foulsCommitted, (s) => `${s.foulsCommitted}`, (s) => `${s.foulsDrawn} drawn`),
    b("cards", "The Card Magnet", "most cards", (s) => s.yellowCards + s.redCards * 2, (s) => `${s.yellowCards}Y${s.redCards > 0 ? ` ${s.redCards}R` : ""}`, undefined,
      "reds weighted ×2 for ranking"),
    b("duels", "The Duel King", "most duels won", (s) => s.duelsWon, (s) => `${s.duelsWon}`, (s) => s.duelsTotal > 0 ? `${Math.round((s.duelsWon / s.duelsTotal) * 100)}% won` : undefined as unknown as string),
    b("dribbles", "The Entertainer", "most completed dribbles", (s) => s.dribblesSuccess, (s) => `${s.dribblesSuccess}`),
  ];
}

// Studio0x Player of the Match honors: highest api-football rating per finished
// match (≥45 minutes played). There is NO official POTM in our data — this is
// rating-derived and labeled as ours.
async function buildMvpBoard(): Promise<Board | null> {
  const perMatch = await prisma.playerMatchStat.findMany({
    where: { rating: { gt: 0 }, minutesPlayed: { gte: 45 }, match: { status: "FT" } },
    include: { player: { include: { team: true } } },
  });
  if (perMatch.length === 0) return null;

  const best = new Map<string, (typeof perMatch)[number]>();
  for (const s of perMatch) {
    const cur = best.get(s.matchId);
    if (!cur || s.rating > cur.rating) best.set(s.matchId, s);
  }
  const counts = new Map<string, { s: (typeof perMatch)[number]; n: number }>();
  for (const s of best.values()) {
    const e = counts.get(s.playerId);
    if (e) e.n++;
    else counts.set(s.playerId, { s, n: 1 });
  }
  const rows = [...counts.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
    .map((e, i) => ({
      rank: i + 1,
      flag: e.s.player.team.flagEmoji,
      name: e.s.player.name,
      team: e.s.player.team.code,
      value: `${e.n}×`,
    }));
  return rows.length > 0
    ? {
        key: "mvp",
        title: "Studio0x Player of the Match",
        metric: "most match-best ratings",
        rows,
        note: "top api-football rating per FT match (≥45′) — no official POTM exists in our data",
      }
    : null;
}

interface TeamBoardRow { rank: number; flag: string; name: string; value: string; sub?: string }
interface TeamBoard { key: string; title: string; metric: string; rows: TeamBoardRow[]; note?: string }

async function buildTeamAndMatchBoards(): Promise<TeamBoard[]> {
  const matches = await prisma.match.findMany({
    where: { status: "FT" },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { date: "asc" },
  });
  if (matches.length === 0) return [];

  type Agg = { name: string; flag: string; gf: number; ga: number; cleanSheets: number; played: number };
  const teams = new Map<string, Agg>();
  const agg = (code: string, name: string, flag: string, gf: number, ga: number) => {
    const t = teams.get(code) ?? { name, flag, gf: 0, ga: 0, cleanSheets: 0, played: 0 };
    t.gf += gf; t.ga += ga; t.played++;
    if (ga === 0) t.cleanSheets++;
    teams.set(code, t);
  };
  for (const m of matches) {
    if (m.homeTeam.code === "TBD" || m.awayTeam.code === "TBD") continue;
    agg(m.homeTeam.code, m.homeTeam.name, m.homeTeam.flagEmoji, m.homeScore, m.awayScore);
    agg(m.awayTeam.code, m.awayTeam.name, m.awayTeam.flagEmoji, m.awayScore, m.homeScore);
  }
  const teamRows = (
    value: (t: Agg) => number,
    fmt: (t: Agg) => string,
    sub?: (t: Agg) => string
  ): TeamBoardRow[] =>
    [...teams.values()]
      .filter((t) => value(t) > 0)
      .sort((a, b) => value(b) - value(a))
      .slice(0, 5)
      .map((t, i) => ({ rank: i + 1, flag: t.flag, name: t.name, value: fmt(t), sub: sub?.(t) }));

  const label = (m: (typeof matches)[number]) =>
    `${m.homeTeam.code} ${m.homeScore}–${m.awayScore} ${m.awayTeam.code}`;

  const byGoals = [...matches].sort(
    (a, b) => (b.homeScore + b.awayScore) - (a.homeScore + a.awayScore)
  );
  const byMargin = [...matches].sort(
    (a, b) => Math.abs(b.homeScore - b.awayScore) - Math.abs(a.homeScore - a.awayScore)
  );
  const etGames = matches.filter((m) => m.elapsed >= 120);

  const boards: TeamBoard[] = [
    { key: "tgoals", title: "Goal Machine", metric: "most goals scored (team)", rows: teamRows((t) => t.gf, (t) => `${t.gf}`, (t) => `${t.played} matches`) },
    { key: "tgd", title: "The Steamroller", metric: "best goal difference", rows: teamRows((t) => t.gf - t.ga, (t) => `+${t.gf - t.ga}`, (t) => `${t.gf} for · ${t.ga} against`) },
    { key: "tclean", title: "The Wall", metric: "most clean sheets", rows: teamRows((t) => t.cleanSheets, (t) => `${t.cleanSheets}`, (t) => `${t.played} matches`) },
    {
      key: "highscoring",
      title: "Goal Fests",
      metric: "highest-scoring matches",
      rows: byGoals.slice(0, 5).map((m, i) => ({
        rank: i + 1, flag: "⚽", name: label(m),
        value: `${m.homeScore + m.awayScore} goals`,
        sub: new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      })),
    },
    {
      key: "blowouts",
      title: "The Demolitions",
      metric: "biggest winning margins",
      rows: byMargin.filter((m) => m.homeScore !== m.awayScore).slice(0, 5).map((m, i) => ({
        rank: i + 1, flag: "💥", name: label(m),
        value: `by ${Math.abs(m.homeScore - m.awayScore)}`,
        sub: new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      })),
    },
  ];
  if (etGames.length > 0) {
    boards.push({
      key: "longest",
      title: "The Marathons",
      metric: "matches that went to extra time",
      rows: etGames.slice(0, 5).map((m, i) => ({
        rank: i + 1, flag: "⏱", name: label(m), value: "120′+",
        sub: new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      })),
      note: "true stoppage-clock length isn't in our data — 120′ = went to extra time",
    });
  }
  return boards;
}

// VAR reviews per match — from OUR live capture (MatchEventLog), which only
// covers matches watched live since Jul 9. Small sample, honestly labeled.
async function buildVarBoard(): Promise<TeamBoard | null> {
  try {
    const varEvents = await prisma.matchEventLog.findMany({ where: { type: "Var" } });
    if (varEvents.length === 0) return null;
    const byFixture = new Map<number, number>();
    for (const e of varEvents) byFixture.set(e.fixture, (byFixture.get(e.fixture) ?? 0) + 1);
    const fixtures = [...byFixture.keys()];
    const matches = await prisma.match.findMany({
      where: { fixture: { in: fixtures } },
      include: { homeTeam: true, awayTeam: true },
    });
    const rows = [...byFixture.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .flatMap(([fixture, n], i) => {
        const m = matches.find((x) => x.fixture === fixture);
        if (!m) return [];
        return [{
          rank: i + 1, flag: "📺",
          name: `${m.homeTeam.code} ${m.homeScore}–${m.awayScore} ${m.awayTeam.code}`,
          value: `${n} review${n > 1 ? "s" : ""}`,
          sub: new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        }];
      });
    return rows.length > 0
      ? {
          key: "var",
          title: "The VAR Theatre",
          metric: "most VAR reviews",
          rows,
          note: "Studio0x live capture — matches watched live since Jul 9 only, not full-tournament coverage",
        }
      : null;
  } catch {
    return null;
  }
}

function BoardCard({ board }: { board: Board | TeamBoard }) {
  return (
    <div className="rounded-2xl bg-brand-card border border-brand-border overflow-hidden">
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <Medal size={13} className="text-brand-gold" />
          <span className="text-sm font-black text-white">{board.title}</span>
        </div>
        <div className="text-[10px] uppercase tracking-widest text-slate-600 font-bold mt-0.5">
          {board.metric}
        </div>
      </div>
      <div className="px-4 pb-3 space-y-1.5">
        {board.rows.map((r) => (
          <div key={`${r.rank}-${r.name}`} className="flex items-center gap-2 text-xs">
            <span className={`w-4 text-right tabular-nums font-black ${r.rank === 1 ? "text-brand-gold" : "text-slate-600"}`}>
              {r.rank}
            </span>
            <span>{r.flag}</span>
            <span className="text-slate-200 font-semibold truncate">
              {r.name}
              {"team" in r && r.team ? <span className="text-slate-600 font-normal"> · {String(r.team)}</span> : null}
            </span>
            <span className="ml-auto text-white font-black tabular-nums shrink-0">{r.value}</span>
            {r.sub && <span className="text-[10px] text-slate-600 shrink-0 hidden sm:inline">{r.sub}</span>}
          </div>
        ))}
      </div>
      {board.note && (
        <div className="px-4 pb-3 text-[9px] text-slate-700">{board.note}</div>
      )}
    </div>
  );
}

export default async function RecordsPage() {
  const [playerBoards, mvp, teamBoards, varBoard] = await Promise.all([
    buildPlayerBoards(),
    buildMvpBoard(),
    buildTeamAndMatchBoards(),
    buildVarBoard(),
  ]);
  const boards: (Board | TeamBoard)[] = [
    ...playerBoards.filter((b) => b.rows.length > 0),
    ...(mvp ? [mvp] : []),
    ...teamBoards.filter((b) => b.rows.length > 0),
    ...(varBoard ? [varBoard] : []),
  ];

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200">
      <AppNav />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <Trophy size={22} className="text-brand-gold" />
            <h1 className="text-3xl font-black text-white tracking-tight">
              Tournament <span className="text-brand-gold">Records</span>
            </h1>
            <ShareButton
              text="World Cup 2026 Records — Golden Boot, Iron Man, The Wall and every leaderboard · studio0x.io"
              url="/records"
              title="World Cup 2026 Tournament Records"
              className="ml-1"
            />
          </div>
          <p className="text-slate-500 text-sm">
            Every leaderboard, computed from real per-match data · updates nightly as stats ingest
          </p>
        </div>

        {boards.length === 0 ? (
          <div className="rounded-2xl bg-brand-card border border-brand-border p-8 text-center text-sm text-slate-500">
            No ingested stats yet — run &ldquo;Ingest Player Stats&rdquo; from the admin panel to
            populate the boards.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {boards.map((b) => (
              <BoardCard key={b.key} board={b} />
            ))}
          </div>
        )}

        <div className="mt-8 rounded-2xl bg-brand-card/50 border border-brand-border/50 px-5 py-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
            Boards we can&apos;t honestly build (yet)
          </div>
          <ul className="text-xs text-slate-500 space-y-1">
            <li>· <span className="text-slate-400">Distance run</span> — api-football doesn&apos;t provide player tracking/distance data</li>
            <li>· <span className="text-slate-400">Woodwork hits</span> (post/crossbar) — not in our events or stats feeds</li>
            <li>· <span className="text-slate-400">Official Player of the Match</span> — FIFA&apos;s award isn&apos;t in our data; ours is rating-derived and labeled Studio0x</li>
            <li>· <span className="text-slate-400">Stoppage time / true match length</span> — the feed reports 90′/120′, not the real clock</li>
            <li>· <span className="text-slate-400">Full-tournament VAR counts</span> — our live capture started Jul 9; earlier matches weren&apos;t recorded</li>
          </ul>
          <div className="text-[9px] text-slate-700 mt-2 font-mono">
            studio0x · player boards cover players in our squad DB — completing full squads raises coverage
          </div>
        </div>
      </main>
      <footer className="mt-16 border-t border-brand-border py-8 text-center text-xs text-slate-600">
        Studio0x.io · World Cup 2026 Stats Engine · Player stats via api-football.com
      </footer>
    </div>
  );
}
