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
    // Also refresh when the tab comes back into focus (user switching back mid-match)
    const onFocus = () => router.refresh();
    window.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("visibilitychange", onFocus);
    };
  }, [isLive, router]);

  return null;
}
