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
            ? "rounded-br-md bg-cyan-400 text-slate-950"
            : "rounded-bl-md border border-white/10 bg-white/5 text-slate-100",
        )}
      >
        {msg.content || (
          <span className="inline-flex items-center gap-1 opacity-60">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-200/70" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-200/70 [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-200/70 [animation-delay:300ms]" />
          </span>
        )}
      </div>
    </div>
  );
}
