"use client";

/**
 * ServiceSuggestions Component
 * ============================
 *
 * Shows contextual suggestions based on orchestrator intent.
 * Inspired by v0.app's "Agentic Features" - helping users
 * understand what actions are available.
 *
 * Intent-based suggestions:
 * - web_search → "Vill du att jag söker efter X?"
 * - image_gen → "Ska jag skapa en bild för Y?"
 * - clarify → Show alternatives as buttons
 * - code_only → Suggest refinements
 */

import {
  Globe,
  ImageIcon,
  HelpCircle,
  Wand2,
  Palette,
  Layout,
  FileCode,
  Search,
  Sparkles,
} from "lucide-react";

export type SuggestionIntent =
  | "web_search"
  | "image_gen"
  | "clarify"
  | "image_and_code"
  | "web_and_code"
  | "chat_response"
  | "simple_code"
  | "needs_code_context";

interface ServiceSuggestion {
  text: string;
  prompt: string;
  icon: typeof Sparkles;
  variant: "primary" | "secondary";
}

interface ServiceSuggestionsProps {
  intent?: SuggestionIntent | string;
  clarifyOptions?: string[];
  onSelect: (prompt: string) => void;
  disabled?: boolean;
  className?: string;
}

// Get suggestions based on intent
function getSuggestionsForIntent(
  intent: SuggestionIntent | string | undefined,
  clarifyOptions?: string[]
): ServiceSuggestion[] {
  if (!intent) return [];

  switch (intent) {
    case "web_search":
    case "web_and_code":
      return [
        {
          text: "Sök efter fler exempel",
          prompt: "Sök på webben efter fler designexempel för inspiration",
          icon: Search,
          variant: "primary",
        },
        {
          text: "Hitta konkurrenter",
          prompt: "Sök efter liknande företag och deras hemsidor",
          icon: Globe,
          variant: "secondary",
        },
      ];

    case "image_gen":
    case "image_and_code":
      return [
        {
          text: "Skapa en hero-bild",
          prompt: "Generera en modern hero-bild för sidan",
          icon: ImageIcon,
          variant: "primary",
        },
        {
          text: "Skapa en bakgrundsbild",
          prompt: "Generera en subtil bakgrundsbild som passar designen",
          icon: Palette,
          variant: "secondary",
        },
        {
          text: "Skapa produkt-mockup",
          prompt: "Generera en professionell produkt-mockup",
          icon: ImageIcon,
          variant: "secondary",
        },
      ];

    case "clarify":
      // When AI asks a clarifying question, only show options if explicitly provided
      // Don't show generic design suggestions - let the user answer naturally
      if (clarifyOptions && clarifyOptions.length > 0) {
        return clarifyOptions.map((option, i) => ({
          text: option,
          prompt: option,
          icon: i === 0 ? Wand2 : Layout,
          variant: i === 0 ? ("primary" as const) : ("secondary" as const),
        }));
      }
      // No generic fallback - the user should answer the question in their own words
      return [];

    case "simple_code":
    case "needs_code_context":
      // Don't show generic suggestions for code changes - they're rarely relevant
      // The user knows what they want to do, we don't need to suggest random improvements
      return [];

    case "chat_response":
      return [
        {
          text: "Visa mig ett exempel",
          prompt: "Visa mig ett konkret exempel på hur det kan se ut",
          icon: Wand2,
          variant: "primary",
        },
        {
          text: "Implementera detta",
          prompt: "Implementera det du beskrev i koden",
          icon: FileCode,
          variant: "secondary",
        },
      ];

    default:
      return [];
  }
}

export function ServiceSuggestions({
  intent,
  clarifyOptions,
  onSelect,
  disabled = false,
  className = "",
}: ServiceSuggestionsProps) {
  const suggestions = getSuggestionsForIntent(intent, clarifyOptions);

  if (suggestions.length === 0) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <HelpCircle className="h-3 w-3" />
        <span>Föreslagna åtgärder</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion, index) => {
          const Icon = suggestion.icon;
          const isPrimary = suggestion.variant === "primary";

          return (
            <button
              key={index}
              onClick={() => onSelect(suggestion.prompt)}
              disabled={disabled}
              className={`
                group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
                transition-all duration-200 ease-out
                disabled:opacity-50 disabled:cursor-not-allowed
                touch-manipulation active:scale-[0.98]
                ${
                  isPrimary
                    ? "bg-teal-600/20 border border-teal-500/40 text-teal-300 hover:bg-teal-600/30 hover:text-teal-200"
                    : "bg-gray-800/50 border border-gray-700/50 text-gray-400 hover:bg-gray-700/70 hover:text-gray-300"
                }
              `}
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <Icon
                className={`h-3.5 w-3.5 ${
                  isPrimary ? "text-teal-400" : "text-gray-500"
                }`}
              />
              <span>{suggestion.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Compact inline variant
export function InlineSuggestion({
  text,
  prompt,
  icon: Icon = Sparkles,
  onSelect,
  disabled = false,
}: {
  text: string;
  prompt: string;
  icon?: typeof Sparkles;
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => onSelect(prompt)}
      disabled={disabled}
      className="
        inline-flex items-center gap-1 px-2 py-0.5 rounded 
        bg-teal-600/20 border border-teal-500/30 
        text-xs text-teal-300 hover:bg-teal-600/30 hover:text-teal-200
        transition-colors disabled:opacity-50 disabled:cursor-not-allowed
      "
    >
      <Icon className="h-3 w-3" />
      <span>{text}</span>
    </button>
  );
}
