"use client";

import { cn } from "@/lib/utils";
import type { OpenClawMessage as Msg } from "@/lib/openclaw/openclaw-store";

export function OpenClawMessage({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted text-muted-foreground rounded-bl-md",
        )}
      >
        {msg.content || (
          <span className="inline-flex items-center gap-1 opacity-60">
            <span className="bg-muted-foreground/60 h-1.5 w-1.5 animate-pulse rounded-full" />
            <span className="bg-muted-foreground/60 h-1.5 w-1.5 animate-pulse rounded-full [animation-delay:150ms]" />
            <span className="bg-muted-foreground/60 h-1.5 w-1.5 animate-pulse rounded-full [animation-delay:300ms]" />
          </span>
        )}
      </div>
    </div>
  );
}
