"use client";

import { Loader2 } from "lucide-react";

export function ThinkingOverlay({ isVisible }: { isVisible: boolean }) {
  if (!isVisible) return null;

  return (
    <div className="flex items-center justify-center gap-3 px-4 py-5">
      <Loader2 className="text-primary h-4 w-4 animate-spin" />
      <span className="text-muted-foreground text-sm">Genererar...</span>
    </div>
  );
}
