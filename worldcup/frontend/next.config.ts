import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Inline the deployment selector into the CLIENT bundle.
  //
  // `TOURNAMENT` is server-only — Next.js inlines just NEXT_PUBLIC_* — so every
  // "use client" module read `process.env.TOURNAMENT` as undefined and fell back
  // to the World Cup config. The server rendered Leagues Cup while the browser
  // ran WC26 dates. `env` here resolves the SERVER value at build time and emits
  // it as NEXT_PUBLIC_TOURNAMENT, so setting the public var in Vercel is belt-
  // and-braces rather than a requirement (and Preview deploys, which don't have
  // it set, still get the right config).
  env: {
    NEXT_PUBLIC_TOURNAMENT:
      process.env.NEXT_PUBLIC_TOURNAMENT ?? process.env.TOURNAMENT ?? "worldcup",
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "flagcdn.com" },
      { protocol: "https", hostname: "crests.football-data.org" },
      { protocol: "https", hostname: "media.api-sports.io" },
    ],
  },
};

export default nextConfig;
