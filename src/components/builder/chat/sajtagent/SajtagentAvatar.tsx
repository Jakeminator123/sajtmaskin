"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Video, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DID_AVATAR_AVAILABLE,
  truncateForSpeech,
  useDidAvatar,
} from "@/lib/openclaw/use-did-avatar";
import { parseOpenClawMessage } from "@/lib/openclaw/text-field-actions";
import { useSajtagent } from "./SajtagentProvider";

/** D-ID is an output for the existing conversation, never a second chat.
 * The composer's microphone and text field remain the only input. */
export function SajtagentAvatar() {
  const agent = useSajtagent();
  const [enabled, setEnabled] = useState(false);
  if (!DID_AVATAR_AVAILABLE || !agent?.available) return null;

  return (
    <div className="mb-2" data-testid="sajtagent-avatar">
      <button
        type="button"
        aria-pressed={enabled}
        aria-label={enabled ? "Stäng av avatar" : "Aktivera avatar"}
        onClick={() => setEnabled((value) => !value)}
        // Samma form som komposerns verktygsknappar; påslaget bär builderns
        // tonade aktiva läge.
        className={cn(
          "focus-visible:ring-ring inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
          enabled
            ? "border-primary/50 bg-primary/10 text-foreground hover:bg-primary/15"
            : "border-border/70 bg-background/80 text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        {enabled ? (
          <VideoOff className="size-3" aria-hidden="true" />
        ) : (
          <Video className="size-3" aria-hidden="true" />
        )}
        {enabled ? "Endast text" : "Avatar"}
      </button>
      {enabled ? <ActiveSajtagentAvatar /> : null}
    </div>
  );
}

function ActiveSajtagentAvatar() {
  const agent = useSajtagent()!;
  const avatar = useDidAvatar({ enabled: true });
  const lastAssistant = agent.messages.findLast(
    (message) => message.role === "assistant",
  );
  // Enabling/re-enabling the avatar must not read old history aloud. A reply
  // that is still streaming at activation may be spoken once it completes.
  const spokenIdRef = useRef(
    agent.isStreaming ? null : (lastAssistant?.id ?? null),
  );
  const { speak, connectionState, avatarReady, releaseBlocked, videoRef, reconnect } = avatar;

  useEffect(() => {
    if (agent.isStreaming || !avatarReady || connectionState !== "connected")
      return;
    if (
      !lastAssistant ||
      lastAssistant.hydrated ||
      lastAssistant.kind === "internal" ||
      lastAssistant.delivery === "interrupted" ||
      lastAssistant.delivery === "streaming" ||
      spokenIdRef.current === lastAssistant.id
    )
      return;
    spokenIdRef.current = lastAssistant.id;
    // Action JSON and internal tool instructions are never voice output.
    const visible = parseOpenClawMessage(lastAssistant.content).visibleContent;
    const speech = truncateForSpeech(visible);
    if (speech) void speak(speech);
  }, [agent.isStreaming, lastAssistant, avatarReady, connectionState, speak]);

  const failed = connectionState === "error";
  const status = failed
    ? "Avataren kunde inte ansluta. Du kan fortsätta skriva."
    : connectionState === "speaking"
      ? "Sajtagenten talar"
      : avatarReady
        ? "Avataren är redo"
        : "Ansluter avatar…";

  return (
    <div className="border-border bg-muted/30 mt-2 flex items-center gap-3 rounded-xl border p-2.5">
      {avatarReady ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          aria-label="Sajtagentens avatar"
          className="h-24 w-20 shrink-0 rounded-md bg-black object-cover"
        />
      ) : !failed ? (
        <Loader2 className="text-muted-foreground size-5 shrink-0 animate-spin" aria-hidden="true" />
      ) : null}
      <div className="min-w-0 space-y-1">
        <p className="text-foreground text-xs font-medium" role="status" aria-live="polite">
          {status}
        </p>
        <p className="text-muted-foreground text-[11px]">
          Skriv eller använd mikrofonen i textrutan nedan.
        </p>
        {failed ? (
          releaseBlocked ? (
            <p className="text-muted-foreground text-[11px]">
              Den tidigare anslutningen avslutas. Försök igen om en stund.
            </p>
          ) : (
            <Button
              type="button"
              variant="link"
              size="xs"
              onClick={() => void reconnect()}
              className="h-auto px-0"
            >
              Försök ansluta igen
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}
