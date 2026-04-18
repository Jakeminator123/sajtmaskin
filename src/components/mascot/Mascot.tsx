"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Single entry point for the Sajtmaskin mascot across the product.
 *
 * All source PNGs live in /public/mascot/ and are transparent. Each slot maps
 * to a specific scene painted in Nano Banana Pro against the same canonical
 * robot character (see scripts/mascot/convert-mascots.sh for the build
 * pipeline). Callers pick the slot; the component handles aspect ratio,
 * intrinsic size, and default classes for a consistent feel.
 */
export type MascotSlot =
  | "master"
  | "hero"
  | "empty-state"
  | "thinking"
  | "celebrate"
  | "lost-in-space"
  | "error"
  | "wave"
  | "thumbs-up"
  | "key"
  | "headshot"
  | "listening"
  | "templates";

type AssetDef = {
  src: string;
  width: number;
  height: number;
  alt: string;
};

const ASSETS: Record<MascotSlot, AssetDef> = {
  master: { src: "/mascot/master.png", width: 555, height: 734, alt: "Sajtmaskin-maskoten" },
  hero: { src: "/mascot/hero.png", width: 527, height: 762, alt: "Sajtmaskin-maskoten vinkar" },
  "empty-state": {
    src: "/mascot/empty-state.png",
    width: 510,
    height: 743,
    alt: "Maskoten tittar fram",
  },
  thinking: {
    src: "/mascot/thinking.png",
    width: 993,
    height: 973,
    alt: "Maskoten granskar en ritning",
  },
  celebrate: {
    src: "/mascot/celebrate.png",
    width: 678,
    height: 900,
    alt: "Maskoten firar",
  },
  "lost-in-space": {
    src: "/mascot/lost-in-space.png",
    width: 1351,
    height: 1149,
    alt: "Maskoten svävar i rymden",
  },
  error: { src: "/mascot/error.png", width: 621, height: 733, alt: "Maskoten ser ursäktande ut" },
  wave: { src: "/mascot/wave.png", width: 538, height: 759, alt: "Maskoten vinkar" },
  "thumbs-up": {
    src: "/mascot/thumbs-up.png",
    width: 690,
    height: 925,
    alt: "Maskoten ger tummen upp",
  },
  key: { src: "/mascot/key.png", width: 432, height: 352, alt: "Maskoten håller ett nyckelkort" },
  headshot: { src: "/mascot/headshot.png", width: 555, height: 555, alt: "Maskoten — porträtt" },
  listening: {
    src: "/mascot/listening.png",
    width: 585,
    height: 564,
    alt: "Maskoten lyssnar med en parabolantenn",
  },
  templates: {
    src: "/mascot/templates.png",
    width: 695,
    height: 724,
    alt: "Maskoten bland skärmar",
  },
};

export interface MascotProps {
  slot: MascotSlot;
  /**
   * Explicit pixel size. For landscape slots it sets width; for portrait
   * slots it sets height. When omitted, the component renders responsively
   * and the caller controls sizing via `className` (e.g. `h-auto w-full
   * max-w-[360px]`).
   */
  size?: number;
  className?: string;
  priority?: boolean;
  /** Decorative mascots should not be announced by assistive tech. */
  decorative?: boolean;
}

export function Mascot({
  slot,
  size,
  className,
  priority = false,
  decorative = false,
}: MascotProps) {
  const asset = ASSETS[slot];
  const isWide = asset.width > asset.height;

  let inlineStyle: React.CSSProperties | undefined;
  if (size !== undefined) {
    const displayWidth = isWide
      ? size
      : Math.round((size * asset.width) / asset.height);
    const displayHeight = isWide
      ? Math.round((size * asset.height) / asset.width)
      : size;
    inlineStyle = { width: displayWidth, height: displayHeight };
  }

  return (
    <Image
      src={asset.src}
      width={asset.width}
      height={asset.height}
      alt={decorative ? "" : asset.alt}
      aria-hidden={decorative || undefined}
      priority={priority}
      className={cn("select-none", className)}
      style={inlineStyle}
      draggable={false}
    />
  );
}
