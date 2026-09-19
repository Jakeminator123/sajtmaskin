"use client";

import { memo, useId, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ChevronDown,
  FileCode2,
  Layers,
  Loader2,
  MessageCircle,
  Wrench,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { parseGenerationContent } from "./generation-content";
import {
  hasGenerationWarnings,
  hasPendingVerification,
  hasQueuedAutoFix,
  hasRepairAwaitingAccept,
  readAutoRepairCause,
  type GenerationTurnKind,
} from "./generation-surface-state";
import { STREAMDOWN_PLAIN_COMPONENTS } from "./message-markdown";
import type { AgentLogItem, ToolPart } from "./tooling/types";
import styles from "./GenerationSurface.module.css";

interface GenerationSurfaceProps {
  content: string;
  reasoning?: string;
  isStreaming: boolean;
  isActive: boolean;
  activeLabel?: string | null;
  awaitingReply?: boolean;
  items: AgentLogItem[];
  toolParts: ToolPart[];
  reviews?: ReactNode;
  actions?: ReactNode;
  /** Set by MessageList when the previous raw user row is an auto-repair prompt. */
  turnKind?: GenerationTurnKind;
}

/** One stable surface from the first event through the final post-check. */
export const GenerationSurface = memo(function GenerationSurface({
  content,
  reasoning,
  isStreaming,
  isActive,
  activeLabel,
  awaitingReply = false,
  items,
  toolParts,
  reviews,
  actions,
  turnKind = "generation",
}: GenerationSurfaceProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const rawId = useId();
  const parsed = useMemo(() => parseGenerationContent(content), [content]);
  const files = useMemo(
    () => [...new Map(parsed.files.map((file) => [file.path, file])).values()],
    [parsed.files],
  );
  const warnings = hasGenerationWarnings(toolParts);
  const queuedAutoFix = hasQueuedAutoFix(toolParts);
  const verifying = hasPendingVerification(toolParts);
  const repairAwaitingAccept = hasRepairAwaitingAccept(toolParts);
  const repairCause = turnKind === "repair" ? readAutoRepairCause(toolParts) : null;
  const latestFailure = [...items].reverse().find((item) => item.failed);
  // Attention is this assistant row's own toolParts/items only. A later repair
  // turn never inherits the init card's queued-fix flag, and a remaining
  // advisory on the repair card is its own post-check or gate — not a copy.
  const attention = warnings || Boolean(latestFailure);
  const working = isActive && !awaitingReply;
  const currentFailure = Boolean(latestFailure && latestFailure.label === activeLabel);
  const hasCode = parsed.hasCodeBlocks || content.includes("```") || files.length > 0;
  const fileSummary = formatReplyFileSummary(turnKind, files);
  const hasDetails = Boolean(
    reasoning || items.length || hasCode || reviews || (isStreaming && content),
  );
  const { title, subtitle } = resolveHeadline({
    awaitingReply,
    working,
    currentFailure,
    attention,
    verifying,
    queuedAutoFix,
    turnKind,
    activeLabel,
    hasCode,
    hasDraft: Boolean(reasoning || content),
    fileSummary,
    repairCause,
  });

  return (
    <Collapsible
      open={detailsOpen}
      onOpenChange={setDetailsOpen}
      className={cn(styles.surface, "w-full min-w-0")}
      data-testid="generation-surface"
      data-active={working}
      data-attention={attention}
      data-verifying={verifying}
      data-turn-kind={turnKind}
      data-repair-queued={queuedAutoFix}
    >
      <div className={styles.track} aria-hidden />
      <div className="flex min-h-24 items-start gap-3 px-4 py-4">
        <div className={styles.signal} aria-hidden>
          {awaitingReply ? (
            <MessageCircle className="size-5" />
          ) : working && !currentFailure ? (
            <>
              <span />
              <span />
              <span />
              <span />
            </>
          ) : attention ? (
            <AlertTriangle className="size-5 text-amber-500" />
          ) : queuedAutoFix ? (
            <Wrench className="size-5" />
          ) : verifying ? (
            <Loader2 className="size-5 animate-spin text-cyan-400 motion-reduce:animate-none" />
          ) : (
            <Layers className="size-5" />
          )}
        </div>
        <div className="min-w-0 flex-1" role="status" aria-live="polite" aria-atomic="true">
          <p className="text-foreground text-sm leading-5 font-semibold">{title}</p>
          {subtitle && (
            <p className="text-muted-foreground mt-1 min-h-10 text-sm leading-5 wrap-break-word">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Streaming prose and code live in details. The answer appears once,
          without replacing the component when the first file marker arrives. */}
      {!isStreaming && parsed.proseText && (
        <div className="text-foreground px-4 pb-4 text-sm leading-relaxed wrap-break-word">
          <Streamdown components={STREAMDOWN_PLAIN_COMPONENTS} isAnimating={false}>
            {parsed.proseText}
          </Streamdown>
        </div>
      )}
      {actions && <div className="px-4 pb-3 empty:hidden">{actions}</div>}

      {/* Outside the drawer on purpose: the fix is finished and one click away
          in the version panel, so it must not depend on opening details. */}
      {repairAwaitingAccept && (
        <div
          className="mx-4 mb-3 flex items-start gap-2 rounded-md border border-indigo-500/50 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200"
          data-testid="generation-repair-notice"
        >
          <Wrench className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold">Fix finns att acceptera i versionspanelen</p>
            <p className="text-indigo-200/80 mt-1">
              Den lagade versionen är klar men inte applicerad än.
            </p>
          </div>
        </div>
      )}

      <div className="border-border/60 flex min-h-12 flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
        <span className="text-muted-foreground inline-flex items-center gap-2 text-xs tabular-nums">
          {files.length > 0 ? (
            <>
              <FileCode2 className="size-3.5" aria-hidden />
              {formatFooterFileLabel(turnKind, files.length)}
            </>
          ) : working ? (
            "Pågår"
          ) : verifying ? (
            "Verifieras"
          ) : (
            ""
          )}
        </span>
        <CollapsibleTrigger
          disabled={!hasDetails}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex min-h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
        >
          {attention && <AlertTriangle className="size-3.5 text-amber-500" aria-hidden />}
          {detailsOpen ? "Dölj detaljer" : "Visa detaljer"}
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform motion-reduce:transition-none",
              detailsOpen && "rotate-180",
            )}
            aria-hidden
          />
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="border-border/60 border-t">
        <div className="space-y-5 px-4 py-4">
          {reasoning && (
            <section aria-label="Resonemang" className="space-y-2">
              <h3 className="text-foreground text-sm font-medium">Resonemang</h3>
              <div className="text-muted-foreground max-h-64 overflow-y-auto text-sm leading-relaxed wrap-break-word">
                <Streamdown components={STREAMDOWN_PLAIN_COMPONENTS} isAnimating={false}>
                  {reasoning}
                </Streamdown>
              </div>
            </section>
          )}
          {isStreaming && parsed.proseText && (
            <section
              aria-label="Pågående svar"
              className="text-muted-foreground text-sm leading-relaxed wrap-break-word"
            >
              <Streamdown components={STREAMDOWN_PLAIN_COMPONENTS} isAnimating={false}>
                {parsed.proseText}
              </Streamdown>
            </section>
          )}
          {items.length > 0 && (
            <section aria-label="Arbetslogg" className="space-y-2">
              <h3 className="text-foreground text-sm font-medium">Arbetslogg</h3>
              <ol className="border-border ml-1 space-y-3 border-l pl-4 text-sm">
                {items.map((item, index) => (
                  <li
                    key={index}
                    className={cn(
                      "wrap-break-word",
                      item.failed ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {item.failed && (
                      <AlertTriangle
                        className="mr-1.5 inline size-3.5"
                        aria-label="Steget misslyckades"
                      />
                    )}
                    {item.label}
                    {item.detail && (
                      <Collapsible className="mt-1">
                        <CollapsibleTrigger className="hover:text-foreground text-xs underline underline-offset-4">
                          Visa underlag
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2 max-h-64 overflow-auto text-xs leading-relaxed whitespace-pre-wrap">
                          {item.detail}
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
          {reviews && (
            <section aria-label="Kontrollresultat" className="space-y-3">
              {reviews}
            </section>
          )}
          {files.length > 0 && (
            <section aria-label="Genererade filer" className="space-y-2">
              <h3 className="text-foreground text-sm font-medium">Filer</h3>
              <ul className="text-muted-foreground space-y-2 text-xs">
                {files.map((file) => (
                  <li key={file.path} className="flex items-start gap-2">
                    <FileCode2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 font-mono wrap-anywhere">{file.path}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {hasCode && (
            <div>
              <button
                type="button"
                aria-expanded={rawOpen}
                aria-controls={rawId}
                onClick={() => setRawOpen((open) => !open)}
                className="text-muted-foreground hover:text-foreground rounded-md py-1 text-sm underline underline-offset-4"
              >
                {rawOpen ? "Dölj råtext" : "Visa råtext"}
              </button>
              <pre
                id={rawId}
                hidden={!rawOpen}
                className="bg-muted/30 text-muted-foreground mt-2 max-h-80 overflow-auto rounded-lg p-3 font-mono text-xs leading-5 wrap-anywhere whitespace-pre-wrap"
              >
                {rawOpen ? content : ""}
              </pre>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});

function formatReplyFileSummary(
  turnKind: GenerationTurnKind,
  files: Array<{ path: string }>,
): string | null {
  if (files.length === 0) return null;
  if (turnKind === "repair") {
    if (files.length === 1) return `1 fil ändrad: ${files[0].path}`;
    if (files.length <= 3) {
      return `${files.length} filer ändrade: ${files.map((file) => file.path).join(", ")}`;
    }
    return `${files.length} filer ändrade`;
  }
  return files.length === 1 ? "1 fil i svaret" : `${files.length} filer i svaret`;
}

function formatFooterFileLabel(turnKind: GenerationTurnKind, fileCount: number): string {
  if (turnKind === "repair") {
    return fileCount === 1 ? "1 fil ändrad" : `${fileCount} filer ändrade`;
  }
  return fileCount === 1 ? "1 fil i svaret" : `${fileCount} filer i svaret`;
}

function joinSentences(...parts: Array<string | null | undefined>): string | null {
  const sentences = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  if (sentences.length === 0) return null;
  return sentences
    .map((sentence) => (sentence.endsWith(".") ? sentence : `${sentence}.`))
    .join(" ");
}

/**
 * Kortets ord, hållna utanför JSX:en. Ordningen är poängen: väntar, arbetar,
 * riktiga varningar, köad reparation, verifiering, klart.
 *
 * En köad AUTO-FIX är inte "Kontroller att se över" — den har en egen, lugn
 * statusrad. En pågående kontroll får inte heller låna varningens ord, och
 * noll varningar får inte läsas som klart medan verify-lanen precis startat.
 */
function resolveHeadline({
  awaitingReply,
  working,
  currentFailure,
  attention,
  verifying,
  queuedAutoFix,
  turnKind,
  activeLabel,
  hasCode,
  hasDraft,
  fileSummary,
  repairCause,
}: {
  awaitingReply: boolean;
  working: boolean;
  currentFailure: boolean;
  attention: boolean;
  verifying: boolean;
  queuedAutoFix: boolean;
  turnKind: GenerationTurnKind;
  activeLabel?: string | null;
  hasCode: boolean;
  hasDraft: boolean;
  fileSummary: string | null;
  repairCause: string | null;
}): { title: string; subtitle: string | null } {
  const isRepair = turnKind === "repair";
  const namedTurn = isRepair || Boolean(fileSummary) || hasCode;
  const doneTitle = isRepair ? "Automatisk reparation" : "Ursprunglig generering";
  const reviewHint = "Se kontrollresultatet i detaljerna";
  const queuedHint = "En automatisk reparation startade";

  if (awaitingReply) {
    return { title: "Ditt svar behövs", subtitle: "Svara i chatten för att fortsätta." };
  }
  if (working) {
    return {
      title: currentFailure
        ? "Ett byggsteg misslyckades"
        : isRepair
          ? "Reparerar sajten"
          : "Arbetar med din sajt",
      subtitle:
        activeLabel ||
        (hasCode
          ? isRepair
            ? "Skriver om den fil som behöver lagas…"
            : "Skapar sidor och komponenter…"
          : hasDraft
            ? "Tar fram ett förslag…"
            : "Förbereder underlaget…"),
    };
  }
  if (attention) {
    if (namedTurn) {
      return {
        title: doneTitle,
        subtitle: joinSentences(
          fileSummary,
          queuedAutoFix ? queuedHint : null,
          isRepair ? repairCause : null,
          verifying ? "Verifieringen är inte klar än. Se kontrollresultatet i detaljerna" : reviewHint,
        ),
      };
    }
    return {
      title: "Kontroller att se över",
      subtitle: verifying
        ? "Verifieringen är inte klar än. Se kontrollresultatet i detaljerna."
        : "Se kontrollresultatet i detaljerna.",
    };
  }
  if (queuedAutoFix) {
    return {
      title: namedTurn ? doneTitle : "Automatisk reparation startade",
      subtitle: joinSentences(
        fileSummary,
        queuedHint,
        verifying ? "Verifieringen är inte klar än" : null,
      ),
    };
  }
  if (verifying) {
    return {
      title: "Verifieringen pågår",
      subtitle: "Ändringarna är sparade, men kontrollen är inte klar än.",
    };
  }
  if (namedTurn) {
    return {
      title: doneTitle,
      subtitle:
        joinSentences(fileSummary, isRepair ? repairCause : null) ??
        (hasCode ? "Genereringen har avslutats." : null),
    };
  }
  return {
    title: "Sajtmaskin",
    subtitle: hasCode ? "Genereringen har avslutats." : null,
  };
}
