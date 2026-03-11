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
  switch (lang) {
    case "tsx":
      return { color: "bg-blue-500/15 text-blue-300 border-blue-500/20", label: "TSX" };
    case "jsx":
      return { color: "bg-blue-500/15 text-blue-300 border-blue-500/20", label: "JSX" };
    case "ts":
      return { color: "bg-sky-500/15 text-sky-300 border-sky-500/20", label: "TS" };
    case "css":
      return { color: "bg-pink-500/15 text-pink-300 border-pink-500/20", label: "CSS" };
    case "json":
      return { color: "bg-amber-500/15 text-amber-300 border-amber-500/20", label: "JSON" };
    default:
      return { color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20", label: lang.toUpperCase() };
  }
}

interface GenerationSummaryProps {
  content: string;
  isStreaming?: boolean;
}

export const GenerationSummary = memo(function GenerationSummary({
  content,
  isStreaming = false,
}: GenerationSummaryProps) {
  const [showRaw, setShowRaw] = useState(false);
  const parsed = useMemo(() => parseGenerationContent(content), [content]);
  const streamingNotice =
    "Buildern genererar nu komponenter och filer. Följ agentloggen för detaljer medan innehållet sammanställs.";

  if (!parsed.hasCodeBlocks) {
    return (
      <div className="rounded-2xl bg-zinc-800 px-4 py-3 text-sm leading-relaxed text-zinc-100 overflow-hidden wrap-break-word">
        {isStreaming ? streamingNotice : content}
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

  return (
    <div className="space-y-2 min-w-0">
      {previewText && (
        <div className="rounded-2xl bg-zinc-800 px-4 py-3 text-sm leading-relaxed text-zinc-100 whitespace-pre-wrap overflow-hidden wrap-break-word">
          {previewText}
        </div>
      )}

      <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/60 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2">
            {isStreaming ? (
              <div className="relative flex items-center justify-center size-5">
                <span className="absolute inline-flex size-4 animate-ping rounded-full bg-emerald-500/30" />
                <Loader2 className="relative size-3.5 animate-spin text-emerald-400" />
              </div>
            ) : (
              <div className="flex items-center justify-center size-5 rounded-full bg-emerald-500/10">
                <FileCode2 className="size-3 text-emerald-400" />
              </div>
            )}
            <span className="text-xs font-medium text-zinc-200">
              {isStreaming ? "Genererar" : "Genererat"}{" "}
              <span className="text-emerald-400">{generatedUnitLabel}</span>
            </span>
            <span className="text-[10px] text-zinc-500">{parsed.totalCodeLines} rader</span>
          </div>
          {!isStreaming && (
            <button
              type="button"
              onClick={() => setShowRaw((prev) => !prev)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors",
                showRaw
                  ? "bg-zinc-700/50 text-zinc-200"
                  : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300",
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
          <div className="border-t border-zinc-700/40 bg-black/30">
            <div className="max-h-[400px] overflow-auto p-3">
              <pre className="whitespace-pre-wrap wrap-break-word text-[11px] leading-5 text-zinc-400 font-mono">
                {content}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
