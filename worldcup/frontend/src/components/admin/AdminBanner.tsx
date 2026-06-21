"use client";

import { useEffect, useState } from "react";
import { Shield } from "lucide-react";

const LABELS: Record<string, string> = {
  ADMIN: "Admin / White Label",
  USER: "End User",
};

export default function AdminBanner() {
  const [viewAs, setViewAs] = useState<string | null>(null);

  useEffect(() => {
    const v = document.cookie.match(/studio0x_view_as=([^;]+)/)?.[1];
    if (v && v !== "SUPER_ADMIN") setViewAs(v);
  }, []);

  if (!viewAs) return null;

  async function reset() {
    await fetch("/api/admin/view-as", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "SUPER_ADMIN" }),
    });
    document.cookie = "studio0x_view_as=SUPER_ADMIN;path=/";
    setViewAs(null);
    window.location.reload();
  }

  return (
    <div className="sticky top-14 z-40 bg-amber-500 text-black text-xs font-bold flex items-center justify-between px-4 py-1.5">
      <div className="flex items-center gap-2">
        <Shield size={12} />
        Viewing as: {LABELS[viewAs] ?? viewAs}
      </div>
      <button onClick={reset} className="underline hover:no-underline">
        Back to Super Admin
      </button>
    </div>
  );
}
