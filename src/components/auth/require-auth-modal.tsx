"use client";

import { useState } from "react";
import { AuthModal } from "./auth-modal";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface RequireAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason: "generation" | "refine" | "credits" | "download" | "save" | "builder";
}

const REASONS: Record<string, string> = {
  generation: "Skapa konto för att fortsätta bygga.",
  refine: "Skapa konto för att fortsätta förfina.",
  credits: "Du har slut på credits.",
  download: "Logga in för att ladda ner.",
  save: "Logga in för att spara.",
  builder: "Logga in för att använda Builder.",
};

export function RequireAuthModal({ isOpen, onClose, reason }: RequireAuthModalProps) {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");

  if (!isOpen) return null;

  const message = REASONS[reason] || "Logga in för att fortsätta.";
  const isCredits = reason === "credits";

  return (
    <>
      <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

        <div className="animate-in fade-in zoom-in-95 relative w-full max-w-xs rounded-2xl border border-border bg-card shadow-2xl duration-200">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label="Stäng"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="p-6 text-center">
            <p className="text-sm text-foreground mb-4">{message}</p>

            {isCredits ? (
              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => (window.location.href = "/buy-credits")}
              >
                Köp credits
              </Button>
            ) : (
              <div className="space-y-2">
                <Button
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => { setAuthMode("register"); setShowAuthModal(true); }}
                >
                  Skapa konto
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => { setAuthMode("login"); setShowAuthModal(true); }}
                >
                  Logga in
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => { setShowAuthModal(false); onClose(); }}
        defaultMode={authMode}
      />
    </>
  );
}
