"use client";

import { Check, Sparkles, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const MUST_HAVE_OPTIONS = [
  "Startsida / Hero",
  "Om oss / Om mig",
  "Kontaktformulär",
  "Webshop / Produkter",
  "Priser och paket",
  "Bokning online",
  "Bildgalleri",
  "Meny / Matsedel",
  "Blogg / Nyheter",
  "Kundrecensioner",
  "Vanliga frågor (FAQ)",
  "Portfolio / Case",
  "Vårt team",
  "Karta / Hitta hit",
  "Sociala medier-länkar",
  "Nyhetsbrev-signup",
  "Video / Presentation",
  "Tydlig CTA-knapp",
  "Logga in / Konto",
  "Tjänsteöversikt",
];

export interface MustHavePickerContext {
  siteType?: string;
  companyDescription?: string;
  scrapeText?: string;
}

interface MustHavePickerPopupProps {
  onSelect: (labels: string[]) => void;
  onClose: () => void;
  context?: MustHavePickerContext;
}

export function MustHavePickerPopup({ onSelect, onClose, context }: MustHavePickerPopupProps) {
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => setMounted(true), []);

  const toggle = useCallback((label: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  const handleContinue = useCallback(() => {
    onSelect(Array.from(selected));
  }, [selected, onSelect]);

  const handleSuggest = useCallback(async () => {
    if (suggesting) return;
    setSuggesting(true);
    try {
      const res = await fetch("/api/ai/suggest-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteType: context?.siteType,
          companyDescription: context?.companyDescription,
          scrapeText: context?.scrapeText,
        }),
      });
      if (!res.ok) {
        toast.error("Kunde inte hämta förslag just nu. Välj manuellt.");
        return;
      }
      const data = await res.json();
      if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        setSelected(new Set(data.suggestions));
      } else {
        toast("Inga automatiska förslag hittades — välj det som passar dig.", { duration: 3000 });
      }
    } catch {
      toast.error("Kunde inte hämta förslag just nu. Välj manuellt.");
    } finally {
      setSuggesting(false);
    }
  }, [context, suggesting]);

  const hasContext = !!(context?.siteType || context?.companyDescription || context?.scrapeText);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 flex max-h-[85vh] w-full max-w-[640px] flex-col overflow-hidden rounded-3xl border border-border/20 bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-7 pb-3 text-center">
          <h2 className="text-xl font-semibold text-foreground">
            Vilka delar måste finnas med?
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Välj allt som ska finnas på sajten
          </p>
        </div>

        <div className="grid auto-rows-auto grid-cols-[repeat(auto-fill,minmax(155px,1fr))] gap-2 overflow-y-auto px-6 py-3">
          {MUST_HAVE_OPTIONS.map((label) => {
            const isSelected = selected.has(label);
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggle(label)}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-all",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border/50 bg-muted/30 text-foreground/70 hover:border-primary/30 hover:bg-muted",
                )}
              >
                {isSelected && (
                  <Check className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="leading-snug">{label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col items-center gap-2 px-6 pt-3 pb-6">
          <div className="flex w-full max-w-xs gap-2">
            {hasContext && (
              <button
                type="button"
                onClick={handleSuggest}
                disabled={suggesting}
                className={cn(
                  "flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-primary px-5 py-3 text-sm font-semibold text-primary transition-all hover:bg-primary/5",
                  suggesting && "opacity-60",
                )}
              >
                {suggesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {suggesting ? "Analyserar..." : "Förslag"}
              </button>
            )}
            <button
              type="button"
              onClick={handleContinue}
              disabled={selected.size === 0}
              className={cn(
                "flex-1 rounded-full py-3 text-sm font-semibold transition-all",
                selected.size > 0
                  ? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
                  : "cursor-not-allowed bg-muted text-muted-foreground",
              )}
            >
              {selected.size > 0 ? "Fortsätt" : "Välj minst en"}
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Hoppa över
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
