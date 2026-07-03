import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Brand colors resolve to CSS variables (RGB triples in globals.css) so
        // the whole app re-skins via [data-theme] — dark (default) and light —
        // while alpha modifiers (bg-brand-gold/10 etc) keep working.
        brand: {
          green:  "rgb(var(--green) / <alpha-value>)",
          gold:   "rgb(var(--gold) / <alpha-value>)",
          blue:   "rgb(var(--blue) / <alpha-value>)",
          dark:   "rgb(var(--bg) / <alpha-value>)",
          card:   "rgb(var(--card) / <alpha-value>)",
          border: "rgb(var(--border) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
