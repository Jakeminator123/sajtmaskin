"use client";

import { Code, FileText, ImageIcon, Search, Sparkles } from "lucide-react";

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

// Get mode info by ID
export function getModeInfo(mode: AgentMode): ModeOption {
  return MODES.find((m) => m.id === mode) || MODES[0];
}
