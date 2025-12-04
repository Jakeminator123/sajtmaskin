"use client";

import { useState, useEffect } from "react";
import { Cookie } from "lucide-react";

/**
 * Cookie Banner with Pac-Man Animation
 *
 * A fun GDPR-compliant cookie consent banner featuring
 * Pac-Man eating a cookie when the user accepts.
 */

export function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [isEating, setIsEating] = useState(false);
  const [hasAccepted, setHasAccepted] = useState(false);

  useEffect(() => {
    // Check if user has already accepted cookies
    const cookieConsent = localStorage.getItem("cookie-consent");
    if (!cookieConsent) {
      // Small delay before showing banner
      const timer = setTimeout(() => setIsVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    setIsEating(true);

    // Play the eating animation, then hide
    setTimeout(() => {
      setHasAccepted(true);
      localStorage.setItem("cookie-consent", "accepted");
      localStorage.setItem("cookie-consent-date", new Date().toISOString());
    }, 1500);

    setTimeout(() => {
      setIsVisible(false);
    }, 2000);
  };

  const handleDecline = () => {
    localStorage.setItem("cookie-consent", "declined");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div
      className={`fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50 
        transition-all duration-500 ${
          hasAccepted ? "translate-y-20 opacity-0" : "translate-y-0 opacity-100"
        }`}
    >
      <div className="bg-gray-900 border border-gray-700 shadow-2xl p-4 relative overflow-hidden">
        {/* Decorative corner */}
        <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-yellow-500/20 to-transparent" />

        {/* Content */}
        <div className="flex items-start gap-4">
          {/* Pac-Man & Cookie Animation */}
          <div className="relative w-16 h-16 flex-shrink-0 flex items-center justify-center">
            {/* Cookie (gets eaten) */}
            <div
              className={`absolute transition-all duration-1000 ${
                isEating
                  ? "translate-x-[-40px] scale-0 opacity-0"
                  : "translate-x-0 scale-100 opacity-100"
              }`}
            >
              <Cookie className="w-8 h-8 text-amber-400" />
            </div>

            {/* Pac-Man */}
            <div
              className={`absolute transition-all duration-700 ${
                isEating ? "translate-x-0" : "translate-x-10"
              }`}
            >
              <svg
                viewBox="0 0 100 100"
                className={`w-12 h-12 ${isEating ? "animate-chomp" : ""}`}
              >
                {/* Pac-Man body */}
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="#FACC15"
                  className="drop-shadow-lg"
                />
                {/* Mouth (triangle cut-out) */}
                <path
                  d={
                    isEating
                      ? "M50,50 L95,30 L95,70 Z"
                      : "M50,50 L95,40 L95,60 Z"
                  }
                  fill="#111827"
                  className="transition-all duration-150"
                />
                {/* Eye */}
                <circle cx="50" cy="25" r="8" fill="#111827" />
              </svg>
            </div>

            {/* Crumbs when eating */}
            {isEating && (
              <>
                <div className="absolute w-1 h-1 bg-amber-400 rounded-full animate-crumb-1" />
                <div className="absolute w-1.5 h-1.5 bg-amber-400 rounded-full animate-crumb-2" />
                <div className="absolute w-1 h-1 bg-amber-400 rounded-full animate-crumb-3" />
              </>
            )}
          </div>

          {/* Text */}
          <div className="flex-1">
            <h3 className="text-white font-semibold text-sm mb-1 flex items-center gap-2">
              {isEating ? (
                <span className="text-yellow-400">WAKA WAKA! 🎮</span>
              ) : (
                "Vi använder cookies"
              )}
            </h3>
            <p className="text-gray-400 text-xs leading-relaxed">
              {isEating
                ? "Mmm, goda kakor! Tack för att du accepterar."
                : "Vi använder cookies för att förbättra din upplevelse och analysera trafik. Låt Pac-Man äta en kaka?"}
            </p>
          </div>
        </div>

        {/* Buttons */}
        {!hasAccepted && (
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleAccept}
              disabled={isEating}
              className="flex-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-medium text-sm transition-colors disabled:opacity-50"
            >
              {isEating ? "NOM NOM..." : "Acceptera"}
            </button>
            <button
              onClick={handleDecline}
              disabled={isEating}
              className="px-4 py-2 border border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 text-sm transition-colors disabled:opacity-50"
            >
              Neka
            </button>
          </div>
        )}

        {/* Privacy link */}
        <p className="text-gray-500 text-xs mt-3">
          Läs mer i vår{" "}
          <a href="/privacy" className="text-teal-400 hover:underline">
            integritetspolicy
          </a>
        </p>
      </div>
    </div>
  );
}
