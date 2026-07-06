"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Auto-refreshes server component data while a match is live.
// Mounts only when isLive=true; unmounts (and clears interval) when match ends.
export default function LiveRefresh({ isLive }: { isLive: boolean }) {
  const router = useRouter();

  useEffect(() => {
    // Live: 12s so scores/minutes stay current. Idle: 90s so a tab left open
    // between games never sits stale (kickoffs, statuses, news still move).
    const interval = isLive ? 12_000 : 90_000;
    const id = setInterval(() => router.refresh(), interval);
    // Also refresh when the tab comes back into view (user switching back).
    // visibilitychange fires on BOTH hide and show — only refresh on show.
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isLive, router]);

  return null;
}
