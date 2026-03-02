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
      "Skapa ett konto för att fortsätta bygga webbplatser. Du får 50 credits efter verifierad e-post.",
    icon: Wand2,
  },
  refine: {
    title: "Du har använt din gratis förfining",
    description:
      "Skapa ett konto för att fortsätta förfina din design. Du får 50 credits efter verifierad e-post.",
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
        <div className="animate-in fade-in zoom-in-95 relative w-full max-w-md overflow-hidden rounded-2xl border border-border/35 bg-card/85 shadow-2xl backdrop-blur-2xl duration-200">
          <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-primary/12 via-transparent to-primary/4" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-20 rounded-lg border border-border/20 bg-secondary/60 p-1.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary"
            aria-label="Stäng inloggningskrav"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Content */}
          <div className="relative z-10 p-8 text-center">
            {/* Icon */}
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl border border-primary/25 bg-primary/10">
              <Icon className="h-8 w-8 text-primary" />
            </div>

            {/* Title */}
            <h2 className="mb-3 text-2xl font-(--font-heading) tracking-tight text-foreground">
              {reasonData.title}
            </h2>

            {/* Description */}
            <p className="mb-6 text-muted-foreground">{reasonData.description}</p>

            {/* Bonus badge */}
            {reason !== "credits" && (
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-2">
                <Coins className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-primary">
                  +50 credits efter verifiering
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
                    className="h-11 w-full bg-primary text-primary-foreground font-medium hover:bg-primary/90"
                  >
                    <Coins className="mr-2 h-4 w-4" />
                    Köp credits
                  </Button>
                  <Button
                    variant="outline"
                    onClick={onClose}
                    className="h-11 w-full border-border/35 bg-secondary/50 text-foreground hover:bg-secondary/75"
                  >
                    Avbryt
                  </Button>
                </>
              ) : (
                // Show auth buttons for guest users
                <>
                  <Button
                    onClick={() => handleAuthClick("register")}
                    className="h-11 w-full bg-primary text-primary-foreground font-medium hover:bg-primary/90"
                  >
                    Skapa gratis konto
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleAuthClick("login")}
                    className="h-11 w-full border-border/35 bg-secondary/50 text-foreground hover:bg-secondary/75"
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
