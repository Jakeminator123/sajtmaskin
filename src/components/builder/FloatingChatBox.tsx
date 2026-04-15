"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, MessageSquare } from "lucide-react";
import { toast } from "sonner";

interface FloatingChatBoxProps {
  children: ReactNode;
  mobileVisible?: boolean;
  className?: string;
  autoMinimize?: boolean;
}

export function FloatingChatBox({ children, mobileVisible = true, className, autoMinimize = false }: FloatingChatBoxProps) {
  const [isMinimized, setIsMinimized] = useState(autoMinimize);
  const prevAutoMinimize = useRef(autoMinimize);

  useEffect(() => {
    if (autoMinimize && !prevAutoMinimize.current) {
      setIsMinimized(true);
      if (typeof window !== "undefined" && window.innerWidth >= 1024) {
        toast("Chatten ligger kvar nere till vänster.", { duration: 3000 });
      }
    }
    prevAutoMinimize.current = autoMinimize;
  }, [autoMinimize]);

  if (isMinimized) {
    return (
      <>
        <div className={cn("flex min-h-0 w-full flex-col lg:hidden", mobileVisible ? "flex" : "hidden")}>
          {children}
        </div>
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className={cn(
            "hidden lg:flex",
            "absolute bottom-3 left-3 z-30",
            "h-12 w-12 items-center justify-center",
            "rounded-2xl border border-border/50 bg-card/90 text-primary shadow-sm backdrop-blur-md",
            "transition-[transform,box-shadow,background-color] duration-[var(--transition-base,200ms)] ease-[var(--ease-out-soft,cubic-bezier(0.16,1,0.3,1))]",
            "hover:border-primary/25 hover:bg-card hover:shadow-md active:scale-[0.98]",
          )}
          aria-label="Öppna chatten"
          title="Öppna chatten"
        >
          <MessageSquare className="h-5 w-5" />
        </button>
      </>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-0 w-full flex-col bg-background",
        mobileVisible ? "flex" : "hidden",
        "lg:absolute lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[340px]",
        "lg:border-r lg:border-border/35 lg:bg-background/95 lg:backdrop-blur-md",
        "lg:transition-[transform,opacity] lg:duration-[var(--transition-base,200ms)]",
        className,
      )}
    >
      <div className="hidden shrink-0 items-center justify-between border-b border-border/35 bg-card/30 px-3 py-2.5 lg:flex">
        <span className="text-xs font-medium tracking-wide text-muted-foreground">Chatt</span>
        <button
          type="button"
          onClick={() => setIsMinimized(true)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-[var(--transition-fast,150ms)] hover:bg-muted/60 hover:text-foreground"
          aria-label="Minimera chatten"
          title="Minimera"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
