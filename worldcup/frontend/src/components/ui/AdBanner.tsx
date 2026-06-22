"use client";

import { useEffect, useState } from "react";

interface AdSlot {
  id: string;
  sponsorName: string;
  logoUrl: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  ctaText: string | null;
}

interface AdBannerProps {
  placement: string;
}

export default function AdBanner({ placement }: AdBannerProps) {
  const [slot, setSlot] = useState<AdSlot | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/ads/${placement}`)
      .then((res) => res.json())
      .then((data) => {
        setSlot(data.slot ?? null);
      })
      .catch(() => {
        // Fail silently
      })
      .finally(() => {
        setLoaded(true);
      });
  }, [placement]);

  // Not loaded yet or no slot — render nothing
  if (!loaded || !slot) return null;

  function handleClick() {
    fetch(`/api/ads/${placement}/click?slotId=${slot!.id}`, {
      method: "POST",
    }).catch(() => {});
  }

  const wrapperClass =
    "rounded-xl bg-brand-card border border-brand-border/50 p-3 flex items-center gap-3 text-xs text-slate-500";

  if (slot.imageUrl) {
    return (
      <a
        href={slot.linkUrl ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className={`${wrapperClass} overflow-hidden`}
      >
        <img
          src={slot.imageUrl}
          alt={`${slot.sponsorName} ad`}
          className="max-h-12 object-contain"
        />
      </a>
    );
  }

  // Text-only sponsor banner
  return (
    <div className={wrapperClass}>
      {slot.logoUrl && (
        <img
          src={slot.logoUrl}
          alt={slot.sponsorName}
          className="h-5 w-auto object-contain opacity-70"
        />
      )}
      <span>
        Presented by{" "}
        <a
          href={slot.linkUrl ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClick}
          className="text-slate-300 hover:text-white transition-colors font-medium"
        >
          {slot.sponsorName}
        </a>
        {slot.ctaText && (
          <>
            {" "}
            &middot;{" "}
            <a
              href={slot.linkUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleClick}
              className="text-brand-gold hover:text-amber-300 transition-colors"
            >
              {slot.ctaText}
            </a>
          </>
        )}
      </span>
    </div>
  );
}
