"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

interface HelpTooltipProps {
  text: string;
  value?: number; // Rating 1-10
  tips?: string;
  className?: string;
}

export function HelpTooltip({ text, value, tips, className }: HelpTooltipProps) {
  // Generate stars based on value (1-10 becomes 1-5 stars)
  const renderStars = (rating: number) => {
    const starCount = Math.ceil(rating / 2);
    return "⭐".repeat(starCount);
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <HelpCircle
            className={`h-4 w-4 text-muted-foreground cursor-help inline-block ml-1 hover:text-foreground transition-colors ${className || ""}`}
          />
        </TooltipTrigger>
        <TooltipContent
          className="max-w-xs bg-zinc-900/95 border-zinc-800 p-3 rounded-lg"
          sideOffset={5}
        >
          <p className="text-sm text-zinc-100">{text}</p>
          {value && (
            <p className="text-xs mt-2 text-zinc-400">
              Värde: {value}/10 {renderStars(value)}
            </p>
          )}
          {tips && (
            <p className="text-xs mt-1 text-blue-400 italic">{tips}</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

