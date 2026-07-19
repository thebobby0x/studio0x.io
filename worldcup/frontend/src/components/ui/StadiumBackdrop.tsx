// ─────────────────────────────────────────────────────────────────────────────
// StadiumBackdrop — original SVG stadium-night art (owner request 7/17:
// "visually exciting and engaging"). Drawn in code, not photography: the
// session's network policy blocks image CDNs, so external photos can't be
// fetched or verified — and unverified hotlinks risk broken images. This is
// license-clean by construction and guaranteed to render.
// Variants: "gold" (showcase) · "crown" (champions — brighter, confetti).
// Purely decorative: aria-hidden, pointer-events-none, sits behind content.
// ─────────────────────────────────────────────────────────────────────────────

export default function StadiumBackdrop({ variant = "gold" }: { variant?: "gold" | "crown" }) {
  const crown = variant === "crown";
  const p = crown ? "sbc" : "sbg"; // gradient id prefix — avoids collisions if both render
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden select-none">
      {/* Real photography layer (owner 7/19 — network policy opened): a
          verified, license-clean Unsplash stadium night shot (see
          public/img/CREDITS.md), self-hosted, at low opacity under the SVG
          line-art and a dark gradient so text stays legible. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/img/stadium-night.jpg"
        alt=""
        className={`absolute inset-0 w-full h-full object-cover ${crown ? "opacity-30" : "opacity-25"}`}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/60 via-brand-card/70 to-brand-card/90" />
      <svg className="w-full h-full" viewBox="0 0 800 420" preserveAspectRatio="xMidYMid slice">
        <defs>
          {/* night-sky wash */}
          <radialGradient id={`${p}-sky`} cx="50%" cy="-10%" r="90%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity={crown ? 0.22 : 0.14} />
            <stop offset="45%" stopColor="#f59e0b" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
          {/* floodlight beam */}
          <linearGradient id={`${p}-beam`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fde68a" stopOpacity={crown ? 0.30 : 0.20} />
            <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
          </linearGradient>
          {/* pitch glow rising from the bottom edge */}
          <linearGradient id={`${p}-pitch`} x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.10" />
            <stop offset="60%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>

        <rect width="800" height="420" fill={`url(#${p}-sky)`} />

        {/* crossed floodlight beams from the two top corners */}
        <polygon points="40,-20 140,-20 360,420 200,420" fill={`url(#${p}-beam)`} />
        <polygon points="660,-20 760,-20 600,420 440,420" fill={`url(#${p}-beam)`} />

        {/* stadium bowl rim — two sweeping tiers */}
        <path d="M -40 300 Q 400 180 840 300" fill="none" stroke="#182a42" strokeWidth="2.5" />
        <path d="M -40 330 Q 400 216 840 330" fill="none" stroke="#182a42" strokeWidth="1.5" opacity="0.8" />

        {/* floodlight masts on the rim */}
        {[120, 280, 520, 680].map((x) => {
          const yTop = 240 - Math.sin((x / 800) * Math.PI) * 46;
          return (
            <g key={x}>
              <line x1={x} y1={yTop + 60} x2={x} y2={yTop} stroke="#182a42" strokeWidth="2" />
              <rect x={x - 12} y={yTop - 8} width="24" height="8" rx="2" fill="#f59e0b" opacity={crown ? 0.9 : 0.6} />
            </g>
          );
        })}

        {/* pitch line-art: halfway line + centre circle breaking the bottom edge */}
        <rect y="300" width="800" height="120" fill={`url(#${p}-pitch)`} />
        <circle cx="400" cy="470" r="130" fill="none" stroke="#10b981" strokeOpacity="0.25" strokeWidth="2" />
        <circle cx="400" cy="470" r="6" fill="#10b981" fillOpacity="0.35" />
        <line x1="0" y1="470" x2="800" y2="470" stroke="#10b981" strokeOpacity="0.2" strokeWidth="2" />

        {/* crown variant: gold confetti falling through the beams */}
        {crown &&
          [
            [90, 80, 3], [180, 150, 2], [260, 60, 2.5], [340, 190, 2], [420, 90, 3],
            [500, 160, 2], [580, 70, 2.5], [660, 140, 2], [730, 90, 3], [150, 230, 2],
            [640, 220, 2.5], [390, 250, 2],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill={i % 3 === 0 ? "#fde68a" : "#f59e0b"} opacity="0.7" />
          ))}
      </svg>
    </div>
  );
}
