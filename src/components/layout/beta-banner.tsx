"use client";

import { useState } from "react";
import { X, Rocket, Mail } from "lucide-react";

/**
 * Beta/construction banner shown when NEXT_PUBLIC_BETA_BANNER=1.
 * Dismissable per session (sessionStorage).
 */
export function BetaBanner() {
  const enabled = process.env.NEXT_PUBLIC_BETA_BANNER === "1";
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("beta_banner_dismissed") === "1";
  });

  if (!enabled || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem("beta_banner_dismissed", "1");
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative z-50 overflow-hidden border-b border-brand-teal/20 bg-linear-to-r from-brand-teal/10 via-brand-blue/10 to-brand-amber/10">
      {/* Animated gradient line at top */}
      <div
        className="absolute top-0 left-0 h-[2px] w-full"
        style={{
          background:
            "linear-gradient(90deg, #14b8a6, #3b82f6, #f59e0b, #14b8a6)",
          backgroundSize: "200% 100%",
          animation: "betaGradient 4s linear infinite",
        }}
      />

      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:gap-4 sm:px-6">
        {/* Icon */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-teal/20">
          <Rocket className="h-3.5 w-3.5 text-brand-teal" />
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <p className="text-xs leading-relaxed text-gray-300 sm:text-sm">
            <strong className="text-white">Sajtmaskin befinner sig i tidig betafas.</strong>{" "}
            Vi bygger Sveriges smartaste sajtbyggare for foretag som vill ha webbplatser
            drivna av affarsmal, inte mallar. Nya funktioner rullas ut lopande.
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-gray-500 sm:text-xs">
            <Mail className="h-3 w-3" />
            Fragor eller feedback?{" "}
            <a
              href="mailto:hej@sajtmaskin.se"
              className="font-medium text-brand-teal underline decoration-brand-teal/30 underline-offset-2 transition-colors hover:text-brand-teal/80"
            >
              hej@sajtmaskin.se
            </a>
          </p>
        </div>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded-md p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
          aria-label="Stang banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Keyframe for gradient animation */}
      <style jsx>{`
        @keyframes betaGradient {
          0% { background-position: 0% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
}
