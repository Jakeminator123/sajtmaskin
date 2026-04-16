"use client";

import { Loader2 } from "lucide-react";

export function ThinkingOverlay({ isVisible }: { isVisible: boolean }) {
  if (!isVisible) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex flex-col items-center gap-4 px-4 py-6">
      <div className="relative flex items-center gap-3">
        <Loader2 className="text-primary h-5 w-5 animate-spin" />
        <span className="text-muted-foreground text-sm">Genererar…</span>
      </div>
    </div>
  );
}
