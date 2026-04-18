"use client";

import { memo, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, FileCode2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface GeneratedFile {
  path: string;
  language: string;
  lineCount: number;
}

interface ParsedContent {
  proseText: string;
  files: GeneratedFile[];
  hasCodeBlocks: boolean;
  genericCodeBlocks: number;
  totalCodeLines: number;
}

const CODE_BLOCK_RE = /```(\w+)\s+file="([^"]+)"[^\n]*\n([\s\S]*?)```/g;
const GENERIC_CODE_BLOCK_RE = /```(\w+)?[^\n]*\n([\s\S]*?)```/g;
const THINKING_RE = /<Thinking>([\s\S]*?)<\/Thinking>/gi;

function parseGenerationContent(raw: string): ParsedContent {
  const files: GeneratedFile[] = [];
  let genericCodeBlocks = 0;
  let totalCodeLines = 0;

  const codeBlockRe = new RegExp(CODE_BLOCK_RE.source, CODE_BLOCK_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = codeBlockRe.exec(raw)) !== null) {
    const lineCount = match[3].split("\n").length;
    files.push({
      path: match[2],
      language: match[1],
      lineCount,
    });
  }

  const genericCodeBlockRe = new RegExp(GENERIC_CODE_BLOCK_RE.source, GENERIC_CODE_BLOCK_RE.flags);
  while ((match = genericCodeBlockRe.exec(raw)) !== null) {
    genericCodeBlocks += 1;
    totalCodeLines += match[2].split("\n").length;
  }

  const proseText = raw
    .replace(CODE_BLOCK_RE, "")
    .replace(GENERIC_CODE_BLOCK_RE, "")
    .replace(THINKING_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    proseText,
    files,
    hasCodeBlocks: genericCodeBlocks > 0,
    genericCodeBlocks,
    totalCodeLines,
  };
}

function langBadge(lang: string): { color: string; label: string } {
  const label = lang === "tsx" ? "TSX" : lang === "jsx" ? "JSX" : lang === "ts" ? "TS" : lang === "css" ? "CSS" : lang === "json" ? "JSON" : lang.toUpperCase();
  return { color: "bg-muted text-muted-foreground border-border", label };
}

interface GenerationSummaryProps {
  content: string;
  isStreaming?: boolean;
  simplified?: boolean;
}

export const GenerationSummary = memo(function GenerationSummary({
  content,
  isStreaming = false,
  simplified = false,
}: GenerationSummaryProps) {
  const [showRaw, setShowRaw] = useState(false);
  const parsed = useMemo(() => parseGenerationContent(content), [content]);

  const streamingNotice = "Bygger...";

  if (simplified) {
    return (
      <div className="space-y-2 min-w-0">
        <div className="rounded-2xl bg-card px-4 py-3 text-sm leading-relaxed text-foreground overflow-hidden wrap-break-word">
          {isStreaming ? streamingNotice : (parsed.proseText || "Din hemsida är klar!")}
        </div>
        <div className="flex items-center gap-2 px-1">
          {isStreaming ? (
            <Loader2 className="size-3.5 animate-spin text-primary" />
          ) : (
            <FileCode2 className="size-3.5 text-primary" />
          )}
          <span className="text-xs text-muted-foreground">
            {isStreaming ? "Skapar din sajt…" : "Sajten är skapad"}
          </span>
        </div>
      </div>
    );
  }

  const hasOpenFences = !parsed.hasCodeBlocks && /```/.test(content);

  if (!parsed.hasCodeBlocks && !hasOpenFences) {
    return (
      <div className="rounded-2xl bg-card px-4 py-3 text-sm leading-relaxed text-card-foreground overflow-hidden wrap-break-word">
        {isStreaming ? streamingNotice : content}
      </div>
    );
  }

  if (!parsed.hasCodeBlocks && hasOpenFences) {
    return (
      <div className="space-y-2 min-w-0">
        <div className="rounded-2xl bg-card px-4 py-3 text-sm leading-relaxed text-card-foreground overflow-hidden wrap-break-word">
          {isStreaming ? streamingNotice : "Genererat innehåll med kodblock."}
        </div>
        {!isStreaming && (
          <div className="rounded-xl border border-border/50 bg-muted/60 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowRaw((prev) => !prev)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-xs"
            >
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center size-5 rounded-full bg-primary/10">
                  <FileCode2 className="size-3 text-primary" />
                </div>
                <span className="font-medium text-foreground">Genererat innehåll</span>
              </div>
              {showRaw ? <ChevronUp className="size-3 text-muted-foreground" /> : <ChevronDown className="size-3 text-muted-foreground" />}
            </button>
            {showRaw && (
              <div className="border-t border-border/40 bg-background/30">
                <div className="max-h-[400px] overflow-auto p-3">
                  <pre className="whitespace-pre-wrap wrap-break-word text-[11px] leading-5 text-muted-foreground font-mono">
                    {content}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const previewText =
    isStreaming
      ? streamingNotice
      : parsed.proseText;
  const generatedUnitLabel =
    parsed.files.length > 0
      ? `${parsed.files.length} ${parsed.files.length === 1 ? "fil" : "filer"}`
      : `${parsed.genericCodeBlocks} ${parsed.genericCodeBlocks === 1 ? "kodblock" : "kodblock"}`;

  // Under streaming visar preview-panelen redan % + fas + ThinkingOverlay.
  // Visa därför endast "Bygger..."-bubblan här och undvik dubbla statusar.
  if (isStreaming) {
    return (
      <div className="min-w-0">
        <div className="rounded-2xl bg-card px-4 py-3 text-sm leading-relaxed text-card-foreground whitespace-pre-wrap overflow-hidden wrap-break-word">
          {streamingNotice}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 min-w-0">
      {previewText && (
        <div className="rounded-2xl bg-card px-4 py-3 text-sm leading-relaxed text-card-foreground whitespace-pre-wrap overflow-hidden wrap-break-word">
          {previewText}
        </div>
      )}

      <div className="rounded-xl border border-border/50 bg-muted/60 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2">
            {isStreaming ? (
              <Loader2 className="size-3.5 animate-spin text-primary" />
            ) : (
              <div className="flex items-center justify-center size-5 rounded-full bg-primary/10">
                <FileCode2 className="size-3 text-primary" />
              </div>
            )}
            <span className="text-xs font-medium text-foreground">
              {isStreaming ? "Genererar" : "Genererat"}{" "}
              <span className="text-primary">{generatedUnitLabel}</span>
            </span>
            {!isStreaming ? (
              <span className="text-[10px] text-muted-foreground">{parsed.totalCodeLines} rader</span>
            ) : (
              <span className="text-[10px] text-muted-foreground" title="Radantal räknas först när strömmen är klar">
                …
              </span>
            )}
          </div>
          {!isStreaming && (
            <button
              type="button"
              onClick={() => setShowRaw((prev) => !prev)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors",
                showRaw
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              {showRaw ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              {showRaw ? "Dölj" : "Råtext"}
            </button>
          )}
        </div>

        {parsed.files.length > 0 && (
          <div className="flex flex-wrap gap-1 px-3 pb-2.5">
            {parsed.files.map((file) => {
              const badge = langBadge(file.language);
              return (
                <span
                  key={file.path}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium",
                    badge.color,
                  )}
                  title={file.path}
                >
                  <span className="max-w-[140px] truncate font-mono">
                    {file.path.split("/").pop()}
                  </span>
                  <span className="opacity-50">{file.lineCount}L</span>
                </span>
              );
            })}
          </div>
        )}

        {showRaw && (
          <div className="border-t border-border/40 bg-background/30">
            <div className="max-h-[400px] overflow-auto p-3">
              <pre className="whitespace-pre-wrap wrap-break-word text-[11px] leading-5 text-muted-foreground font-mono">
                {content}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
