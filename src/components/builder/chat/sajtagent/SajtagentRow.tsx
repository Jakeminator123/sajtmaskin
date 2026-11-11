"use client";

/**
 * En rad från Sajtagenten i builderns gemensamma tidslinje.
 *
 * Samtal renderas som en vanlig meddelanderad med agentens avatar och namn
 * (och en tänker/skriver-status medan svaret strömmar), så att man direkt ser
 * vem som pratar jämfört med byggmotorn. Interna väckningar (`kind: internal`
 * eller prefix) blir en kort statusrad så systemets egna instruktioner aldrig
 * ser ut som något användaren skrev. Själva bubblan och action-korten är
 * `OpenClawMessage` i builder-utseende.
 */

import { Bot } from "lucide-react";
import { Streamdown } from "streamdown";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { OpenClawMessage } from "@/components/openclaw/OpenClawMessage";
import {
  classifyAgentMessage,
  describeInternalAgentTurn,
} from "@/lib/openclaw/agent-message-kind";
import type { OpenClawMessage as AgentMessage } from "@/lib/openclaw/openclaw-store";
import { STREAMDOWN_PLAIN_COMPONENTS } from "../message-markdown";

/** Agentens avatar: panelens Bot-ikon i builderns diskreta agentton. */
function SajtagentMark() {
  return (
    <span
      aria-hidden="true"
      className="bg-brand-teal/15 text-brand-teal ring-brand-teal/30 inline-flex size-6 shrink-0 items-center justify-center rounded-full ring-1"
    >
      <Bot className="size-3.5" />
    </span>
  );
}

export function SajtagentRow({
  msg,
  streaming = false,
}: {
  msg: AgentMessage;
  /** True only for the assistant row currently receiving SSE chunks. */
  streaming?: boolean;
}) {
  if (classifyAgentMessage(msg) === "internal") {
    return (
      <div
        className="text-muted-foreground bg-muted/40 inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs"
        aria-live="polite"
        data-testid="sajtagent-status-row"
      >
        <Bot className="text-brand-teal h-3.5 w-3.5" aria-hidden="true" />
        <span>{describeInternalAgentTurn(msg.content)}</span>
      </div>
    );
  }

  const isUser = msg.role === "user";
  return (
    <Message from={isUser ? "user" : "assistant"} data-testid="sajtagent-row" data-agent-role={msg.role}>
      <MessageContent className={isUser ? undefined : "w-full max-w-full"}>
        {isUser ? (
          <span className="text-muted-foreground text-[11px] font-medium">Till Sajtagenten</span>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <SajtagentMark />
            <span className="text-foreground text-xs font-semibold">Sajtagenten</span>
            {streaming ? (
              // Innan första tecknet tänker agenten; sedan skriver den.
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px]">
                <span
                  aria-hidden="true"
                  className="bg-brand-teal size-1.5 animate-pulse rounded-full motion-reduce:animate-none"
                />
                {msg.content.trim() ? "Skriver…" : "Tänker…"}
              </span>
            ) : null}
          </div>
        )}
        <OpenClawMessage
          msg={msg}
          streaming={streaming}
          appearance="builder"
          renderText={(text, isAnimating) => (
            <Streamdown
              components={STREAMDOWN_PLAIN_COMPONENTS}
              isAnimating={isAnimating}
              caret={isAnimating ? "block" : undefined}
            >
              {text}
            </Streamdown>
          )}
        />
      </MessageContent>
    </Message>
  );
}
