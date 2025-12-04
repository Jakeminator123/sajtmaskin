"use client";

import { cn } from "@/lib/utils";
import {
  Code,
  FileText,
  ImageIcon,
  Search,
  Sparkles,
  Diamond,
} from "lucide-react";

export type AgentMode =
  | "code_edit"
  | "copy"
  | "image"
  | "web_search"
  | "code_refactor";

interface ModeOption {
  id: AgentMode;
  label: string;
  description: string;
  icon: React.ReactNode;
  cost: number;
  color: string;
}

const MODES: ModeOption[] = [
  {
    id: "code_edit",
    label: "Kod",
    description: "Redigera kodfiler",
    icon: <Code className="h-4 w-4" />,
    cost: 1,
    color: "text-emerald-400 border-emerald-500/50 bg-emerald-500/10",
  },
  {
    id: "copy",
    label: "Copy",
    description: "Generera texter",
    icon: <FileText className="h-4 w-4" />,
    cost: 1,
    color: "text-blue-400 border-blue-500/50 bg-blue-500/10",
  },
  {
    id: "image",
    label: "Media",
    description: "Skapa bilder",
    icon: <ImageIcon className="h-4 w-4" />,
    cost: 3,
    color: "text-pink-400 border-pink-500/50 bg-pink-500/10",
  },
  {
    id: "web_search",
    label: "Sök",
    description: "Sök på webben",
    icon: <Search className="h-4 w-4" />,
    cost: 2,
    color: "text-amber-400 border-amber-500/50 bg-amber-500/10",
  },
  {
    id: "code_refactor",
    label: "Avancerat",
    description: "Tung refaktorering",
    icon: <Sparkles className="h-4 w-4" />,
    cost: 5,
    color: "text-purple-400 border-purple-500/50 bg-purple-500/10",
  },
];

interface AgentModeSelectorProps {
  selectedMode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  disabled?: boolean;
  className?: string;
}

export function AgentModeSelector({
  selectedMode,
  onModeChange,
  disabled = false,
  className,
}: AgentModeSelectorProps) {
  return (
    <div
      className={cn("flex gap-1.5 p-1 bg-gray-900/50 rounded-lg", className)}
    >
      {MODES.map((mode) => {
        const isSelected = selectedMode === mode.id;
        return (
          <button
            key={mode.id}
            onClick={() => onModeChange(mode.id)}
            disabled={disabled}
            title={`${mode.description} (${mode.cost} 💎)`}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-md transition-all",
              "text-sm font-medium",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              isSelected
                ? cn("border", mode.color)
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
            )}
          >
            {mode.icon}
            <span className="hidden sm:inline">{mode.label}</span>
            <span
              className={cn(
                "flex items-center gap-0.5 text-xs",
                isSelected ? "opacity-100" : "opacity-60"
              )}
            >
              <Diamond className="h-3 w-3" />
              {mode.cost}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Get mode info by ID
export function getModeInfo(mode: AgentMode): ModeOption {
  return MODES.find((m) => m.id === mode) || MODES[0];
}

// Get diamond cost for a mode
export function getModeCost(mode: AgentMode): number {
  return getModeInfo(mode).cost;
}
