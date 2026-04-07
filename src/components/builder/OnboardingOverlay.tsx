"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Wand2, Eye, ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "sajtmaskin:onboarding-seen";

const STEPS = [
  {
    icon: MessageSquare,
    title: "Beskriv din sajt",
    description: "Svara på några korta frågor om ditt företag och vad du vill ha.",
  },
  {
    icon: Wand2,
    title: "AI bygger åt dig",
    description: "Vi skapar din sajt med rätt design, innehåll och funktioner.",
  },
  {
    icon: Eye,
    title: "Se & förfina",
    description: "Granska resultatet live och be om ändringar direkt i chatten.",
  },
];

interface OnboardingOverlayProps {
  onDismiss: () => void;
}

export function OnboardingOverlay({ onDismiss }: OnboardingOverlayProps) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = localStorage.getItem(STORAGE_KEY);
    if (seen) {
      onDismiss();
      return;
    }
    const timer = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, 300);
  }, [onDismiss]);

  const handleNext = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      handleDismiss();
    }
  }, [step, handleDismiss]);

  if (!visible) return null;

  const current = STEPS[step];
  const Icon = current.icon;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm transition-opacity duration-300",
        exiting ? "opacity-0" : "opacity-100",
      )}
    >
      <div
        className={cn(
          "relative w-full max-w-sm rounded-3xl border border-border/30 bg-card p-8 shadow-2xl",
          "animate-in zoom-in-95 fade-in duration-300",
        )}
      >
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground/40 transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Icon className="h-8 w-8 text-primary" />
          </div>

          <p className="mb-1 text-sm font-medium text-muted-foreground">
            Steg {step + 1} av {STEPS.length}
          </p>
          <h2 className="mb-2 text-xl font-bold tracking-tight text-foreground">
            {current.title}
          </h2>
          <p className="mb-8 text-sm text-muted-foreground">
            {current.description}
          </p>

          <div className="mb-6 flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 w-8 rounded-full transition-colors duration-300",
                  i <= step ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={handleNext}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            {step < STEPS.length - 1 ? "Nästa" : "Kom igång"}
            <ArrowRight className="h-4 w-4" />
          </button>

          {step < STEPS.length - 1 && (
            <button
              type="button"
              onClick={handleDismiss}
              className="mt-3 text-xs text-muted-foreground/50 transition-colors hover:text-foreground"
            >
              Hoppa över
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function useOnboardingSeen(): boolean {
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    setSeen(localStorage.getItem(STORAGE_KEY) === "true");
  }, []);
  return seen;
}
