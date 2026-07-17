"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { METRIC_INFO } from "@/lib/metricInfo";

// "i" popover explaining a proprietary metric (owner request 7/17).
// Tap/click to open (mobile-first), outside-click or Escape to close.
export default function InfoTip({ metric }: { metric: string }) {
  const info = METRIC_INFO[metric];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!info) return null;

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label={`What is ${info.name}?`}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className={`inline-flex items-center justify-center transition-colors ${open ? "text-brand-gold" : "text-slate-600 hover:text-slate-400"}`}
      >
        <Info size={11} strokeWidth={2.5} />
      </button>
      {open && (
        <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-60 rounded-xl border border-brand-border bg-brand-dark shadow-xl shadow-black/50 p-3 text-left">
          <span className="block text-[10px] font-black uppercase tracking-widest text-brand-gold">{info.name}</span>
          <span className="block text-[11px] leading-relaxed text-slate-300 mt-1 normal-case font-normal tracking-normal">{info.blurb}</span>
          <span className="block text-[8px] text-slate-700 font-mono mt-1.5">studio0x proprietary metric</span>
        </span>
      )}
    </span>
  );
}
