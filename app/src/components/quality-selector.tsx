"use client";

/**
 * QualitySelector Component
 * =========================
 *
 * Låter användaren välja mellan 2 kvalitetsnivåer:
 *
 * - Standard (v0-1.5-md): 128K context, snabb, billig
 * - Premium (v0-1.5-lg):  512K context, bäst kvalitet, 10x kostnad
 *
 * Båda använder samma V0_API_KEY.
 */

import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/help-tooltip";
import { Star, Diamond } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QualityLevel } from "@/lib/api-client";

// Re-export for convenience
export type { QualityLevel };

interface QualitySelectorProps {
  value: QualityLevel;
  onChange: (level: QualityLevel) => void;
  disabled?: boolean;
}

interface QualityOption {
  id: QualityLevel;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  helpText: string;
  color: string;
}

const qualityOptions: QualityOption[] = [
  {
    id: "standard",
    label: "Standard",
    icon: Star,
    description: "Snabb & billig",
    helpText:
      "Snabb generering med 128K context window. Använder v0-1.5-md modellen. Perfekt för de flesta projekt. Kostnad: ~$1.5/$7.5 per 1M tokens.",
    color: "text-teal-500",
  },
  {
    id: "premium",
    label: "Premium",
    icon: Diamond,
    description: "Bäst kvalitet",
    helpText:
      "Högsta kvaliteten med 512K context window (4x större). Använder v0-1.5-lg modellen. Bäst för komplexa projekt. Kostnad: ~$15/$75 per 1M tokens (10x).",
    color: "text-amber-500",
  },
];

export function QualitySelector({
  value,
  onChange,
  disabled = false,
}: QualitySelectorProps) {
  // Quality selector component

  return (
    <div className="flex items-center gap-1 p-1 bg-black/50 border border-gray-800">
      {qualityOptions.map((option) => {
        const Icon: React.ComponentType<{ className?: string }> = option.icon;
        const isSelected = value === option.id;

        return (
          <div key={option.id} className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange(option.id)}
              disabled={disabled}
              className={cn(
                "h-8 px-3 gap-1.5 text-xs font-medium transition-all",
                isSelected
                  ? "bg-gray-800 text-white hover:bg-gray-800"
                  : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", isSelected && option.color)} />
              {option.label}
            </Button>
            <div className="absolute -top-1 -right-1">
              <HelpTooltip text={option.helpText} className="h-3 w-3" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
