"use client";

import { useState } from "react";

export function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback: select text
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="px-2 py-1 rounded-md bg-brand-border text-xs text-slate-400 hover:text-white hover:bg-slate-600 transition-colors font-mono truncate max-w-[120px] block"
      title={url}
    >
      {copied ? "copied!" : "copy URL"}
    </button>
  );
}
