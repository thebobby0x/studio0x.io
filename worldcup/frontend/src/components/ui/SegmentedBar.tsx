/**
 * SegmentedBar — the gaming-UI progress bar (owner spec 2026-08-05).
 *
 * Replaces every smooth/gradient fill in the stats surfaces with DISCRETE
 * segments carrying a 45° diagonal hatch, a neon glow, and an optional
 * circuit-board frame. All visual treatment lives in globals.css under the
 * `.seg-*` block; this file owns only geometry and data.
 *
 * HOW THE FILL STAYS HONEST: the fill element's width is the exact percentage
 * (never rounded to a whole segment), and a gap overlay is painted ON TOP of
 * both the filled and empty regions. So the bar reads as discrete blocks while
 * a 47% value is still drawn at 47% — segmentation is a texture, not a
 * quantisation of the data.
 *
 * COLORS: `cyan` and `red` map to --seg-cyan / --seg-red in globals.css, which
 * carry the owner-specified reference hexes (#00D9FF / #E94560). See the note
 * in globals.css about how those relate to the studio0x Riptide/Rosa tokens.
 */
import type { CSSProperties } from "react";

export type SegmentedBarColor = "cyan" | "red";
export type SegmentedBarDirection = "ltr" | "rtl";

export interface SegmentedBarProps {
  /** Raw value. Typically 0–100, but any scale works via `maxValue`. */
  value: number;
  /** Denominator for the fill percentage. Defaults to 100. */
  maxValue?: number;
  /** Which edge the fill grows from. `rtl` = anchored right, grows leftward. */
  direction?: SegmentedBarDirection;
  color?: SegmentedBarColor;
  /** Overlaid readout (IBM Plex Mono). Rendered at the fill's anchor edge. */
  label?: string;
  /** Number of discrete blocks. More blocks = finer texture. */
  segments?: number;
  /** Track height in px. */
  height?: number;
  /** Wrap in the neon circuit-board frame. Off for dense list rows. */
  circuit?: boolean;
  className?: string;
  /** Screen-reader description. Falls back to the label, then the percentage. */
  ariaLabel?: string;
}

function pctOf(value: number, maxValue: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(maxValue) || maxValue <= 0) return 0;
  return Math.min(100, Math.max(0, (value / maxValue) * 100));
}

export default function SegmentedBar({
  value,
  maxValue = 100,
  direction = "ltr",
  color = "cyan",
  label,
  segments = 20,
  height = 12,
  circuit = false,
  className = "",
  ariaLabel,
}: SegmentedBarProps) {
  const pct = pctOf(value, maxValue);

  const bar = (
    <div
      className={`seg ${circuit ? "" : className}`}
      data-color={color}
      data-dir={direction}
      style={{ "--seg-n": segments, "--seg-h": `${height}px` } as CSSProperties}
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel ?? label ?? `${Math.round(pct)}%`}
    >
      <span className="seg-fill" style={{ width: `${pct}%` }} />
      {/* Gap overlay sits above the fill so blocks read across the whole track. */}
      <span className="seg-grid" aria-hidden="true" />
      {label && <span className="seg-label" aria-hidden="true">{label}</span>}
    </div>
  );

  if (!circuit) return bar;
  return <div className={`seg-frame s0x-circuit ${className}`}>{bar}</div>;
}

export interface SegmentedVersusBarProps {
  /** Home-side raw value (fills cyan, left → right). */
  home: number;
  /** Away-side raw value (fills red, right → left). */
  away: number;
  homeLabel?: string;
  awayLabel?: string;
  segments?: number;
  height?: number;
  circuit?: boolean;
  className?: string;
  /**
   * `true` (default): home/away are shares of each other — they always sum to
   * 100% of the track and meet at the split point.
   * `false`: they are literal percentages of the track, so any remainder stays
   * unlit in the middle. Used by the three-way win probability, where that
   * middle gap IS the draw share.
   */
  normalize?: boolean;
  /** Describes the whole duel for screen readers. */
  ariaLabel?: string;
}

/**
 * Two opposing fills on ONE track: home grows from the left in cyan, away grows
 * from the right in red, and they meet at the split point (dead centre on a
 * 50/50). Shares normalise against the actual total, so a feed that reports one
 * side only can't overflow the track.
 */
export function SegmentedVersusBar({
  home,
  away,
  homeLabel,
  awayLabel,
  segments = 24,
  height = 14,
  circuit = false,
  className = "",
  normalize = true,
  ariaLabel,
}: SegmentedVersusBarProps) {
  const h = Number.isFinite(home) ? Math.max(0, home) : 0;
  const a = Number.isFinite(away) ? Math.max(0, away) : 0;
  const total = h + a;
  const empty = total <= 0;

  // Normalised: split the whole track. Literal: clamp so the pair can never
  // overflow, and leave the remainder unlit.
  const homePct = normalize ? (total > 0 ? (h / total) * 100 : 50) : Math.min(100, h);
  const awayPct = normalize ? 100 - homePct : Math.min(100 - homePct, a);

  const bar = (
    <div
      className={`seg seg-versus ${empty ? "seg-empty" : ""} ${circuit ? "" : className}`}
      data-dir="ltr"
      style={{ "--seg-n": segments, "--seg-h": `${height}px` } as CSSProperties}
      role="img"
      aria-label={ariaLabel ?? `${homeLabel ?? "Home"} ${Math.round(homePct)}%, ${awayLabel ?? "Away"} ${Math.round(awayPct)}%`}
    >
      <span className="seg-fill seg-fill-home" style={{ width: `${homePct}%` }} />
      <span className="seg-fill seg-fill-away" style={{ width: `${awayPct}%` }} />
      <span className="seg-grid" aria-hidden="true" />
      {homeLabel && <span className="seg-label" aria-hidden="true">{homeLabel}</span>}
      {awayLabel && <span className="seg-label seg-label-end" aria-hidden="true">{awayLabel}</span>}
    </div>
  );

  if (!circuit) return bar;
  return <div className={`seg-frame s0x-circuit ${className}`}>{bar}</div>;
}
