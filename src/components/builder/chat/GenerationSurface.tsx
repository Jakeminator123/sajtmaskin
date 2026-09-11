"use client";

import { memo, useId, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, FileCode2, Layers, MessageCircle } from "lucide-react";
import { Streamdown } from "streamdown";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { parseGenerationContent } from "./generation-content";
import { hasGenerationWarnings } from "./generation-surface-state";
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
  const latestFailure = [...items].reverse().find((item) => item.failed);
  const attention = warnings || Boolean(latestFailure);
  const working = isActive && !awaitingReply;
  const currentFailure = Boolean(latestFailure && latestFailure.label === activeLabel);
  const hasCode = parsed.hasCodeBlocks || content.includes("```") || files.length > 0;
  const hasDetails = Boolean(
    reasoning || items.length || hasCode || reviews || (isStreaming && content),
  );
  const title = awaitingReply
    ? "Ditt svar behövs"
    : working
      ? currentFailure
        ? "Ett byggsteg misslyckades"
        : "Arbetar med din sajt"
      : attention
        ? "Kontroller att se över"
        : "Sajtmaskin";
  const subtitle = awaitingReply
    ? "Svara i chatten för att fortsätta."
    : working
      ? activeLabel ||
        (hasCode
          ? "Skapar sidor och komponenter…"
          : reasoning || content
            ? "Tar fram ett förslag…"
            : "Förbereder underlaget…")
      : attention
        ? "Se kontrollresultatet i detaljerna."
        : hasCode
          ? "Genereringen har avslutats."
          : null;

  return (
    <Collapsible
      open={detailsOpen}
      onOpenChange={setDetailsOpen}
      className={cn(styles.surface, "w-full min-w-0")}
      data-testid="generation-surface"
      data-active={working}
      data-attention={attention}
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

      <div className="border-border/60 flex min-h-12 flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
        <span className="text-muted-foreground inline-flex items-center gap-2 text-xs tabular-nums">
          {files.length > 0 ? (
            <>
              <FileCode2 className="size-3.5" aria-hidden />
              {files.length} {files.length === 1 ? "fil" : "filer"}
            </>
          ) : working ? (
            "Pågår"
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
