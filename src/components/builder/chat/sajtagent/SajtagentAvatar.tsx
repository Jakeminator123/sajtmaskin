"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Video, VideoOff } from "lucide-react";
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
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
      >
        {enabled ? (
          <VideoOff className="size-3.5" />
        ) : (
          <Video className="size-3.5" />
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
    <div className="bg-muted/40 mt-2 flex items-center gap-3 rounded-lg border p-2">
      {avatarReady ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          aria-label="Sajtagentens avatar"
          className="h-24 w-20 shrink-0 rounded-md bg-black object-cover"
        />
      ) : !failed ? (
        <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden="true" />
      ) : null}
      <div className="min-w-0 space-y-1">
        <p className="text-xs" role="status" aria-live="polite">
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
            <button
              type="button"
              onClick={() => void reconnect()}
              className="text-xs underline underline-offset-2"
            >
              Försök ansluta igen
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
