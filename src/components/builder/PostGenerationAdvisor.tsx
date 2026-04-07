"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Plus, Palette, Type, ImageIcon, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Suggestion {
  id: string;
  icon: "page" | "style" | "content" | "image" | "feature";
  label: string;
  prompt: string;
}

const ICON_MAP = {
  page: Plus,
  style: Palette,
  content: Type,
  image: ImageIcon,
  feature: Sparkles,
};

const DEFAULT_SUGGESTIONS: Suggestion[] = [
  { id: "add-page", icon: "page", label: "Lägg till en sida", prompt: "Lägg till en ny undersida med relevant innehåll." },
  { id: "change-colors", icon: "style", label: "Ändra färgschema", prompt: "Byt färgpalett till något mer modernt och professionellt." },
  { id: "more-content", icon: "content", label: "Mer innehåll", prompt: "Lägg till mer detaljerat innehåll och längre texter på alla sidor." },
  { id: "add-images", icon: "image", label: "Förbättra bilder", prompt: "Byt ut platshållarbilderna mot mer relevanta och professionella bilder." },
  { id: "add-cta", icon: "feature", label: "Starkare CTA", prompt: "Förbättra call-to-action-knapparna för bättre konvertering." },
];

interface PostGenerationAdvisorProps {
  visible: boolean;
  onSuggestionClick: (prompt: string) => void;
  onDismiss: () => void;
}

export function PostGenerationAdvisor({
  visible,
  onSuggestionClick,
  onDismiss,
}: PostGenerationAdvisorProps) {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (visible && !dismissed) {
      const timer = setTimeout(() => setShow(true), 1500);
      return () => clearTimeout(timer);
    }
    setShow(false);
  }, [visible, dismissed]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setShow(false);
    onDismiss();
  }, [onDismiss]);

  const handleClick = useCallback(
    (prompt: string) => {
      setShow(false);
      onSuggestionClick(prompt);
    },
    [onSuggestionClick],
  );

  if (!show) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 p-4">
      <div
        className={cn(
          "mx-auto max-w-lg rounded-2xl border border-border/30 bg-card/95 px-4 py-3 shadow-xl backdrop-blur-sm",
          "animate-in slide-in-from-bottom-4 fade-in duration-300",
        )}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground">Vad vill du göra härnäst?</p>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-full p-0.5 text-muted-foreground/50 transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DEFAULT_SUGGESTIONS.map((s) => {
            const Icon = ICON_MAP[s.icon];
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleClick(s.prompt)}
                className="group inline-flex items-center gap-1.5 rounded-xl border border-border/30 bg-background/50 px-3 py-1.5 text-xs text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
              >
                <Icon className="h-3 w-3 shrink-0 text-primary/60" />
                <span>{s.label}</span>
                <ArrowRight className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
