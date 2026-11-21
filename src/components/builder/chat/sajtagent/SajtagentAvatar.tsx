"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Maximize2, Minimize2, Video, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DID_AVATAR_AVAILABLE,
  truncateForSpeech,
  useDidAvatar,
} from "@/lib/openclaw/use-did-avatar";
import { parseOpenClawMessage } from "@/lib/openclaw/text-field-actions";
import { useSajtagent } from "./SajtagentProvider";

/**
 * `inline` = knappen vid komposern, med scenen ovanför inmatningen när den är
 * på. `stage` = en hel yta för avataren (en sida i byggkuben): scenen fyller
 * ytan och startknappen står mitt i den.
 */
export type SajtagentAvatarVariant = "inline" | "stage";

/** D-ID is an output for the existing conversation, never a second chat.
 * The composer's microphone and text field remain the only input. */
export function SajtagentAvatar({ variant = "inline" }: { variant?: SajtagentAvatarVariant }) {
  const agent = useSajtagent();
  const [enabled, setEnabled] = useState(false);
  const available = DID_AVATAR_AVAILABLE && Boolean(agent?.available);

  if (variant === "stage") {
    return (
      <div
        className="flex h-full min-h-0 flex-col items-center justify-center gap-3 p-4"
        data-testid="sajtagent-avatar"
        data-avatar-variant="stage"
      >
        {!available ? (
          <p className="text-muted-foreground max-w-xs text-center text-xs leading-5" role="status">
            Avataren är inte tillgänglig här. Sajtagenten svarar som vanligt i text.
          </p>
        ) : enabled ? (
          <ActiveSajtagentAvatar variant="stage" onTextOnly={() => setEnabled(false)} />
        ) : (
          <>
            <span className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full">
              <Video className="size-6" aria-hidden="true" />
            </span>
            <div className="max-w-xs space-y-1 text-center">
              <p className="text-foreground text-sm font-medium">Prata med Sajtagenten</p>
              <p className="text-muted-foreground text-xs leading-5">
                Avataren läser upp Sajtagentens svar med röst och bild. Du skriver eller talar i
                samma chatt som vanligt.
              </p>
            </div>
            <Button type="button" size="sm" onClick={() => setEnabled(true)}>
              <Video className="size-3.5" aria-hidden="true" />
              Starta avataren
            </Button>
          </>
        )}
      </div>
    );
  }

  if (!available) return null;

  return (
    <div className="mb-2" data-testid="sajtagent-avatar" data-avatar-variant="inline">
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
            : "border-border/70 bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {enabled ? (
          <VideoOff className="size-3" aria-hidden="true" />
        ) : (
          <Video className="size-3" aria-hidden="true" />
        )}
        {enabled ? "Endast text" : "Avatar"}
      </button>
      {enabled ? <ActiveSajtagentAvatar variant="inline" /> : null}
    </div>
  );
}

function ActiveSajtagentAvatar({
  variant,
  onTextOnly,
}: {
  variant: SajtagentAvatarVariant;
  /** Bara scenvarianten: där finns ingen knapp utanför scenen som stänger av. */
  onTextOnly?: () => void;
}) {
  const agent = useSajtagent()!;
  const avatar = useDidAvatar({ enabled: true });
  const [expanded, setExpanded] = useState(false);
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
  const speaking = connectionState === "speaking";
  const status = failed
    ? "Avataren kunde inte ansluta. Du kan fortsätta skriva."
    : speaking
      ? "Sajtagenten talar"
      : avatarReady
        ? "Avataren är redo"
        : "Ansluter avatar…";
  const isStage = variant === "stage";

  // D-ID:s presentatör är en person i stående format, inte en liggande remsa:
  // scenen är 4:5 och stor nog att se ansiktet. Förut var den 80×96 px.
  const video = (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-xl border bg-black shadow-sm transition-[height,border-color] motion-reduce:transition-none",
        "aspect-4/5",
        speaking ? "border-primary/70" : "border-border",
        isStage ? "h-full max-h-[min(26rem,100%)] min-h-0" : expanded ? "h-64" : "h-36",
      )}
      data-testid="sajtagent-avatar-stage"
      data-avatar-speaking={speaking ? "true" : "false"}
    >
      {avatarReady ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          aria-label="Sajtagentens avatar"
          className="h-full w-full object-cover object-top"
        />
      ) : (
        <div className="bg-muted/40 flex h-full w-full items-center justify-center">
          {failed ? (
            <VideoOff className="text-muted-foreground size-5" aria-hidden="true" />
          ) : (
            <Loader2 className="text-muted-foreground size-5 animate-spin" aria-hidden="true" />
          )}
        </div>
      )}
      {speaking ? (
        <div
          className="bg-primary pointer-events-none absolute inset-x-0 bottom-0 h-1"
          aria-hidden="true"
        />
      ) : null}
      {!isStage && avatarReady ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? "Förminska avatar" : "Förstora avatar"}
          title={expanded ? "Förminska avatar" : "Förstora avatar"}
          className="focus-visible:ring-ring absolute top-1.5 right-1.5 rounded-md bg-black/55 p-1 text-white/90 transition-colors hover:bg-black/75 focus-visible:ring-2 focus-visible:outline-none"
        >
          {expanded ? (
            <Minimize2 className="size-3" aria-hidden="true" />
          ) : (
            <Maximize2 className="size-3" aria-hidden="true" />
          )}
        </button>
      ) : null}
    </div>
  );

  const details = (
    <div className={cn("min-w-0 space-y-1", isStage && "text-center")}>
      <p
        className={cn(
          "text-foreground inline-flex items-center gap-1.5 text-xs font-medium",
          isStage && "justify-center",
        )}
        role="status"
        aria-live="polite"
      >
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            failed
              ? "bg-amber-400"
              : speaking
                ? "bg-primary motion-safe:animate-pulse"
                : avatarReady
                  ? "bg-emerald-400"
                  : "bg-muted-foreground motion-safe:animate-pulse",
          )}
          aria-hidden="true"
        />
        {status}
      </p>
      <p className="text-muted-foreground text-[11px]">
        Skriv eller använd mikrofonen i textrutan{isStage ? " på chattsidan" : " nedan"}.
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
      {isStage && onTextOnly ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onTextOnly}
            title="Stäng av avataren och fortsätt i text"
            className="text-muted-foreground h-7"
          >
            <VideoOff className="size-3" aria-hidden="true" />
            Endast text
          </Button>
        </div>
      ) : null}
    </div>
  );

  if (isStage) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center gap-3">
        <div className="flex min-h-0 flex-1 items-center justify-center">{video}</div>
        {details}
      </div>
    );
  }

  return (
    <div className="border-border bg-muted/30 mt-2 flex items-center gap-3 rounded-xl border p-2.5">
      {video}
      {details}
    </div>
  );
}
