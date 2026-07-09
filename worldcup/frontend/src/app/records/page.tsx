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

// studio0x Player of the Match honors: highest api-football rating per finished
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
        title: "studio0x Player of the Match",
        metric: "most match-best ratings",
        rows,
        note: "top api-football rating per FT match (≥45′) — no official POTM exists in our data",
      }
    : null;
}

interface TeamBoardRow { rank: number; flag: string; name: string; value: string; sub?: string }
interface TeamBoard { key: string; title: string; metric: string; rows: TeamBoardRow[]; note?: string }

// Team analogs of the player boards — same ingested per-player stats summed by
// squad, so every player metric has a team-level answer (owner 7/9).
async function buildTeamStatBoards(): Promise<TeamBoard[]> {
  const stats = await prisma.playerTournamentStat.findMany({
    where: { matches: { gt: 0 } },
    include: { player: { include: { team: true } } },
  });
  if (stats.length === 0) return [];

  type Agg = { name: string; flag: string; assists: number; fouls: number; cards: number; shots: number; shotsOn: number };
  const byTeam = new Map<string, Agg>();
  for (const s of stats) {
    const code = s.player.team.code;
    const t = byTeam.get(code) ?? {
      name: s.player.team.name, flag: s.player.team.flagEmoji,
      assists: 0, fouls: 0, cards: 0, shots: 0, shotsOn: 0,
    };
    t.assists += s.assists;
    t.fouls += s.foulsCommitted;
    t.cards += s.yellowCards + s.redCards * 2;
    t.shots += s.shotsTotal;
    t.shotsOn += s.shotsOnTarget;
    byTeam.set(code, t);
  }
  const rows = (value: (t: Agg) => number, fmt: (t: Agg) => string, sub?: (t: Agg) => string): TeamBoardRow[] =>
    [...byTeam.values()]
      .filter((t) => value(t) > 0)
      .sort((a, b) => value(b) - value(a))
      .slice(0, 5)
      .map((t, i) => ({ rank: i + 1, flag: t.flag, name: t.name, value: fmt(t), sub: sub?.(t) }));

  return [
    { key: "tassists", title: "The Supply Lines", metric: "most assists (team)", rows: rows((t) => t.assists, (t) => `${t.assists}`) },
    { key: "tshots", title: "The Artillery", metric: "most shots (team)", rows: rows((t) => t.shots, (t) => `${t.shots}`, (t) => `${t.shotsOn} on target`) },
    { key: "tfouls", title: "The Roughnecks", metric: "most fouls (team)", rows: rows((t) => t.fouls, (t) => `${t.fouls}`) },
    { key: "tcards", title: "The Card Collectors", metric: "most cards (team)", rows: rows((t) => t.cards, (t) => `${t.cards}`), note: "reds weighted ×2 · summed from ingested player stats" },
  ];
}

// ── Group boards + data-driven Group Personalities (owner 7/9: "Group of
// Death exists — let's create other new groups thinking differently") ─────────
// Every personality is EARNED from results, not vibes: each group gets the
// title where its group-stage numbers (plus its alumni's knockout run for the
// Group of Death) are most extreme, with the justifying stat shown.
interface GroupPersonality { group: string; title: string; why: string }

async function buildGroupSection(): Promise<{ boards: TeamBoard[]; personalities: GroupPersonality[] }> {
  const { KNOCKOUT_START } = await import("@/lib/tournament");
  const matches = await prisma.match.findMany({
    where: { status: "FT" },
    include: { homeTeam: true, awayTeam: true },
  });
  const groupMatches = matches.filter(
    (m) => m.date < KNOCKOUT_START && /^[A-L]$/.test(m.homeTeam.groupStage ?? "")
  );
  if (groupMatches.length === 0) return { boards: [], personalities: [] };

  type G = {
    goals: number; played: number; draws: number; cleanSheets: number; btts: number;
    points: Map<string, number>; koWins: number;
  };
  const groups = new Map<string, G>();
  const g = (k: string) => {
    const cur = groups.get(k) ?? { goals: 0, played: 0, draws: 0, cleanSheets: 0, btts: 0, points: new Map(), koWins: 0 };
    groups.set(k, cur);
    return cur;
  };
  for (const m of groupMatches) {
    const grp = g(m.homeTeam.groupStage!);
    grp.goals += m.homeScore + m.awayScore;
    grp.played++;
    if (m.homeScore === m.awayScore) grp.draws++;
    if (m.homeScore === 0 || m.awayScore === 0) grp.cleanSheets++;
    if (m.homeScore > 0 && m.awayScore > 0) grp.btts++;
    const hp = m.homeScore > m.awayScore ? 3 : m.homeScore === m.awayScore ? 1 : 0;
    grp.points.set(m.homeTeam.code, (grp.points.get(m.homeTeam.code) ?? 0) + hp);
    grp.points.set(m.awayTeam.code, (grp.points.get(m.awayTeam.code) ?? 0) + (hp === 3 ? 0 : hp === 1 ? 1 : 3));
  }
  // Knockout wins by each group's alumni — the retro-validated Group of Death
  const groupOf = new Map<string, string>();
  for (const m of groupMatches) {
    groupOf.set(m.homeTeam.code, m.homeTeam.groupStage!);
    groupOf.set(m.awayTeam.code, m.awayTeam.groupStage!);
  }
  for (const m of matches) {
    if (m.date < KNOCKOUT_START || m.homeScore === m.awayScore) continue;
    const winner = m.homeScore > m.awayScore ? m.homeTeam.code : m.awayTeam.code;
    const grp = groupOf.get(winner);
    if (grp) g(grp).koWins++;
  }

  const spread = (x: G) => {
    const pts = [...x.points.values()];
    return pts.length > 0 ? Math.max(...pts) - Math.min(...pts) : 0;
  };
  const gpm = (x: G) => (x.played > 0 ? x.goals / x.played : 0);
  const entries = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));

  const boards: TeamBoard[] = [
    {
      key: "ggoals", title: "The Entertainment Districts", metric: "most goals per match (group stage)",
      rows: [...entries].sort((a, b) => gpm(b[1]) - gpm(a[1])).slice(0, 5).map(([k, x], i) => ({
        rank: i + 1, flag: "🏟", name: `Group ${k}`, value: gpm(x).toFixed(2), sub: `${x.goals} goals / ${x.played}`,
      })),
    },
    {
      key: "gko", title: "The Deep Runners", metric: "knockout wins by group alumni",
      rows: [...entries].filter(([, x]) => x.koWins > 0).sort((a, b) => b[1].koWins - a[1].koWins).slice(0, 5).map(([k, x], i) => ({
        rank: i + 1, flag: "🏆", name: `Group ${k}`, value: `${x.koWins}`, sub: "KO wins",
      })),
    },
  ];

  // One earned title per group: walk categories in priority order, each claims
  // its most extreme untitled group. Leftovers get an honest neutral label.
  const personalities: GroupPersonality[] = [];
  const titled = new Set<string>();
  const claim = (
    title: string,
    pick: (list: [string, G][]) => [string, G] | undefined,
    why: (k: string, x: G) => string
  ) => {
    const candidates = entries.filter(([k]) => !titled.has(k));
    const c = pick(candidates);
    if (!c) return;
    titled.add(c[0]);
    personalities.push({ group: c[0], title, why: why(c[0], c[1]) });
  };
  const maxBy = (f: (x: G) => number) => (list: [string, G][]) =>
    list.length ? [...list].sort((a, b) => f(b[1]) - f(a[1]))[0] : undefined;
  const minBy = (f: (x: G) => number) => (list: [string, G][]) =>
    list.length ? [...list].sort((a, b) => f(a[1]) - f(b[1]))[0] : undefined;

  claim("The Group of Death — Certified", maxBy((x) => x.koWins), (_, x) => `its alumni have won ${x.koWins} knockout matches — no group sent teams deeper`);
  claim("The Goal Festival", maxBy(gpm), (_, x) => `${gpm(x).toFixed(2)} goals per match — highest of the twelve`);
  claim("The Goal Desert", minBy(gpm), (_, x) => `${gpm(x).toFixed(2)} goals per match — lowest of the twelve`);
  claim("The Stalemate Society", maxBy((x) => x.draws), (_, x) => `${x.draws} draws in ${x.played} matches — nobody would blink`);
  claim("The Tightrope", minBy(spread), (_, x) => `top-to-bottom points spread of just ${spread(x)} — every match mattered`);
  claim("The Runaway Train", maxBy(spread), (_, x) => `points spread of ${spread(x)} — one team lapped the field`);
  claim("The Slugfest", maxBy((x) => x.btts), (_, x) => `both teams scored in ${x.btts} of ${x.played} matches`);
  claim("The Fortress District", maxBy((x) => x.cleanSheets), (_, x) => `${x.cleanSheets} shutout results in ${x.played} matches`);
  claim("The Second Act", maxBy((x) => x.koWins), (_, x) => `${x.koWins} knockout wins by its alumni — quietly dangerous`);
  claim("The Coin Flip", minBy(spread), (_, x) => `points spread of ${spread(x)} — separated by almost nothing`);
  for (const [k, x] of entries) {
    if (titled.has(k)) continue;
    personalities.push({
      group: k,
      title: "The Steady Ship",
      why: `${gpm(x).toFixed(2)} goals per match, ${x.draws} draws — no extremes, all business`,
    });
  }
  personalities.sort((a, b) => a.group.localeCompare(b.group));

  return { boards, personalities };
}

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
          note: "studio0x live capture — matches watched live since Jul 9 only, not full-tournament coverage",
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
  const [playerBoards, mvp, teamBoards, teamStatBoards, groupSection, varBoard] = await Promise.all([
    buildPlayerBoards(),
    buildMvpBoard(),
    buildTeamAndMatchBoards(),
    buildTeamStatBoards(),
    buildGroupSection(),
    buildVarBoard(),
  ]);
  const boards: (Board | TeamBoard)[] = [
    ...playerBoards.filter((b) => b.rows.length > 0),
    ...(mvp ? [mvp] : []),
    ...teamBoards.filter((b) => b.rows.length > 0),
    ...teamStatBoards.filter((b) => b.rows.length > 0),
    ...groupSection.boards.filter((b) => b.rows.length > 0),
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
              text="cup26 Records — Golden Boot, Iron Man, The Wall and every leaderboard · studio0x.io"
              url="/records"
              title="cup26 Records"
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

        {groupSection.personalities.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-black text-white tracking-tight">
                Group <span className="text-brand-gold">Personalities</span>
              </h2>
            </div>
            <p className="text-slate-500 text-xs mb-4">
              Every title earned from group-stage results (plus each group&apos;s knockout run) —
              the stat that justifies it is on the card
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {groupSection.personalities.map((p) => (
                <div key={p.group} className="rounded-2xl bg-brand-card border border-brand-border px-4 py-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-black text-brand-gold">Group {p.group}</span>
                    <span className="text-sm font-black text-white">{p.title}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">{p.why}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 rounded-2xl bg-brand-card/50 border border-brand-border/50 px-5 py-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
            Boards we can&apos;t honestly build (yet)
          </div>
          <ul className="text-xs text-slate-500 space-y-1">
            <li>· <span className="text-slate-400">Distance run</span> — api-football doesn&apos;t provide player tracking/distance data</li>
            <li>· <span className="text-slate-400">Woodwork hits</span> (post/crossbar) — not in our events or stats feeds</li>
            <li>· <span className="text-slate-400">Official Player of the Match</span> — FIFA&apos;s award isn&apos;t in our data; ours is rating-derived and labeled studio0x</li>
            <li>· <span className="text-slate-400">Stoppage time / true match length</span> — the feed reports 90′/120′, not the real clock</li>
            <li>· <span className="text-slate-400">Full-tournament VAR counts</span> — our live capture started Jul 9; earlier matches weren&apos;t recorded</li>
          </ul>
          <div className="text-[9px] text-slate-700 mt-2 font-mono">
            studio0x · player boards cover players in our squad DB — completing full squads raises coverage
          </div>
        </div>
      </main>
      <footer className="mt-16 border-t border-brand-border py-8 text-center text-xs text-slate-600">
        studio0x.io · cup26 stats engine · Player stats via api-football.com
      </footer>
    </div>
  );
}
