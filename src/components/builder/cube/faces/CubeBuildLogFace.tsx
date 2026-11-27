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

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, FileCode2, Loader2 } from "lucide-react";
import { useAuthStore } from "@/lib/auth/auth-store";
import { toAIElementsFormat, type MessagePart } from "@/lib/builder/message-adapter";
import type { ChatMessage } from "@/lib/builder/types";
import { parseGenerationContent } from "../../chat/generation-content";
import { reconcileCanonicalPreviewParts } from "../../chat/generation-surface-state";
import { buildAgentLogItems, getActiveAgentLogLabel } from "../../chat/tooling/agent-log";
import { AgentWorkLog } from "../../chat/tooling/AgentWorkLog";
import type { ToolPart } from "../../chat/tooling/types";

export type BuildLogPreview = Pick<
  Parameters<typeof reconcileCanonicalPreviewParts>[1], "chatId" | "versionId" | "canonical" | "previewVisible"
>;

export interface CubeBuildLogFaceProps {
  messages: ReadonlyArray<ChatMessage>;
  /** En byggström pågår i chatten. */
  isStreaming: boolean;
  selectedMessageId?: string | null;
  preview?: BuildLogPreview;
  onShowLatest?: () => void;
}

interface BuildLog {
  id: string;
  toolParts: ToolPart[];
  content: string;
  isStreaming: boolean;
}

function buildLogFor(message: ChatMessage, preview?: BuildLogPreview, chatStreaming = false): BuildLog {
  const formatted = toAIElementsFormat(message);
  const rawToolParts = formatted.parts.filter(
    (part): part is Extract<MessagePart, { type: "tool" }> => part.type === "tool",
  );
  const content = formatted.parts
    .filter((part): part is Extract<MessagePart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  const isStreaming = Boolean(message.isStreaming);
  // As in the answers face, only the current message can inherit its version's terminal verdict.
  const toolParts = preview ? reconcileCanonicalPreviewParts(rawToolParts, {
    ...preview, messageId: message.id, isCurrentTurn: true, isStreaming: isStreaming || chatStreaming,
  }) : rawToolParts;
  return { id: message.id, toolParts, content, isStreaming };
}

/**
 * Det senaste svaret från byggmotorn som faktiskt är ett bygge: det strömmar
 * just nu, har skrivit filer, eller har ett steg som misslyckades.
 *
 * Verktygsdelar räcker inte som tecken. Varje svar från byggmotorn har sådana
 * (modellinfo och genereringssteget kommer före allt annat), och en motfråga
 * eller plan bär dessutom `tool:awaiting-input`. Ett sådant svar är inget
 * bygge och får inte rapporteras som «klart, 0 filer» — då gäller bygget före.
 */
export function selectLatestBuild(
  messages: ReadonlyArray<ChatMessage>, preview?: BuildLogPreview, chatStreaming = false,
): BuildLog | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    const log = buildLogFor(message, index === messages.length - 1 ? preview : undefined, chatStreaming);
    if (
      log.isStreaming ||
      parseGenerationContent(log.content).files.length > 0 ||
      log.toolParts.some((part) => part.tool.state === "output-error")
    ) return log;
  }
  return null;
}

export function CubeBuildLogFace({
  messages, isStreaming, selectedMessageId, onShowLatest, preview,
}: CubeBuildLogFaceProps) {
  const isAdmin = useAuthStore((state) => state.user?.isAdmin === true);
  const latest = useMemo(() => selectLatestBuild(messages, preview, isStreaming), [messages, preview, isStreaming]);
  const log = useMemo(() => {
    if (!selectedMessageId || selectedMessageId === latest?.id) return latest;
    const selected = messages.find((row) => row.id === selectedMessageId && row.role === "assistant");
    return selected ? buildLogFor(selected, selected === messages.at(-1) ? preview : undefined, isStreaming) : null;
  }, [messages, latest, selectedMessageId, preview, isStreaming]);
  const files = useMemo(() => log ? parseGenerationContent(log.content).files : [], [log]);
  const items = useMemo(() => log ? buildAgentLogItems(log.toolParts) : [], [log]);
  const showLatest = selectedMessageId && selectedMessageId !== latest?.id && onShowLatest ? (
    <button type="button" onClick={onShowLatest} className="text-primary rounded-sm text-xs underline underline-offset-4">
      Visa senaste bygget
    </button>
  ) : null;

  if (!log) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs leading-5">
        {selectedMessageId
          ? "Det valda byggsvaret finns inte längre i den här vyn."
          : "Här visas vad byggmotorn gör när ett bygge pågår, och vad det senaste bygget gav."}
        {showLatest}
      </div>
    );
  }

  const building = log.isStreaming || (isStreaming && log.id === messages.at(-1)?.id);
  const failed = items.some((item) => item.failed);
  const activeLabel = building
    ? getActiveAgentLogLabel(log.toolParts, { includePipelineProgress: log.isStreaming })
    : null;
  const buildName = selectedMessageId && log.id !== latest?.id ? "Det valda bygget" : "Senaste bygget";
  const headline = building
    ? (activeLabel ?? "Bygger din sajt…")
    : failed
      ? `${buildName} hade ett steg som misslyckades`
      : files.length > 0
        ? `${buildName} är klart`
        : "Arbetslogg för svaret";

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
          {showLatest}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {isAdmin && items.length > 0 ? <AgentWorkLog items={items} /> : null}

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
