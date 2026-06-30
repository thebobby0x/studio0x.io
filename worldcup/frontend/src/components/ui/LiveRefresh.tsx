"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Auto-refreshes server component data while a match is live.
// Mounts only when isLive=true; unmounts (and clears interval) when match ends.
export default function LiveRefresh({ isLive }: { isLive: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!isLive) return;
    // Refresh server data every 20s so status, scores and minute stay current
    const id = setInterval(() => router.refresh(), 20_000);
    // Also refresh when the tab comes back into view (user switching back mid-match).
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
