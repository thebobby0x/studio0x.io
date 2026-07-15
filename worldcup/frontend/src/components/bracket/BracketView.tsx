"use client";

import { useState } from "react";
import Link from "next/link";
import { Music2, VolumeX, Pause } from "lucide-react";
import FlagImg from "@/components/ui/FlagImg";
import ShareButton from "@/components/ui/ShareButton";
import { useAudio, type Track } from "@/lib/AudioContext";
import type { BracketMatch, KnockoutRound } from "@/app/bracket/page";

interface Props {
  rounds: Record<KnockoutRound, BracketMatch[]>;
  /** team code -> anthem track (The Soundtrack Survives) */
  anthems?: Record<string, Track>;
  songsStanding?: number;
  unresolvedPens?: number;
  champion?: { name: string; code: string } | null;
  silenced?: string[];
}

// ── The Soundtrack Survives: per-team play button on every card ──────────────
// Gold ♪ while the song is alive; muted "silenced" treatment once the team is
// knocked out (still playable — elegy mode).
function AnthemNote({ track, isSilenced }: { track: Track; isSilenced: boolean }) {
  const { current, isPlaying, play, togglePlay } = useAudio();
  const isThis = current?.id === track.id;
  const playingThis = isThis && isPlaying;
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isThis) togglePlay();
        else play(track, [track], 0);
      }}
      title={isSilenced ? `Silenced — ${track.title}` : `Play "${track.title}"`}
      className={`shrink-0 flex items-center justify-center w-5 h-5 rounded-full transition-colors ${
        playingThis
          ? "bg-brand-gold text-brand-dark"
          : isSilenced
          ? "bg-white/5 text-slate-600 hover:text-slate-400"
          : "bg-brand-gold/10 text-brand-gold hover:bg-brand-gold/25"
      }`}
    >
      {playingThis ? <Pause size={10} /> : isSilenced ? <VolumeX size={10} /> : <Music2 size={10} />}
    </button>
  );
}

const ALL_ROUNDS: KnockoutRound[] = [
  "Round of 32",
  "Round of 16",
  "Quarter-finals",
  "Semi-finals",
  "3rd Place Final",
  "Final",
];

const ROUND_SHORT: Record<KnockoutRound, string> = {
  "Round of 32":    "R32",
  "Round of 16":    "R16",
  "Quarter-finals": "QF",
  "Semi-finals":    "SF",
  "3rd Place Final":"3rd",
  "Final":          "Final",
};

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

function StatusBadge({ status, elapsed }: { status: string; elapsed: number }) {
  if (status === "FT" || status === "AET" || status === "PEN") {
    return <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">FT</span>;
  }
  if (status === "LIVE" || status === "1H" || status === "2H" || status === "HT" || status === "ET") {
    return (
      <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-brand-green">
        <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse inline-block" />
        {elapsed > 0 ? `${elapsed}'` : "LIVE"}
      </span>
    );
  }
  return null;
}

function isLive(status: string): boolean {
  return ["LIVE", "1H", "2H", "HT", "ET"].includes(status);
}

function isFinished(status: string): boolean {
  return ["FT", "AET", "PEN"].includes(status);
}

function TeamRow({
  team,
  score,
  isWinner,
  showScore,
  track,
  silencedSong,
}: {
  team: { name: string; code: string; flagEmoji: string } | null;
  score: number;
  isWinner: boolean;
  showScore: boolean;
  track?: Track;
  silencedSong?: boolean;
}) {
  const isTbd = !team;
  return (
    <div
      className={`flex items-center justify-between gap-2 px-3 py-2 ${
        isWinner ? "bg-brand-gold/10" : ""
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isTbd ? (
          <div className="w-6 h-4 rounded-sm bg-slate-800 shrink-0" />
        ) : (
          <FlagImg tla={team.code} size={24} className="shrink-0" />
        )}
        <span
          className={`text-xs font-semibold truncate ${
            isTbd
              ? "text-slate-600"
              : isWinner
              ? "text-brand-gold font-black"
              : "text-slate-200"
          }`}
        >
          {isTbd ? "TBD" : team.name}
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {track && <AnthemNote track={track} isSilenced={!!silencedSong} />}
        {showScore && !isTbd && (
          <span
            className={`text-sm font-black ${
              isWinner ? "text-brand-gold" : "text-slate-400"
            }`}
          >
            {score}
          </span>
        )}
      </div>
    </div>
  );
}

function MatchCard({ match, anthems = {}, silencedSet }: { match: BracketMatch; anthems?: Record<string, Track>; silencedSet?: Set<string> }) {
  const finished = isFinished(match.status);
  const live = isLive(match.status);
  const showScore = finished || live;
  const isTbd = !match.homeTeam && !match.awayTeam;
  const homeWins =
    finished &&
    match.homeTeam !== null &&
    match.homeScore > match.awayScore;
  const awayWins =
    finished &&
    match.awayTeam !== null &&
    match.awayScore > match.homeScore;

  const cardContent = (
    <div
      className={`rounded-xl border overflow-hidden transition-all ${
        live
          ? "border-brand-green/40 bg-brand-card shadow-[0_0_12px_rgba(16,185,129,0.15)]"
          : isTbd
          ? "border-brand-border bg-brand-card/60 opacity-60"
          : "border-brand-border bg-brand-card hover:border-slate-600"
      }`}
    >
      {/* Status / date header */}
      <div className="px-3 pt-2 pb-1 flex items-center justify-between border-b border-brand-border">
        <span className="text-[9px] font-mono text-slate-600 truncate">{isTbd ? "TBD" : match.city}</span>
        {(live || finished) ? (
          <StatusBadge status={match.status} elapsed={match.elapsed} />
        ) : (
          <span className="text-[9px] text-slate-600">{formatDate(match.date)}</span>
        )}
      </div>

      {/* Home team */}
      <TeamRow
        team={match.homeTeam}
        score={match.homeScore}
        isWinner={homeWins}
        showScore={showScore}
        track={match.homeTeam ? anthems[match.homeTeam.code] : undefined}
        silencedSong={match.homeTeam ? silencedSet?.has(match.homeTeam.code) : false}
      />

      {/* Divider */}
      <div className="h-px bg-brand-border mx-3" />

      {/* Away team */}
      <TeamRow
        team={match.awayTeam}
        score={match.awayScore}
        isWinner={awayWins}
        showScore={showScore}
        track={match.awayTeam ? anthems[match.awayTeam.code] : undefined}
        silencedSong={match.awayTeam ? silencedSet?.has(match.awayTeam.code) : false}
      />

      {/* Predict strip — shown on upcoming matches with known teams */}
      {!isTbd && !finished && !live && match.fixture > 0 && (
        <div className="px-3 py-1.5 border-t border-brand-border bg-brand-gold/5 flex items-center justify-between">
          <span className="text-[9px] text-slate-600 uppercase tracking-widest">Predict</span>
          <span className="text-[9px] font-semibold text-brand-gold">→ score</span>
        </div>
      )}

      {/* TBD predict placeholder */}
      {isTbd && (
        <div className="px-3 py-1.5 border-t border-brand-border flex items-center justify-between opacity-30">
          <span className="text-[9px] text-slate-600 uppercase tracking-widest">Predict</span>
          <span className="text-[9px] text-slate-600">awaiting qualifier</span>
        </div>
      )}
    </div>
  );

  // Make clickable only if it's a real seeded match
  if (match.fixture > 0 && !finished) {
    return (
      <Link href={`/predict?match=${match.fixture}`} className="block group">
        {cardContent}
      </Link>
    );
  }
  if (match.fixture > 0) {
    return (
      <Link href={`/schedule/${match.fixture}`} className="block">
        {cardContent}
      </Link>
    );
  }

  return cardContent;
}

function RoundColumn({
  round,
  matches,
  highlight,
  anthems,
  silencedSet,
}: {
  round: KnockoutRound;
  matches: BracketMatch[];
  highlight: boolean;
  anthems?: Record<string, Track>;
  silencedSet?: Set<string>;
}) {
  return (
    <div className="flex flex-col min-w-[180px] max-w-[200px] shrink-0">
      {/* Round header */}
      <div
        className={`mb-3 px-3 py-1.5 rounded-lg text-center ${
          highlight
            ? "bg-brand-gold/20 border border-brand-gold/40"
            : "bg-brand-card border border-brand-border"
        }`}
      >
        <div
          className={`text-[11px] font-black uppercase tracking-widest ${
            highlight ? "text-brand-gold" : "text-slate-400"
          }`}
        >
          {round}
        </div>
      </div>

      {/* Match cards stacked vertically */}
      <div className="flex flex-col gap-2">
        {matches.map((m) => (
          <MatchCard key={m.id} match={m} anthems={anthems} silencedSet={silencedSet} />
        ))}
      </div>
    </div>
  );
}

const ROUNDS_TOP_TO_BOTTOM: KnockoutRound[] = [
  "Final",
  "3rd Place Final",
  "Semi-finals",
  "Quarter-finals",
  "Round of 16",
  "Round of 32",
];

// ── Main bracket view ─────────────────────────────────────────────────────────

export default function BracketView({
  rounds,
  anthems = {},
  songsStanding,
  unresolvedPens = 0,
  champion = null,
  silenced = [],
}: Props) {
  const [activeRound, setActiveRound] = useState<KnockoutRound>("Round of 32");
  const silencedSet = new Set(silenced);
  const championTrack = champion ? anthems[champion.code] : undefined;

  // Detect if any round has live or completed matches (to highlight it)
  const liveRound = ALL_ROUNDS.find((r) =>
    rounds[r].some((m) => isLive(m.status))
  );
  const highlightRound = liveRound ?? null;

  return (
    <>
      {/* ── The Soundtrack Survives ─────────────────────────────────────────── */}
      {champion ? (
        <div className="mb-5 rounded-2xl border border-brand-gold/40 bg-gradient-to-r from-brand-gold/15 via-brand-card to-brand-card px-5 py-4 flex flex-wrap items-center gap-3">
          <span className="text-2xl">🏆</span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-widest text-brand-gold">The Last Song Standing</div>
            <div className="text-sm font-black text-white truncate">
              {championTrack ? `“${championTrack.title}” — ` : ""}{champion.name}
            </div>
          </div>
          {championTrack && <AnthemNote track={championTrack} isSilenced={false} />}
          <ShareButton
            text={`The Last Song Standing 🏆 ${championTrack ? `“${championTrack.title}” — ` : ""}${champion.name} take the anthem crown · studio0x.io`}
            url="/bracket"
            title="The Last Song Standing"
          />
        </div>
      ) : songsStanding !== undefined && (
        <div className="mb-5 rounded-2xl border border-brand-border bg-brand-card px-5 py-3.5 flex flex-wrap items-center gap-3">
          <Music2 size={15} className="text-brand-gold shrink-0" />
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-gold">Songs Still Standing</span>
            <span className="text-xl font-black text-white tabular-nums">{songsStanding}</span>
            <span className="text-[10px] text-slate-600">of 48 anthems · one falls with every knockout</span>
          </div>
          <span className="ml-auto text-[9px] text-slate-600">
            ♪ on every card plays that nation’s anthem{unresolvedPens > 0 ? ` · ${unresolvedPens} penalty tie awaiting confirmed winner — both songs still count` : ""}
          </span>
        </div>
      )}

      {/* ── Mobile: round tabs + single column ─────────────────────────────── */}
      <div className="lg:hidden">
        {/* Tab bar */}
        <div className="flex gap-1 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {ALL_ROUNDS.map((r) => {
            const hasLive = rounds[r].some((m) => isLive(m.status));
            const hasFt = rounds[r].some((m) => isFinished(m.status) && m.fixture > 0);
            return (
              <button
                key={r}
                onClick={() => setActiveRound(r)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${
                  activeRound === r
                    ? "bg-brand-gold text-brand-dark"
                    : hasLive
                    ? "bg-brand-green/20 text-brand-green border border-brand-green/30"
                    : hasFt
                    ? "bg-brand-card text-slate-300 border border-slate-600"
                    : "bg-brand-card text-slate-500 border border-brand-border"
                }`}
              >
                {ROUND_SHORT[r]}
              </button>
            );
          })}
        </div>

        {/* Active round title */}
        <h2 className="text-lg font-black text-white mb-4">{activeRound}</h2>

        {/* Cards for selected round */}
        <div className="flex flex-col gap-3">
          {rounds[activeRound].map((m) => (
            <MatchCard key={m.id} match={m} anthems={anthems} silencedSet={silencedSet} />
          ))}
        </div>
      </div>

      {/* ── Desktop: top-down pyramid bracket ───────────────────────────────── */}
      <div className="hidden lg:block">
        {/* Header */}
        <div className="mb-6 text-center">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">
            podiumMetrics · Knockout Stage
          </p>
        </div>

        {/* Rounds stacked top-to-bottom: Final → R32 */}
        <div className="space-y-6">
          {ROUNDS_TOP_TO_BOTTOM.map((r) => {
            const matches = rounds[r];
            const isHighlight = highlightRound === r;
            return (
              <div key={r}>
                {/* Round label + divider */}
                <div className="flex items-center gap-3 mb-3">
                  <h3
                    className={`text-[11px] font-black uppercase tracking-widest shrink-0 ${
                      isHighlight ? "text-brand-gold" : "text-slate-500"
                    }`}
                  >
                    {r}
                  </h3>
                  <div
                    className={`flex-1 h-px ${
                      isHighlight ? "bg-brand-gold/40" : "bg-brand-border"
                    }`}
                  />
                </div>

                {/* Match cards in a wrapping horizontal row */}
                <div className="flex flex-wrap gap-3 justify-center">
                  {matches.map((m) => (
                    <div key={m.id} className="min-w-[160px] max-w-[200px] flex-1">
                      <MatchCard match={m} anthems={anthems} silencedSet={silencedSet} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <p className="mt-6 text-center text-[10px] font-mono text-slate-700">
          Knockout stage · Round of 32 → Final · Jun 28 – Jul 19
        </p>
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────────── */}
      <div className="mt-8 flex items-center gap-4 text-[10px] text-slate-600 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-brand-green" />
          <span>LIVE</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded bg-brand-gold/30" />
          <span>Winner highlighted</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded bg-slate-700" />
          <span>TBD — awaiting group stage</span>
        </div>
        <div className="ml-auto text-[9px] font-mono text-slate-700">studio0x</div>
      </div>
    </>
  );
}
