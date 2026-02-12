"use client";

import { useState } from "react";
import { AuthModal } from "./auth-modal";
import { Button } from "@/components/ui/button";
import { Coins, Wand2, Lock, X } from "lucide-react";

interface RequireAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason: "generation" | "refine" | "credits" | "download" | "save" | "builder";
}

const REASONS = {
  generation: {
    title: "Du har använt din gratis generation",
    description:
      "Skapa ett konto för att fortsätta bygga webbplatser. Du får 50 gratis credits!",
    icon: Wand2,
  },
  refine: {
    title: "Du har använt din gratis förfining",
    description:
      "Skapa ett konto för att fortsätta förfina din design. Du får 50 gratis credits!",
    icon: Wand2,
  },
  credits: {
    title: "Du har slut på credits",
    description: "Köp fler credits för att fortsätta bygga.",
    icon: Coins,
  },
  download: {
    title: "Skapa konto för att ladda ner",
    description: "Logga in eller skapa ett konto för att ladda ner din webbplats.",
    icon: Lock,
  },
  save: {
    title: "Skapa konto för att spara projekt",
    description: "Logga in eller skapa ett konto för att spara ditt projekt till ditt konto.",
    icon: Lock,
  },
  builder: {
    title: "Logga in för att använda Builder",
    description: "Du måste vara inloggad för att skapa och redigera webbplatser i Builder.",
    icon: Lock,
  },
};

export function RequireAuthModal({ isOpen, onClose, reason }: RequireAuthModalProps) {
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
      <div className="fixed inset-0 z-100 flex items-center justify-center">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

        {/* Modal */}
        <div className="animate-in fade-in zoom-in-95 relative mx-4 w-full max-w-md overflow-hidden border border-gray-800 bg-black shadow-2xl duration-200">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Decorative gradient */}
          <div className="from-brand-teal/10 absolute inset-x-0 top-0 h-32 bg-linear-to-b to-transparent" />

          {/* Content */}
          <div className="relative p-8 text-center">
            {/* Icon */}
            <div className="bg-brand-teal/10 border-brand-teal/30 mx-auto mb-6 flex h-16 w-16 items-center justify-center border">
              <Icon className="text-brand-teal h-8 w-8" />
            </div>

            {/* Title */}
            <h2 className="mb-3 text-2xl font-bold text-white">{reasonData.title}</h2>

            {/* Description */}
            <p className="mb-6 text-gray-400">{reasonData.description}</p>

            {/* Bonus badge */}
            {reason !== "credits" && (
              <div className="bg-brand-amber/10 border-brand-amber/30 mb-6 inline-flex items-center gap-2 border px-4 py-2">
                <Coins className="text-brand-amber h-4 w-4" />
                <span className="text-brand-amber text-sm font-medium">
                  +50 credits gratis vid registrering
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
                    className="bg-brand-teal hover:bg-brand-teal/90 h-11 w-full font-medium text-white"
                  >
                    <Coins className="mr-2 h-4 w-4" />
                    Köp credits
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={onClose}
                    className="h-11 w-full text-gray-400 hover:text-white"
                  >
                    Avbryt
                  </Button>
                </>
              ) : (
                // Show auth buttons for guest users
                <>
                  <Button
                    onClick={() => handleAuthClick("register")}
                    className="bg-brand-teal hover:bg-brand-teal/90 h-11 w-full font-medium text-white"
                  >
                    Skapa gratis konto
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => handleAuthClick("login")}
                    className="h-11 w-full text-gray-400 hover:text-white"
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
