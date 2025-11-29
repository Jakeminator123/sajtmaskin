"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { COMPONENTS, type QuickPrompt } from "@/lib/template-data";
import {
  Plus,
  LayoutTemplate,
  Menu,
  AlignJustify,
  CreditCard,
  MessageSquare,
  HelpCircle,
  Grid3X3,
  Mail,
  Image,
  Sparkles,
  X,
} from "lucide-react";

// Icon mapping for components
const componentIcons: Record<string, React.ElementType> = {
  "Header/Navigation": Menu,
  Footer: AlignJustify,
  "Pricing Table": CreditCard,
  "Contact Form": MessageSquare,
  Testimonials: MessageSquare,
  "FAQ Accordion": HelpCircle,
  "Feature Grid": Grid3X3,
  "Newsletter Signup": Mail,
  "Hero Section": Sparkles,
  "Image Gallery": Image,
};

interface ComponentPickerProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export function ComponentPicker({ onSelect, disabled }: ComponentPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const handleSelect = (component: QuickPrompt) => {
    onSelect(component.prompt);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="gap-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600"
      >
        <Plus className="h-4 w-4" />
        Lägg till komponent
      </Button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-72 p-2 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50">
          <div className="flex items-center justify-between px-2 py-1.5 mb-1">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Välj komponent
            </span>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {COMPONENTS.map((component) => {
              const Icon = componentIcons[component.label] || LayoutTemplate;
              return (
                <button
                  key={component.label}
                  onClick={() => handleSelect(component)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-zinc-800 transition-colors group"
                >
                  <div className="p-1.5 rounded-md bg-zinc-800 group-hover:bg-blue-500/20 transition-colors">
                    <Icon className="h-4 w-4 text-zinc-400 group-hover:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-200 group-hover:text-white">
                      {component.label}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
