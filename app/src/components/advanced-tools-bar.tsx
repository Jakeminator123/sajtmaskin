"use client";

/**
 * AdvancedToolsBar Component
 * ==========================
 *
 * Toolbar with advanced AI tools that become available after project takeover.
 * Includes: Video, Images, Code editing, Copy, Web search
 *
 * Only visible when isProjectOwned is true.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Video,
  ImageIcon,
  Code,
  FileText,
  Search,
  Sparkles,
  Diamond,
  Lock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export type AdvancedTool =
  | "video"
  | "image"
  | "code_edit"
  | "copy"
  | "web_search"
  | "code_refactor";

interface ToolOption {
  id: AdvancedTool;
  label: string;
  description: string;
  icon: React.ReactNode;
  cost: number;
  color: string;
  model: string;
}

const TOOLS: ToolOption[] = [
  {
    id: "video",
    label: "Video",
    description: "Generera video med Sora",
    icon: <Video className="h-4 w-4" />,
    cost: 10,
    color: "text-red-400 border-red-500/50 bg-red-500/10 hover:bg-red-500/20",
    model: "sora-2",
  },
  {
    id: "image",
    label: "Bild",
    description: "Skapa bilder med GPT-Image",
    icon: <ImageIcon className="h-4 w-4" />,
    cost: 3,
    color:
      "text-pink-400 border-pink-500/50 bg-pink-500/10 hover:bg-pink-500/20",
    model: "gpt-image-1",
  },
  {
    id: "code_edit",
    label: "Kod",
    description: "Redigera kodfiler",
    icon: <Code className="h-4 w-4" />,
    cost: 1,
    color:
      "text-emerald-400 border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20",
    model: "gpt-5.1-codex-mini",
  },
  {
    id: "copy",
    label: "Copy",
    description: "Generera texter",
    icon: <FileText className="h-4 w-4" />,
    cost: 1,
    color:
      "text-blue-400 border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20",
    model: "gpt-5-mini",
  },
  {
    id: "web_search",
    label: "Sök",
    description: "Sök på webben",
    icon: <Search className="h-4 w-4" />,
    cost: 2,
    color:
      "text-amber-400 border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20",
    model: "gpt-4o-mini",
  },
  {
    id: "code_refactor",
    label: "Avancerat",
    description: "Tung refaktorering",
    icon: <Sparkles className="h-4 w-4" />,
    cost: 5,
    color:
      "text-purple-400 border-purple-500/50 bg-purple-500/10 hover:bg-purple-500/20",
    model: "gpt-5.1-codex",
  },
];

interface AdvancedToolsBarProps {
  selectedTool: AdvancedTool | null;
  onToolSelect: (tool: AdvancedTool) => void;
  isProjectOwned: boolean;
  onUnlockClick?: () => void;
  disabled?: boolean;
  diamonds?: number;
  className?: string;
}

export function AdvancedToolsBar({
  selectedTool,
  onToolSelect,
  isProjectOwned,
  onUnlockClick,
  disabled = false,
  diamonds = 0,
  className,
}: AdvancedToolsBarProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // If project is not owned, show locked state with informative message
  if (!isProjectOwned) {
    return (
      <div
        className={cn(
          "border border-dashed border-gray-700 bg-gray-900/30 rounded-lg p-4",
          className
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-800/50 rounded-lg">
              <Lock className="h-5 w-5 text-gray-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-400">
                Avancerade AI-verktyg
              </p>
              <p className="text-xs text-gray-600">
                Video, bildgenerering och avancerad kodredigering blir
                tillgängliga när du tar över projektet
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Video className="h-3 w-3" />
              <ImageIcon className="h-3 w-3" />
              <Code className="h-3 w-3" />
            </span>
            <span className="text-[10px] text-gray-600">
              Nästa steg: Ta över
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border border-gray-800 bg-gray-900/50 rounded-lg overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-medium text-white">
            Avancerade verktyg
          </span>
          {selectedTool && (
            <span className="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded">
              {TOOLS.find((t) => t.id === selectedTool)?.label}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        )}
      </button>

      {/* Tools grid */}
      {isExpanded && (
        <div className="px-3 pb-3">
          <div className="grid grid-cols-3 gap-2">
            {TOOLS.map((tool) => {
              const isSelected = selectedTool === tool.id;
              const canAfford = diamonds >= tool.cost;

              return (
                <button
                  key={tool.id}
                  onClick={() => onToolSelect(tool.id)}
                  disabled={disabled || !canAfford}
                  title={`${tool.description} (${tool.cost} 💎) - ${tool.model}`}
                  className={cn(
                    "flex flex-col items-center gap-1 p-3 rounded-lg border transition-all",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    isSelected
                      ? cn("border", tool.color)
                      : "border-gray-700/50 hover:border-gray-600 bg-gray-800/30"
                  )}
                >
                  <div
                    className={cn(
                      "p-2 rounded-lg",
                      isSelected ? tool.color : "bg-gray-700/50"
                    )}
                  >
                    {tool.icon}
                  </div>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      isSelected ? "text-white" : "text-gray-400"
                    )}
                  >
                    {tool.label}
                  </span>
                  <div
                    className={cn(
                      "flex items-center gap-0.5 text-xs",
                      isSelected ? "text-amber-400" : "text-gray-500",
                      !canAfford && "text-red-400"
                    )}
                  >
                    <Diamond className="h-3 w-3" />
                    {tool.cost}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected tool info */}
          {selectedTool && (
            <div className="mt-3 p-2 bg-gray-800/30 rounded-lg">
              <p className="text-xs text-gray-400">
                <span className="text-gray-300 font-medium">
                  {TOOLS.find((t) => t.id === selectedTool)?.label}:
                </span>{" "}
                {TOOLS.find((t) => t.id === selectedTool)?.description}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Modell:{" "}
                <code className="text-teal-400">
                  {TOOLS.find((t) => t.id === selectedTool)?.model}
                </code>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Get tool info by ID
export function getToolInfo(tool: AdvancedTool): ToolOption | undefined {
  return TOOLS.find((t) => t.id === tool);
}

// Get diamond cost for a tool
export function getToolCost(tool: AdvancedTool): number {
  return getToolInfo(tool)?.cost || 1;
}
