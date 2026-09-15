"use client";

import { useState, useEffect } from "react";

/**
 * ThinkingSpinner — Phase 3 of the kostnadsfri flow.
 * Full-screen overlay shown while generating the prompt + creating the project.
 *
 * One slow brand-tinted wash instead of the stacked morphing orbs and particle
 * ring it used to carry: the wait should read as calm, not as a light show.
 */

const PHASE_MESSAGES = [
  "Förbereder din upplevelse...",
  "Analyserar företagsinformation...",
  "Bygger grunden för din sajt...",
  "Finputsar detaljerna...",
  "Nästan klar...",
];

interface ThinkingSpinnerProps {
  companyName: string;
}

export function ThinkingSpinner({ companyName }: ThinkingSpinnerProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  // Rotate messages every 2.5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % PHASE_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Simulate progress (reaches ~90% then slows down)
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev + 0.1;
        if (prev >= 70) return prev + 0.5;
        return prev + 2;
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background"
      role="status"
      aria-live="polite"
    >
      <div
        aria-hidden
        className="orb pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[110px]"
      />

      {/* One calm sentence for assistive tech — the rotating copy below would
          otherwise be announced every 2.5 seconds. */}
      <p className="sr-only">Vi bygger ert förslag. Det tar en liten stund.</p>

      {/* Content */}
      <div className="relative z-10 px-6 text-center">
        <h2 className="mb-6 text-sm font-medium tracking-[0.18em] text-muted-foreground uppercase">
          {companyName}
        </h2>

        <p
          key={messageIndex}
          aria-hidden
          className="phase mb-10 text-xl font-(--font-heading) tracking-tight text-foreground sm:text-2xl"
        >
          {PHASE_MESSAGES[messageIndex]}
        </p>

        {/* Progress bar */}
        <div className="mx-auto w-64">
          <div className="h-1 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-brand-teal transition-all duration-300"
              style={{ width: `${Math.min(progress, 95)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Keyframe animations */}
      <style jsx>{`
        .orb {
          background: radial-gradient(
            circle,
            hsl(var(--brand-teal)) 0%,
            hsl(var(--primary)) 55%,
            transparent 75%
          );
          opacity: 0.22;
          animation: breathe 9s ease-in-out infinite;
        }

        .phase {
          animation: fadeInUp 0.5s ease-out;
        }

        /* Only scale + opacity: Tailwind v4 centres the orb with the standalone
           translate property, so a transform here would shift it off-centre. */
        @keyframes breathe {
          0%,
          100% {
            scale: 1;
            opacity: 0.22;
          }
          50% {
            scale: 1.08;
            opacity: 0.32;
          }
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .orb,
          .phase {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
