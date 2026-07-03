"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

const STORAGE_KEY = "studio0x_theme";

// Theme is applied to <html data-theme> by the inline script in layout.tsx
// BEFORE paint (no flash); this component just reflects + flips it.
export default function ThemeToggle({ size = 15, className = "" }: { size?: number; className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    setTheme(current);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch { /* private mode */ }
  }

  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Switch to lite mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
      className={`flex items-center justify-center text-slate-500 hover:text-brand-gold transition-colors ${className}`}
    >
      {theme === "dark" ? <Sun size={size} /> : <Moon size={size} />}
    </button>
  );
}
