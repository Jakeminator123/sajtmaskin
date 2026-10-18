"use client";

import type { CSSProperties } from "react";

/** Pre-cropped 3:4 poster of the card face — LCP on mobile, no CSS crop needed. */
const CARD_IMAGE = "/branding/lanyard-card-static.webp";
const CARD_WIDTH = 360;
const CARD_HEIGHT = 480;

export const LANYARD_CARD_GRAIN_STYLE: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 4px)",
};

export function LanyardBrandFace({
  className = "",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden bg-[#070b10] ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={CARD_IMAGE}
        alt=""
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        fetchPriority={priority ? "high" : "auto"}
        aria-hidden="true"
        className="h-full w-full object-cover"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-20 mix-blend-soft-light"
        style={LANYARD_CARD_GRAIN_STYLE}
      />
      <span className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/10" />
    </div>
  );
}

/** Statiskt hängande kort — fyller hero medan 3D-chunken/WebGL startar. */
export function StaticLanyardFallback() {
  return (
    <div
      data-testid="lanyard-static"
      aria-hidden="true"
      className="flex h-full w-full flex-col items-center justify-start overflow-visible pt-0"
    >
      <span
        className="block h-[22%] min-h-8 w-[6px] shrink-0 rounded-full md:h-[28%] md:min-h-10"
        style={{
          background:
            "linear-gradient(180deg, rgba(45,212,191,0) 0%, rgba(45,212,191,0.55) 22%, rgba(45,212,191,0.95) 100%)",
          boxShadow: "0 0 14px rgba(45,212,191,0.45)",
        }}
      />
      <LanyardBrandFace
        priority
        className="relative mt-1 aspect-[3/4] w-[min(40vw,140px)] shrink-0 rounded-[26px] shadow-2xl ring-1 ring-primary/30 md:w-[min(60vw,220px)]"
      />
    </div>
  );
}
