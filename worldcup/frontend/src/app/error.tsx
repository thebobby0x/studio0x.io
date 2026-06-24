"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Dashboard error]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-brand-dark text-slate-200 flex items-center justify-center">
      <div className="text-center space-y-4 px-4">
        <div className="text-4xl">⚽</div>
        <h2 className="text-xl font-black text-white">Something went wrong</h2>
        <p className="text-slate-500 text-sm max-w-xs mx-auto">
          Live data failed to load. The match is still happening — tap below to reload.
        </p>
        <button
          onClick={reset}
          className="mt-4 px-6 py-2.5 bg-brand-gold text-brand-dark font-black rounded-xl text-sm hover:bg-amber-400 transition-colors"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
