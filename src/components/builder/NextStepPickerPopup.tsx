"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUGGESTIONS, type Suggestion } from "./PostGenerationAdvisor";

interface NextStepPickerPopupProps {
  onSelect: (suggestion: Suggestion) => void;
  onClose: () => void;
}

export function NextStepPickerPopup({ onSelect, onClose }: NextStepPickerPopupProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/30 px-6 pt-5 pb-3">
          <h3 className="text-base font-semibold text-foreground">Vad vill du göra härnäst?</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-4">
          <div className="space-y-1.5">
            {SUGGESTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelect(s)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-xl border border-border/40 px-4 py-3 text-left transition-all",
                    "hover:border-primary/30 hover:bg-primary/5",
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-primary" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
