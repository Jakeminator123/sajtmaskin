"use client";

import { useRouter } from "next/navigation";
import {
  FileText,
  Gamepad2,
  Globe,
  HelpCircle,
  Layout,
  Lock,
  Palette,
  Puzzle,
  Wand2,
  Zap,
} from "lucide-react";
import {
  getAllV0Categories,
  getTemplatesByCategory,
} from "@/lib/templates/template-data";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Wand2, Zap, Puzzle, Lock, FileText, Palette, Layout, Globe, Gamepad2, HelpCircle,
};

interface TemplateGalleryProps {
  onSelect?: (categoryId: string) => void;
}

export function TemplateGallery({ onSelect }: TemplateGalleryProps) {
  const router = useRouter();
  const categories = getAllV0Categories();

  const handleSelect = (categoryId: string) => {
    onSelect?.(categoryId);
    router.push(`/category/${categoryId}`);
  };

  return (
    <div
      className="grid w-full max-w-6xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      role="list"
    >
      {categories.map((category) => {
        const Icon = iconMap[category.icon] || FileText;
        const count = getTemplatesByCategory(category.id).length;

        return (
          <button
            key={category.id}
            type="button"
            onClick={() => handleSelect(category.id)}
            role="listitem"
            className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-all hover:border-primary/30 hover:bg-muted/50"
          >
            <Icon className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{category.title}</p>
              <p className="text-[11px] text-muted-foreground">{count} mallar</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
