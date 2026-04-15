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
} from "@/lib/templates/client";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Wand2, Zap, Puzzle, Lock, FileText, Palette, Layout, Globe, Gamepad2, HelpCircle,
};

interface TemplateGalleryProps {
  onSelect?: (categoryId: string) => void;
}

export function TemplateGallery({ onSelect }: TemplateGalleryProps) {
  const router = useRouter();
  const categories = getAllV0Categories().filter((c) => c.id !== "uncategorized");

  const handleSelect = (categoryId: string) => {
    onSelect?.(categoryId);
    router.push(`/category/${categoryId}`);
  };

  return (
    <div
      className="grid w-full max-w-6xl grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
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
            className="group flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-sm transition-[border-color,box-shadow,background-color] duration-200 hover:border-primary/25 hover:bg-muted/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Icon className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold tracking-tight text-foreground truncate">{category.title}</p>
              <p className="text-[11px] text-muted-foreground">{count}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
