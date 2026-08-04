import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Brand colors resolve to CSS variables (RGB triples in globals.css) so
        // the whole app re-skins via [data-theme] — dark (default) and light —
        // while alpha modifiers (bg-brand-gold/10 etc) keep working.
        //
        // LC26 skin (Gaming UI / dark HUD): the legacy names now point at the
        // official studio0x palette — gold→Rosa 200, green/blue→Riptide teal,
        // dark/card/border→Noir 900/800/700. Nothing outside globals.css needs
        // to know; ~130 components re-skin from the vars.
        brand: {
          green:  "rgb(var(--green) / <alpha-value>)",
          gold:   "rgb(var(--gold) / <alpha-value>)",
          blue:   "rgb(var(--blue) / <alpha-value>)",
          dark:   "rgb(var(--bg) / <alpha-value>)",
          card:   "rgb(var(--card) / <alpha-value>)",
          border: "rgb(var(--border) / <alpha-value>)",
        },
        // Explicit studio0x tokens — use these on NEW surfaces. Every value is
        // from the official palette; no arbitrary colors anywhere.
        s0x: {
          bg:      "rgb(var(--s0x-bg) / <alpha-value>)",       // Noir 900 #0F0C0E
          surface: "rgb(var(--s0x-surface) / <alpha-value>)",  // Noir 800 #1D191C
          border:  "rgb(var(--s0x-border) / <alpha-value>)",   // Noir 700 #312C2F
          text:    "rgb(var(--s0x-text) / <alpha-value>)",     // Bone 50  #FAF5F7
          muted:   "rgb(var(--s0x-muted) / <alpha-value>)",    // #9A8F95
          accent:  "rgb(var(--s0x-accent) / <alpha-value>)",   // Rosa 200 #F8BDD8
          ink:     "rgb(var(--s0x-accent-ink) / <alpha-value>)", // Rosa 700 #CA358B
          teal:    "rgb(var(--s0x-teal) / <alpha-value>)",     // Riptide  #5DCBD1
          // Fixed anchors — do NOT flip with the theme. `onink` is what goes ON
          // a Rosa 700 / Riptide fill (Bone 50); `noir` is what goes on a light
          // Rosa 200 fill. Using `text` on an accent fill breaks lite-mode contrast.
          onink:   "rgb(var(--s0x-on-accent) / <alpha-value>)", // Bone 50 #FAF5F7
          noir:    "rgb(var(--s0x-noir) / <alpha-value>)",      // Noir 900 #0F0C0E
        },
      },
      fontFamily: {
        // Body copy — Instrument Sans. `sans` is Tailwind's default family, so
        // every unstyled surface picks this up for free.
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        // Display / headings — Archivo (variable wdth axis; see .display-* utils).
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        // Labels, data, scores, timers — IBM Plex Mono.
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        s0x: "var(--s0x-radius)",
      },
      boxShadow: {
        "glow-rosa": "var(--s0x-glow-rosa)",
        "glow-teal": "var(--s0x-glow-teal)",
      },
      letterSpacing: {
        // The mono label tracking the studio0x guide calls for (+14%).
        hud: "0.14em",
      },
      keyframes: {
        hudSweep: {
          "0%":   { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(400%)" },
        },
      },
      animation: {
        "hud-sweep": "hudSweep 6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
