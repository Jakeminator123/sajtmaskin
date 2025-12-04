"use client";

import { cn } from "@/lib/utils";
import { Diamond } from "lucide-react";
import { AgentMode, getModeInfo } from "./agent-mode-selector";

interface CostIndicatorProps {
  mode: AgentMode;
  currentBalance: number;
  className?: string;
}

export function CostIndicator({
  mode,
  currentBalance,
  className,
}: CostIndicatorProps) {
  const modeInfo = getModeInfo(mode);
  const canAfford = currentBalance >= modeInfo.cost;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm",
        canAfford
          ? "bg-gray-800/50 text-gray-300"
          : "bg-red-500/10 border border-red-500/30 text-red-400",
        className
      )}
    >
      <span className="text-gray-400">Kostnad:</span>
      <span className="flex items-center gap-1 font-semibold">
        <Diamond className="h-4 w-4 text-amber-400" />
        {modeInfo.cost}
      </span>
      {!canAfford && (
        <span className="text-xs text-red-400">
          (du har {currentBalance})
        </span>
      )}
    </div>
  );
}

// Compact version for inline use
export function CostBadge({
  cost,
  className,
}: {
  cost: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium",
        "bg-amber-500/10 text-amber-400 border border-amber-500/20",
        className
      )}
    >
      <Diamond className="h-3 w-3" />
      {cost}
    </span>
  );
}

