"use client";

import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/help-tooltip";
import { Zap, Star, Diamond } from "lucide-react";
import { cn } from "@/lib/utils";

export type QualityLevel = "budget" | "standard" | "premium";

interface QualitySelectorProps {
  value: QualityLevel;
  onChange: (level: QualityLevel) => void;
  disabled?: boolean;
}

interface QualityOption {
  id: QualityLevel;
  label: string;
  icon: React.ElementType;
  description: string;
  helpText: string;
}

const qualityOptions: QualityOption[] = [
  {
    id: "budget",
    label: "Snabb",
    icon: Zap,
    description: "Snabba utkast",
    helpText:
      "Snabbaste alternativet för enkla sidor och utkast. Använder v0-1.5-md modellen. Lägst kostnad per generering.",
  },
  {
    id: "standard",
    label: "Standard",
    icon: Star,
    description: "Balanserad",
    helpText:
      "Bra balans mellan hastighet och kvalitet. Rekommenderas för de flesta projekt. Använder v0-1.5-md modellen.",
  },
  {
    id: "premium",
    label: "Premium",
    icon: Diamond,
    description: "Bäst kvalitet",
    helpText:
      "Högsta kvaliteten med störst kontextfönster (512K tokens). Använder v0-1.5-lg modellen. Bäst för komplexa projekt.",
  },
];

export function QualitySelector({
  value,
  onChange,
  disabled = false,
}: QualitySelectorProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-zinc-900/50 rounded-lg border border-zinc-800">
      {qualityOptions.map((option) => {
        const Icon = option.icon;
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
                  ? "bg-zinc-800 text-zinc-100 hover:bg-zinc-800"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
              )}
            >
              <Icon
                className={cn(
                  "h-3.5 w-3.5",
                  isSelected && option.id === "budget" && "text-yellow-500",
                  isSelected && option.id === "standard" && "text-blue-500",
                  isSelected && option.id === "premium" && "text-purple-500"
                )}
              />
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

