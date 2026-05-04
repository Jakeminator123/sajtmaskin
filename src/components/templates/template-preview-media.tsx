"use client";

import { useEffect, useMemo, useState } from "react";

type TemplatePreviewMediaProps = {
  title: string;
  stillUrl: string;
  loopUrl?: string | null;
  loopKind?: string | null;
  frameUrls?: string[];
  frameDurationMs?: number | null;
  className?: string;
};

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

export function TemplatePreviewMedia({
  title,
  stillUrl,
  loopUrl,
  loopKind,
  frameUrls,
  frameDurationMs,
  className = "h-full w-full object-cover",
}: TemplatePreviewMediaProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const frames = useMemo(
    () => (Array.isArray(frameUrls) ? frameUrls.filter(Boolean).slice(0, 12) : []),
    [frameUrls],
  );
  const [frameIndex, setFrameIndex] = useState(0);
  const shouldAnimateFrames = !prefersReducedMotion && loopKind === "frames" && frames.length >= 2;

  useEffect(() => {
    if (!shouldAnimateFrames) return;
    const interval = window.setInterval(
      () => setFrameIndex((current) => (current + 1) % frames.length),
      Math.max(150, frameDurationMs ?? 500),
    );
    return () => window.clearInterval(interval);
  }, [frameDurationMs, frames.length, shouldAnimateFrames]);

  if (!prefersReducedMotion && loopUrl) {
    if (loopKind === "video") {
      return (
        <video
          src={loopUrl}
          className={className}
          aria-label={title}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          poster={stillUrl}
        />
      );
    }

    // eslint-disable-next-line @next/next/no-img-element
    return <img src={loopUrl} alt={title} className={className} loading="lazy" />;
  }

  const imageUrl = shouldAnimateFrames ? frames[frameIndex] : stillUrl;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={imageUrl} alt={title} className={className} loading="lazy" />;
}
