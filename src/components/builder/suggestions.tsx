"use client";

/**
 * Suggestions Component
 * =====================
 * 
 * Inspirerad av v0:s AI Elements Suggestions-komponent.
 * Visar klickbara prompt-förslag för snabb start.
 * 
 * @see https://v0.dev/docs/elements/components/suggestion
 */

import { Sparkles } from "lucide-react";

interface Suggestion {
  text: string;
  icon?: React.ReactNode;
}

interface SuggestionsProps {
  suggestions: Suggestion[];
  onSelect: (text: string) => void;
  disabled?: boolean;
  className?: string;
}

// Default suggestions for website building
export const DEFAULT_SUGGESTIONS: Suggestion[] = [
  { text: "Skapa en modern landing page för ett tech-startup" },
  { text: "Bygg en portfolio-sida med bildgalleri" },
  { text: "Designa en restaurang-hemsida med meny" },
  { text: "Skapa en e-handels produktsida" },
];

// Category-specific suggestions
export const CATEGORY_SUGGESTIONS: Record<string, Suggestion[]> = {
  "landing-page": [
    { text: "Modern hero-sektion med CTA-knapp" },
    { text: "Landing page för en SaaS-produkt" },
    { text: "App-landing page med telefon-mockup" },
  ],
  website: [
    { text: "Företagshemsida med om oss-sektion" },
    { text: "Portfolio för kreativ byrå" },
    { text: "Konsultföretag med tjänstekort" },
  ],
  dashboard: [
    { text: "Analytics dashboard med grafer" },
    { text: "Admin-panel med sidofält" },
    { text: "Projekt-dashboard med kanban-vy" },
  ],
  ecommerce: [
    { text: "Produktsida med bildgalleri och köpknapp" },
    { text: "Checkout-formulär med betalningsalternativ" },
    { text: "Produktlista med filter och sortering" },
  ],
};

export function Suggestions({
  suggestions,
  onSelect,
  disabled = false,
  className = "",
}: SuggestionsProps) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {suggestions.map((suggestion, index) => (
        <button
          key={index}
          onClick={() => onSelect(suggestion.text)}
          disabled={disabled}
          className={`
            group flex items-center gap-2 px-3 py-2
            bg-gray-800/50 hover:bg-gray-700/70
            border border-gray-700/50 hover:border-teal-500/50
            rounded-lg text-sm text-gray-300 hover:text-white
            transition-all duration-200 ease-out
            disabled:opacity-50 disabled:cursor-not-allowed
            touch-manipulation active:scale-[0.98]
          `}
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          {suggestion.icon || (
            <Sparkles className="h-3.5 w-3.5 text-teal-500 group-hover:text-teal-400 transition-colors" />
          )}
          <span className="text-left">{suggestion.text}</span>
        </button>
      ))}
    </div>
  );
}

// Compact pill variant for inline suggestions
export function SuggestionPills({
  suggestions,
  onSelect,
  disabled = false,
  className = "",
}: SuggestionsProps) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {suggestions.slice(0, 4).map((suggestion, index) => (
        <button
          key={index}
          onClick={() => onSelect(suggestion.text)}
          disabled={disabled}
          className={`
            px-2.5 py-1
            bg-teal-500/10 hover:bg-teal-500/20
            border border-teal-500/30 hover:border-teal-500/50
            rounded-full text-xs text-teal-400 hover:text-teal-300
            transition-all duration-150
            disabled:opacity-50 disabled:cursor-not-allowed
            touch-manipulation active:scale-[0.98]
            whitespace-nowrap
          `}
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          {suggestion.text.length > 40
            ? suggestion.text.slice(0, 40) + "..."
            : suggestion.text}
        </button>
      ))}
    </div>
  );
}
