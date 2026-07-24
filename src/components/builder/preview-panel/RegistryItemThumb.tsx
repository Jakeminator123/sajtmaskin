"use client";

import { useState } from "react";
import { ImageOff, Puzzle } from "lucide-react";

/**
 * Thumbnail för registry-kort (Bläddra-galleriet + Beskriv-kandidater).
 *
 * Registry-PNG:erna ligger hos externa hosts (ui.shadcn.com m.fl.) och kan
 * saknas för enskilda poster — en trasig <img> lämnade tidigare en tom/bruten
 * bildyta i kortet ("tomma placeholderbilder"). `onError` degraderar i stället
 * till en ärlig ikon-platshållare. Fallback-state är nycklat på src så en
 * senare fungerande bild (t.ex. annan post i detaljvyn) inte ärver felet.
 */
export function RegistryItemThumb({
  src,
  alt,
  fallbackLabel,
}: {
  src: string | null | undefined;
  alt: string;
  /** Sätt för detaljvyns större yta ("Ingen förhandsbild"); utelämnad = bara ikon. */
  fallbackLabel?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;

  if (showImage && src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-full w-full object-cover object-top"
        onError={() => setFailedSrc(src)}
      />
    );
  }

  if (fallbackLabel) {
    return (
      <div className="flex flex-col items-center gap-1 text-zinc-600">
        <ImageOff className="h-6 w-6" aria-hidden />
        <span className="text-[10px]">{fallbackLabel}</span>
      </div>
    );
  }

  return <Puzzle className="h-6 w-6 text-zinc-600" aria-hidden />;
}
