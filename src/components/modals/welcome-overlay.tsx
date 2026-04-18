"use client";

import { useCallback } from "react";
import { ArrowRight, Play, AlertTriangle, Mail } from "lucide-react";
import { Mascot } from "@/components/mascot/Mascot";

/**
 * Welcome Overlay
 * ═══════════════════════════════════════════════════════════════
 *
 * Full-screen overlay shown when users arrive from sajtstudio.se
 * with a company name (e.g. ?mode=audit&company=Alfarekrytering).
 *
 * Three visual layers (top → bottom):
 * 1. Welcome banner with dynamic company name + login prompt
 * 2. Demo video showcasing what Sajtmaskin does
 * 3. CTA to continue → closes overlay, activates audit section
 */

interface WelcomeOverlayProps {
  company: string;
  onContinue: () => void;
}

export function WelcomeOverlay({ company, onContinue }: WelcomeOverlayProps) {
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onContinue();
    },
    [onContinue],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      {/* Content */}
      <div className="animate-fadeInUp relative flex w-full max-w-2xl flex-col items-center gap-8">

        {/* ── Layer 1: Welcome banner ── */}
        <div className="relative w-full overflow-hidden rounded-2xl border border-border bg-card p-8 text-center shadow-2xl">
          {/* Top accent */}
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/30 to-transparent" />

          <div className="mx-auto mb-4 flex justify-center">
            <Mascot slot="wave" size={120} decorative />
          </div>
          <p className="mb-2 text-[13px] font-medium tracking-widest text-muted-foreground uppercase">
            Din sajt är redo
          </p>
          <h1 className="mb-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Välkommen, {company}
          </h1>
          <p className="mx-auto max-w-md text-[15px] leading-relaxed text-muted-foreground">
            Vi har autogenererat en sajt åt dig — helt gratis.
            Logga in för att ta del av den och göra den till din egen.
          </p>
        </div>

        {/* ── Layer 2: Demo video ── */}
        <div className="group relative w-full overflow-hidden rounded-2xl border border-border bg-muted/50 shadow-2xl">
          {/* Video placeholder — replace src with actual demo video */}
          <div className="relative aspect-video w-full">
            {/* Placeholder state (replace with <video> or <iframe> when video is ready) */}
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-linear-to-b from-muted/50 to-transparent">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted/50 transition-all duration-300 group-hover:scale-105 group-hover:border-border group-hover:bg-muted">
                <Play className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-[13px] text-muted-foreground">Demo kommer snart</p>
            </div>

            {/*
              When video is ready, replace the placeholder above with:
              <video
                src="/videos/demo.mp4"
                controls
                autoPlay
                muted
                className="h-full w-full object-cover"
              />
            */}
          </div>
        </div>

        {/* ── Beta notice ── */}
        <div className="w-full rounded-xl border border-brand-amber/10 bg-brand-amber/3 px-6 py-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-brand-amber/50" />
            <span className="text-[12px] font-semibold tracking-wide text-brand-amber/50 uppercase">Under uppbyggnad</span>
          </div>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Den här tjänsten är under utveckling. Stöter du på problem hjälper
            våra utvecklare gärna till. Vill du bara ha en autogenererad sajt?
            Mejla oss med dina preferenser så skapar vi en gratis demo-URL åt dig.
          </p>
          <a
            href="mailto:erik@sajtstudio.se"
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-amber/60 transition-colors hover:text-brand-amber/80"
          >
            <Mail className="h-3.5 w-3.5" />
            erik@sajtstudio.se
          </a>
        </div>

        {/* ── Layer 3: CTA ── */}
        <button
          onClick={onContinue}
          className="group flex items-center gap-2.5 rounded-xl bg-primary px-8 py-4 text-[16px] font-semibold text-primary-foreground transition-all duration-300 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/5"
        >
          Fortsätt till din sajt
          <ArrowRight className="h-4.5 w-4.5 transition-transform duration-300 group-hover:translate-x-0.5" />
        </button>

        {/* Skip link */}
        <button
          onClick={onContinue}
          className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Hoppa över
        </button>
      </div>
    </div>
  );
}
