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
        toast("Chatten finns kvar nere till vänster", { duration: 3000 });
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
            "absolute left-3 bottom-3 z-30",
            "h-12 w-12 items-center justify-center",
            "rounded-full border border-border/40 bg-background/95 backdrop-blur-md",
            "text-primary shadow-md transition-all hover:scale-105 hover:shadow-lg",
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
        "bg-background flex min-h-0 w-full flex-col",
        mobileVisible ? "flex" : "hidden",
        "lg:absolute lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[340px]",
        "lg:border-r lg:border-border/30 lg:bg-background/95 lg:backdrop-blur-md",
        "lg:transition-transform lg:duration-200",
        className,
      )}
    >
      <div className="hidden shrink-0 items-center justify-between border-b border-border/20 px-3 py-1.5 lg:flex">
        <span className="text-xs font-medium text-muted-foreground">Chatt</span>
        <button
          type="button"
          onClick={() => setIsMinimized(true)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
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
