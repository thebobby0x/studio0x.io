import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          green:  "#10b981",
          gold:   "#f59e0b",
          blue:   "#3b82f6",
          dark:   "#060b18",
          card:   "#0d1828",
          border: "#182a42",
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
