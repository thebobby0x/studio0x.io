"use client";

// Universal share button.
// Mobile: opens the NATIVE share sheet (navigator.share) — the only route
// into Instagram Stories/Reels, WhatsApp, iMessage, etc. from the web.
// Desktop (no Web Share API): a compact popover with X, LinkedIn, WhatsApp,
// Facebook and copy-link.
//
// `url` may be a path ("/schedule/123") — it resolves against the current
// origin at click time, so preview and production links are always correct.
// Omit it to share the page you're on.

import { useCallback, useEffect, useRef, useState } from "react";
import { Share2, Copy, Check, Twitter, Linkedin, Facebook, MessageCircle } from "lucide-react";

interface Props {
  /** The text to share (headline, commentary line, score line…) */
  text: string;
  /** Path or absolute URL to attach. Defaults to the current page. */
  url?: string;
  /** Share-sheet title (native share only) */
  title?: string;
  /** Visual style: bare icon (default) or a labeled pill */
  variant?: "icon" | "pill";
  /** Extra classes on the trigger button */
  className?: string;
}

function resolveUrl(url?: string): string {
  if (typeof window === "undefined") return url ?? "";
  return url ? new URL(url, window.location.origin).toString() : window.location.href;
}

export default function ShareButton({ text, url, title = "studio0x · World Cup 2026", variant = "icon", className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close the popover on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
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

  const handleShare = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const shareUrl = resolveUrl(url);
    // Native share sheet when available (mobile) — covers IG stories/reels,
    // WhatsApp, iMessage and every installed app.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url: shareUrl });
        return;
      } catch {
        // user cancelled or share failed — fall through to popover
      }
    }
    setOpen(o => !o);
  }, [text, title, url]);

  const openIntent = useCallback((network: "x" | "linkedin" | "whatsapp" | "facebook") => {
    const shareUrl = resolveUrl(url);
    const enc = encodeURIComponent;
    const intents: Record<typeof network, string> = {
      x:        `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(shareUrl)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(shareUrl)}`,
      whatsapp: `https://wa.me/?text=${enc(`${text} ${shareUrl}`)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${enc(shareUrl)}&quote=${enc(text)}`,
    };
    window.open(intents[network], "_blank", "noopener,noreferrer,width=600,height=500");
    setOpen(false);
  }, [text, url]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${text} ${resolveUrl(url)}`);
      setCopied(true);
      setTimeout(() => { setCopied(false); setOpen(false); }, 1200);
    } catch {
      setOpen(false);
    }
  }, [text, url]);

  const items = [
    { key: "x" as const,        label: "Post on X",  icon: <Twitter size={12} /> },
    { key: "linkedin" as const, label: "LinkedIn",   icon: <Linkedin size={12} /> },
    { key: "whatsapp" as const, label: "WhatsApp",   icon: <MessageCircle size={12} /> },
    { key: "facebook" as const, label: "Facebook",   icon: <Facebook size={12} /> },
  ];

  return (
    <div ref={rootRef} className="relative inline-flex">
      {variant === "pill" ? (
        <button
          onClick={handleShare}
          title="Share"
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 ${className}`}
        >
          <Share2 size={12} />
          Share
        </button>
      ) : (
        <button
          onClick={handleShare}
          title="Share"
          className={`flex items-center justify-center w-6 h-6 rounded-full bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 transition-colors ${className}`}
        >
          <Share2 size={11} />
        </button>
      )}

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[150px] rounded-xl bg-brand-card border border-brand-border shadow-xl shadow-black/40 overflow-hidden">
          {items.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => openIntent(key)}
              className="flex items-center gap-2.5 w-full px-3.5 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors text-left"
            >
              <span className="text-sky-400">{icon}</span>
              {label}
            </button>
          ))}
          <button
            onClick={handleCopy}
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors text-left border-t border-brand-border/50"
          >
            <span className={copied ? "text-brand-green" : "text-sky-400"}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </span>
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      )}
    </div>
  );
}
