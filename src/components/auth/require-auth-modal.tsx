"use client";

import { useState } from "react";
import { AuthModal } from "./auth-modal";
import { Button } from "@/components/ui/button";
import { Diamond, Sparkles, Lock, X } from "lucide-react";

interface RequireAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason: "generation" | "refine" | "credits" | "download";
}

const REASONS = {
  generation: {
    title: "Du har använt din gratis generation",
    description:
      "Skapa ett konto för att fortsätta bygga webbplatser. Du får 5 gratis diamanter!",
    icon: Sparkles,
  },
  refine: {
    title: "Du har använt din gratis förfining",
    description:
      "Skapa ett konto för att fortsätta förfina din design. Du får 5 gratis diamanter!",
    icon: Sparkles,
  },
  credits: {
    title: "Du har slut på diamanter",
    description: "Köp fler diamanter för att fortsätta bygga.",
    icon: Diamond,
  },
  download: {
    title: "Skapa konto för att ladda ner",
    description:
      "Logga in eller skapa ett konto för att ladda ner din webbplats.",
    icon: Lock,
  },
};

export function RequireAuthModal({
  isOpen,
  onClose,
  reason,
}: RequireAuthModalProps) {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");

  if (!isOpen) return null;

  const reasonData = REASONS[reason];
  const Icon = reasonData.icon;

  const handleAuthClick = (mode: "login" | "register") => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative w-full max-w-md mx-4 bg-black border border-gray-800 shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-1.5 hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors z-10"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Decorative gradient */}
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-brand-teal/10 to-transparent" />

          {/* Content */}
          <div className="relative p-8 text-center">
            {/* Icon */}
            <div className="mx-auto w-16 h-16 bg-brand-teal/10 border border-brand-teal/30 flex items-center justify-center mb-6">
              <Icon className="h-8 w-8 text-brand-teal" />
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-white mb-3">
              {reasonData.title}
            </h2>

            {/* Description */}
            <p className="text-gray-400 mb-6">{reasonData.description}</p>

            {/* Bonus badge */}
            {reason !== "credits" && (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-amber/10 border border-brand-amber/30 mb-6">
                <Diamond className="h-4 w-4 text-brand-amber" />
                <span className="text-sm font-medium text-brand-amber">
                  +5 diamanter gratis vid registrering
                </span>
              </div>
            )}

            {/* Buttons */}
            <div className="space-y-3">
              {reason === "credits" ? (
                // Show buy credits button for out of credits
                <>
                  <Button
                    onClick={() => (window.location.href = "/buy-credits")}
                    className="w-full h-11 bg-brand-teal hover:bg-brand-teal/90 text-white font-medium"
                  >
                    <Diamond className="h-4 w-4 mr-2" />
                    Köp diamanter
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={onClose}
                    className="w-full h-11 text-gray-400 hover:text-white"
                  >
                    Avbryt
                  </Button>
                </>
              ) : (
                // Show auth buttons for guest users
                <>
                  <Button
                    onClick={() => handleAuthClick("register")}
                    className="w-full h-11 bg-brand-teal hover:bg-brand-teal/90 text-white font-medium"
                  >
                    Skapa gratis konto
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => handleAuthClick("login")}
                    className="w-full h-11 text-gray-400 hover:text-white"
                  >
                    Har redan konto? Logga in
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Auth modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          onClose();
        }}
        defaultMode={authMode}
      />
    </>
  );
}
