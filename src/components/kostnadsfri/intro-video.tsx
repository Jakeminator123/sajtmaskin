"use client";

import { useCallback, useRef, useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  KOSTNADSFRI_INTRO_DURATION_LABEL,
  KOSTNADSFRI_INTRO_POSTER_URL,
  KOSTNADSFRI_INTRO_VIDEO_URL,
} from "@/lib/kostnadsfri/media";

/**
 * IntroVideo — the talking-avatar film that explains the kostnadsfri offer.
 *
 * Deliberately never autoplays: it is 3.5 minutes of speech, so the default
 * state is poster + play affordance. Native `controls` stay on the element the
 * whole time; the overlay is only a larger, labelled click target that hides
 * itself once playback starts (including when started from the native bar).
 */

interface IntroVideoProps {
  /** Accessible name for the player. */
  label?: string;
  /** Wrapper classes — the caller owns width; the element owns 16:9. */
  className?: string;
  /** Smaller play affordance for the low-key wizard placement. */
  compact?: boolean;
}

export function IntroVideo({
  label = "Introduktionsfilm om erbjudandet",
  className,
  compact = false,
}: IntroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasStarted, setHasStarted] = useState(false);

  const handleStart = useCallback(() => {
    // Hide the overlay first: a user gesture satisfies every autoplay policy,
    // and if play() still rejects the native controls are already exposed.
    setHasStarted(true);
    void videoRef.current?.play().catch(() => {});
  }, []);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/40",
        className,
      )}
    >
      <video
        ref={videoRef}
        src={KOSTNADSFRI_INTRO_VIDEO_URL}
        poster={KOSTNADSFRI_INTRO_POSTER_URL}
        aria-label={label}
        controls
        preload="metadata"
        playsInline
        onPlay={() => setHasStarted(true)}
        className="aspect-video w-full bg-card"
      />

      {!hasStarted && (
        <button
          type="button"
          onClick={handleStart}
          aria-label={`Spela ${label.toLowerCase()} — ${KOSTNADSFRI_INTRO_DURATION_LABEL}`}
          className="group absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/10 transition-colors hover:bg-black/20 focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none"
        >
          <span
            className={cn(
              "flex items-center justify-center rounded-full bg-background/85 text-brand-teal ring-1 ring-border backdrop-blur-sm transition-transform group-hover:scale-105",
              compact ? "h-12 w-12" : "h-16 w-16 sm:h-20 sm:w-20",
            )}
          >
            <Play
              className={cn("translate-x-0.5 fill-current", compact ? "h-5 w-5" : "h-7 w-7 sm:h-8 sm:w-8")}
            />
          </span>
          <span className="rounded-full bg-background/85 px-3 py-1 text-xs font-medium text-foreground ring-1 ring-border backdrop-blur-sm">
            Se filmen · {KOSTNADSFRI_INTRO_DURATION_LABEL}
          </span>
        </button>
      )}
    </div>
  );
}
