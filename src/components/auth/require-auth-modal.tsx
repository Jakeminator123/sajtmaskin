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
    title: "Skapa konto för att generera",
    description:
      "Generering kräver ett konto. När kontot är aktiverat får du din första generering utan coin-debitering.",
    icon: Wand2,
  },
  refine: {
    title: "Logga in för att fortsätta bygga",
    description:
      "Skapa ett konto eller logga in. Kontots första färdiga generering är kostnadsfri.",
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
      <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-lg" onClick={onClose} />

        {/* Modal */}
        <div className="animate-in fade-in zoom-in-95 border-border/35 bg-card/85 relative w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-2xl duration-200">
          <div className="from-primary/12 to-primary/4 pointer-events-none absolute inset-0 bg-linear-to-br via-transparent" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="border-border/20 bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary absolute top-4 right-4 z-20 rounded-lg border p-1.5 transition-colors"
            aria-label="Stäng inloggningskrav"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Content */}
          <div className="relative z-10 p-8 text-center">
            {/* Icon */}
            <div className="border-primary/25 bg-primary/10 mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl border">
              <Icon className="text-primary h-8 w-8" />
            </div>

            {/* Title */}
            <h2 className="text-foreground mb-3 text-2xl font-(--font-heading) tracking-tight">
              {reasonData.title}
            </h2>

            {/* Description */}
            <p className="text-muted-foreground mb-6">{reasonData.description}</p>

            {/* Bonus badge */}
            {reason !== "credits" && (
              <div className="border-primary/25 bg-primary/10 mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-2">
                <Wand2 className="text-primary h-4 w-4" />
                <span className="text-primary text-sm font-medium">
                  Första genereringen utan coin-debitering
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
                    className="bg-primary text-primary-foreground hover:bg-primary/90 h-11 w-full font-medium"
                  >
                    <Coins className="mr-2 h-4 w-4" />
                    Köp credits
                  </Button>
                  <Button
                    variant="outline"
                    onClick={onClose}
                    className="border-border/35 bg-secondary/50 text-foreground hover:bg-secondary/75 h-11 w-full"
                  >
                    Avbryt
                  </Button>
                </>
              ) : (
                // Show auth buttons for guest users
                <>
                  <Button
                    onClick={() => handleAuthClick("register")}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 h-11 w-full font-medium"
                  >
                    Skapa gratis konto
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleAuthClick("login")}
                    className="border-border/35 bg-secondary/50 text-foreground hover:bg-secondary/75 h-11 w-full"
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
