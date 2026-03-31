"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  applyOpenClawTextFieldAction,
  getOpenClawTextFieldContext,
  parseOpenClawMessage,
} from "@/lib/openclaw/text-field-actions";
import type { OpenClawMessage as Msg } from "@/lib/openclaw/openclaw-store";

export function OpenClawMessage({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  const parsed = parseOpenClawMessage(msg.content);
  const action = !isUser ? parsed.action : null;
  const shouldRenderBubble = Boolean(parsed.visibleContent) || !action;

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div className="max-w-[85%] space-y-2">
        {shouldRenderBubble ? (
          <div
            className={cn(
              "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
              isUser
                ? "rounded-br-md bg-primary text-primary-foreground"
                : "rounded-bl-md border border-border bg-muted/50 text-foreground",
            )}
          >
            {parsed.visibleContent || (
              <span className="inline-flex items-center gap-1 opacity-60">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/30" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/30 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/30 [animation-delay:300ms]" />
              </span>
            )}
          </div>
        ) : null}

        {!isUser && action ? (
          <OpenClawActionCard
            key={`${action.target}:${action.value}`}
            action={action}
          />
        ) : null}
      </div>
    </div>
  );
}

function OpenClawActionCard({
  action,
}: {
  action: NonNullable<ReturnType<typeof parseOpenClawMessage>["action"]>;
}) {
  const [actionState, setActionState] = useState<
    "pending" | "approved" | "declined" | "failed"
  >("pending");
  const [actionError, setActionError] = useState<string | null>(null);
  const targetContext = getOpenClawTextFieldContext(action.target);
  const actionLabel = action.label || targetContext?.label || action.target;

  const handleApprove = () => {
    const result = applyOpenClawTextFieldAction(action);
    if (!result.ok) {
      setActionState("failed");
      setActionError(result.error ?? "Kunde inte fylla fältet.");
      return;
    }
    setActionState("approved");
    setActionError(null);
  };

  const handleDecline = () => {
    setActionState("declined");
    setActionError(null);
  };

  return (
    <div className="rounded-2xl border border-primary/20 bg-card p-3 text-foreground">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary/80">
        Fältförslag
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">{actionLabel}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {targetContext?.canWrite === false
          ? "Fältet är låst just nu. Om det blir skrivbart kan du prova igen."
          : "Jag kan lägga in den här texten i fältet när du godkänner."}
      </p>
      <div className="mt-2 max-h-32 overflow-y-auto rounded-xl border border-border bg-muted/50 p-2 text-xs leading-5 whitespace-pre-wrap text-foreground">
        {action.value}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {actionState === "pending" ? (
          <>
            <button
              type="button"
              onClick={handleApprove}
              disabled={targetContext?.canWrite === false}
              className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Godkänn och fyll
            </button>
            <button
              type="button"
              onClick={handleDecline}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/50"
            >
              Avvisa
            </button>
          </>
        ) : null}

        {actionState === "approved" ? (
          <p className="text-xs text-emerald-300">
            Texten lades in i {actionLabel.toLowerCase()}.
          </p>
        ) : null}

        {actionState === "declined" ? (
          <p className="text-xs text-muted-foreground">Förslaget avvisades.</p>
        ) : null}

        {actionState === "failed" ? (
          <p className="text-xs text-rose-300">
            {actionError ?? "Kunde inte fylla fältet."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
