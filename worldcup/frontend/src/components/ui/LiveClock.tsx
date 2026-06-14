"use client";

import { useEffect, useRef, useState } from "react";

export default function LiveClock() {
  const [display, setDisplay] = useState("");
  const offsetRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function sync() {
      try {
        const t0 = Date.now();
        const res = await fetch("/api/time");
        const t1 = Date.now();
        const { ts } = await res.json() as { ts: number };
        // Adjust for half the round-trip latency
        offsetRef.current = ts - Math.round((t0 + t1) / 2);
      } catch {
        offsetRef.current = 0;
      }
    }

    function tick() {
      const now = new Date(Date.now() + offsetRef.current);
      setDisplay(
        now.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    }

    sync().then(() => {
      tick();
      tickRef.current = setInterval(tick, 1000);
    });

    // Re-sync every 5 minutes to correct drift
    const syncInterval = setInterval(sync, 5 * 60 * 1000);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      clearInterval(syncInterval);
    };
  }, []);

  if (!display) return null;

  return (
    <span className="tabular-nums text-[11px] text-slate-400 font-mono tracking-wide">
      {display}
    </span>
  );
}
