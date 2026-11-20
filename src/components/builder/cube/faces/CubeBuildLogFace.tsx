"use client";

/**
 * Byggloggen som egen yta i byggkuben: det senaste byggets läge, filer och —
 * för admin — arbetsloggen.
 *
 * Läser samma byggdata som byggkortet i chatten (`MessageList` →
 * `GenerationSurface`) men är en ren läsvy: inga knappar, inga motfrågor.
 * Kortet i Svar-sidan äger fortfarande det som går att göra. Samma regel som
 * där avgör vad som syns: arbetsloggen (modellnamn, profiler, faser) är för
 * admin, alla andra ser läge och filer.
 */

import { Fragment, useMemo } from "react";
import { AlertTriangle, CheckCircle2, FileCode2, Loader2 } from "lucide-react";
import { useAuthStore } from "@/lib/auth/auth-store";
import { toAIElementsFormat, type MessagePart } from "@/lib/builder/message-adapter";
import type { ChatMessage } from "@/lib/builder/types";
import { cn } from "@/lib/utils";
import { parseGenerationContent } from "../../chat/generation-content";
import { buildAgentLogItems, getActiveAgentLogLabel } from "../../chat/tooling/agent-log";
import { groupAgentLogItems } from "../../chat/tooling/agent-log-groups";
import type { ToolPart } from "../../chat/tooling/types";

export interface CubeBuildLogFaceProps {
  messages: ReadonlyArray<ChatMessage>;
  /** En byggström pågår i chatten. */
  isStreaming: boolean;
}

interface LatestBuild {
  toolParts: ToolPart[];
  content: string;
  isStreaming: boolean;
}

/**
 * Det senaste svaret från byggmotorn som faktiskt är ett bygge: det bär
 * verktygssteg eller filer, eller strömmar just nu. Ett rent textsvar (en
 * motfråga, en plan) är inget bygge och får inte rapporteras som «klart, 0
 * filer».
 */
export function selectLatestBuild(messages: ReadonlyArray<ChatMessage>): LatestBuild | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    const formatted = toAIElementsFormat(message);
    const toolParts = formatted.parts.filter(
      (part): part is Extract<MessagePart, { type: "tool" }> => part.type === "tool",
    );
    const content = formatted.parts
      .filter((part): part is Extract<MessagePart, { type: "text" }> => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    const isStreaming = Boolean(message.isStreaming);
    if (
      toolParts.length === 0 &&
      !isStreaming &&
      parseGenerationContent(content).files.length === 0
    ) {
      continue;
    }
    return { toolParts, content, isStreaming };
  }
  return null;
}

export function CubeBuildLogFace({ messages, isStreaming }: CubeBuildLogFaceProps) {
  const isAdmin = useAuthStore((state) => state.user?.isAdmin === true);
  const latest = useMemo(() => selectLatestBuild(messages), [messages]);
  const files = useMemo(
    () => (latest ? parseGenerationContent(latest.content).files : []),
    [latest],
  );
  const items = useMemo(() => (latest ? buildAgentLogItems(latest.toolParts) : []), [latest]);
  const groups = useMemo(() => groupAgentLogItems(items), [items]);

  if (!latest) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-center text-xs leading-5">
        Här visas vad byggmotorn gör när ett bygge pågår, och vad det senaste bygget gav.
      </div>
    );
  }

  const building = isStreaming || latest.isStreaming;
  const failed = items.some((item) => item.failed);
  const activeLabel = building
    ? getActiveAgentLogLabel(latest.toolParts, { includePipelineProgress: latest.isStreaming })
    : null;
  const headline = building
    ? (activeLabel ?? "Bygger din sajt…")
    : failed
      ? "Senaste bygget hade ett steg som misslyckades"
      : "Senaste bygget är klart";

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="cube-buildlog">
      <div
        className="border-border/60 flex shrink-0 items-start gap-2 border-b px-3 py-2.5"
        role="status"
        aria-live="polite"
      >
        {building ? (
          <Loader2 className="text-primary mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" />
        ) : failed ? (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="text-foreground text-sm font-medium wrap-break-word">{headline}</p>
          <p className="text-muted-foreground text-[11px]">
            {files.length === 1 ? "1 fil i svaret" : `${files.length} filer i svaret`}
            {building ? " hittills" : ""}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {isAdmin && groups.length > 0 ? (
          <section aria-label="Arbetslogg" className="space-y-2">
            <h3 className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
              Arbetslogg
            </h3>
            <ol className="space-y-2 text-xs">
              {groups.map((group, index) =>
                group.kind === "facts" ? (
                  <li key={index}>
                    <dl className="border-border/60 bg-muted/20 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border px-2.5 py-2">
                      {group.facts.map((fact, factIndex) => (
                        <Fragment key={factIndex}>
                          <dt className="text-muted-foreground">{fact.key}</dt>
                          <dd className="text-foreground min-w-0 font-medium wrap-break-word">
                            {fact.value}
                          </dd>
                        </Fragment>
                      ))}
                    </dl>
                  </li>
                ) : (
                  <li
                    key={index}
                    className={cn(
                      "border-border ml-1 border-l pl-3 wrap-break-word",
                      group.item.failed ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {group.item.failed ? (
                      <AlertTriangle
                        className="mr-1 inline size-3"
                        aria-label="Steget misslyckades"
                      />
                    ) : null}
                    {group.item.label}
                  </li>
                ),
              )}
            </ol>
          </section>
        ) : null}

        {files.length > 0 ? (
          <section aria-label="Filer" className="space-y-2">
            <h3 className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
              Filer
            </h3>
            <ul className="text-muted-foreground space-y-1.5 text-xs">
              {files.map((file) => (
                <li key={file.path} className="flex items-start gap-2">
                  <FileCode2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 font-mono wrap-anywhere">{file.path}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!isAdmin && files.length === 0 ? (
          <p className="text-muted-foreground text-xs leading-5">
            {building
              ? "Filerna visas här så snart byggmotorn börjar skriva dem."
              : "Det senaste svaret innehöll inga filer."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
