"use client";

import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import { OpenClawChatPanel } from "./OpenClawChatPanel";

export function OpenClawChat() {
  const { isOpen, toggle, close } = useOpenClawStore();

  return (
    <div className="fixed right-6 bottom-6 z-50 flex flex-col items-end gap-3">
      {/* Chat panel */}
      <div
        className={cn(
          "origin-bottom-right transition-all duration-200 ease-out",
          isOpen
            ? "pointer-events-auto scale-100 opacity-100"
            : "pointer-events-none scale-95 opacity-0",
        )}
      >
        <OpenClawChatPanel onClose={close} />
      </div>

      {/* FAB toggle */}
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "group flex items-center gap-2 rounded-full px-4 py-3 shadow-lg transition-all duration-200",
          "bg-primary text-primary-foreground hover:bg-primary/90",
          isOpen && "bg-muted text-muted-foreground hover:bg-muted/90",
        )}
        aria-label={isOpen ? "Stang chattrutan" : "Oppna chattrutan"}
      >
        <MessageCircle className="h-5 w-5" />
        {!isOpen && (
          <span className="text-sm font-medium">Hjalp?</span>
        )}
      </button>
    </div>
  );
}
