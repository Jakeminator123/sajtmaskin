"use client";

import { useCallback, useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";

/**
 * Welcome Overlay
 * ═══════════════════════════════════════════════════════════════
 *
 * Full-screen overlay shown when users arrive from sajtstudio.se
 * with a company name (e.g. ?mode=audit&company=Alfarekrytering).
 *
 * Välkomsttext med företagsnamnet och en knapp vidare. Rutan är en modal
 * dialog: fokus flyttas in, Esc och klick utanför stänger.
 */

interface WelcomeOverlayProps {
  company: string;
  onContinue: () => void;
}

export function WelcomeOverlay({ company, onContinue }: WelcomeOverlayProps) {
  const continueRef = useRef<HTMLButtonElement>(null);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onContinue();
    },
    [onContinue],
  );

  useEffect(() => {
    continueRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onContinue();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onContinue]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-black/80 backdrop-blur-md" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-overlay-title"
        className="animate-fadeInUp relative flex w-full max-w-2xl flex-col items-center gap-8"
      >
        <div className="relative w-full overflow-hidden rounded-2xl border border-white/8 bg-[hsl(220,15%,7%)] p-8 text-center shadow-2xl">
          {/* Top accent */}
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-brand-blue/30 to-transparent" />

          <p className="mb-2 text-[13px] font-medium tracking-widest text-white/60 uppercase">
            Din sajt är redo
          </p>
          <h1
            id="welcome-overlay-title"
            className="mb-3 text-3xl font-bold tracking-tight text-white sm:text-4xl"
          >
            Välkommen, {company}
          </h1>
          <p className="mx-auto max-w-md text-[15px] leading-relaxed text-white/70">
            Vi har autogenererat en sajt åt dig — helt gratis.
            Logga in för att ta del av den och göra den till din egen.
          </p>
        </div>

        <button
          ref={continueRef}
          type="button"
          onClick={onContinue}
          className="group flex items-center gap-2.5 rounded-xl bg-white/10 px-8 py-4 text-[16px] font-semibold text-white transition-all duration-300 hover:bg-white/15 hover:shadow-lg hover:shadow-white/5"
        >
          Fortsätt till din sajt
          <ArrowRight className="h-4.5 w-4.5 transition-transform duration-300 group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}
