"use client";

import { useCallback } from "react";
import { X, Search, Wand2, Pencil, ArrowRight } from "lucide-react";

// ── Entry mode definitions ──────────────────────────────────────

export type EntryMode = "audit" | "wizard" | "freeform";

interface EntryModeConfig {
  title: string;
  subtitle: string;
  cta: string;
  icon: React.ReactNode;
  accentClass: string;
}

const ENTRY_MODES: Record<EntryMode, EntryModeConfig> = {
  audit: {
    title: "Analysera din webbplats",
    subtitle:
      "Ange din webbadress och få en kostnadsfri AI-analys med konkreta förbättringsförslag — helt gratis.",
    cta: "Starta analys",
    icon: <Search className="h-5 w-5" />,
    accentClass: "text-brand-amber",
  },
  wizard: {
    title: "Skapa din webbplats",
    subtitle:
      "Vår AI-guide ställer rätt frågor och bygger en skräddarsydd webbplats utifrån ditt företag och dina mål.",
    cta: "Starta guiden",
    icon: <Wand2 className="h-5 w-5" />,
    accentClass: "text-brand-blue",
  },
  freeform: {
    title: "Beskriv din vision",
    subtitle:
      "Skriv fritt vad du vill ha — AI förstår dina behov och bygger en professionell webbplats utifrån det.",
    cta: "Kom igång",
    icon: <Pencil className="h-5 w-5" />,
    accentClass: "text-brand-warm",
  },
};

// ── Component ───────────────────────────────────────────────────

interface EntryModalProps {
  mode: EntryMode;
  /** Optional partner/referral name to display */
  partner?: string | null;
  onContinue: () => void;
  onClose: () => void;
}

/**
 * Entry Modal — shown when users arrive via external links with URL params
 * (e.g. ?mode=audit from a partner site).
 *
 * Provides context about what they're about to do, then hands off
 * to the appropriate section/modal on the home page.
 */
export function EntryModal({ mode, partner, onContinue, onClose }: EntryModalProps) {
  const config = ENTRY_MODES[mode];

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div className="animate-fadeInUp relative w-full max-w-md overflow-hidden rounded-2xl border border-white/6 bg-[hsl(220,15%,7%)] shadow-2xl">
        {/* Top accent line */}
        <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/10 to-transparent" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-lg p-1.5 text-white/25 transition-colors hover:bg-white/5 hover:text-white/50"
          aria-label="Stäng"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-8 pt-10 pb-8">
          {/* Icon */}
          <div className={`mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 ${config.accentClass}`}>
            {config.icon}
          </div>

          {/* Partner badge */}
          {partner && (
            <div className="mb-4 inline-flex items-center rounded-full border border-white/6 bg-white/3 px-3 py-1 text-[11px] font-medium text-white/40">
              Via {partner}
            </div>
          )}

          {/* Content */}
          <h2 className="mb-3 text-2xl font-bold tracking-tight text-white">
            {config.title}
          </h2>
          <p className="mb-8 text-[15px] leading-relaxed text-white/40">
            {config.subtitle}
          </p>

          {/* CTA */}
          <button
            onClick={onContinue}
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-6 py-3.5 text-[15px] font-semibold text-white transition-all duration-300 hover:bg-white/15"
          >
            {config.cta}
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </button>

          {/* Skip link */}
          <button
            onClick={onClose}
            className="mt-4 w-full text-center text-[12px] text-white/20 transition-colors hover:text-white/40"
          >
            Eller utforska själv
          </button>
        </div>
      </div>
    </div>
  );
}
