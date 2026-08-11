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
const OPEN_FENCE_RE = /```(\w+)?[^\n]*(?:\n|$)/;
const STREAM_FILE_HEADER_RE = /(?:^|\n)([a-z0-9]+) file="([^"]+)"[^\n]*(?:\n|$)/;
const TAIL_FILE_HEADER_RE = /(?:^|\n)(?:```)?([a-z0-9]+) file="([^"]+)"[^\n]*(?:\n|$)/g;
const FILE_ATTRIBUTE_RE = /file="([^"]+)"/;

interface TailStart {
  index: number;
  language: string;
  path: string | null;
}

/**
 * Hittar där en oavslutad kodsvans börjar. Kompletta block är redan bortplockade
 * ur `residual`, så en kvarvarande fence — eller en `<lang> file="…"`-rad i
 * radbörjan — är per definition en oavslutad svans.
 *
 * Båda formerna prövas och den som ligger TIDIGAST vinner. Att returnera på
 * fence-träffen först lät en kvarglömd fence längre ner i strömmen flytta
 * klippet framåt, så all ofenced kod däremellan blev kvar som prosa — en rå
 * kodvägg i chatten (observerat i prod 2026-07-27: stream-header på index 1,
 * kvarglömd fence på index 20 879).
 */
function findTailStart(residual: string): TailStart | null {
  const candidates: TailStart[] = [];

  const fenceMatch = OPEN_FENCE_RE.exec(residual);
  if (fenceMatch && residual.slice(fenceMatch.index + fenceMatch[0].length).trim()) {
    candidates.push({
      index: fenceMatch.index,
      language: fenceMatch[1] ?? "",
      path: FILE_ATTRIBUTE_RE.exec(fenceMatch[0])?.[1] ?? null,
    });
  }

  const streamMatch = STREAM_FILE_HEADER_RE.exec(residual);
  if (streamMatch && residual.slice(streamMatch.index + streamMatch[0].length).trim()) {
    candidates.push({
      index: streamMatch.index + (streamMatch[0].startsWith("\n") ? 1 : 0),
      language: streamMatch[1],
      path: streamMatch[2],
    });
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((earliest, candidate) =>
    candidate.index < earliest.index ? candidate : earliest,
  );
}

/**
 * Räknar upp varje fil i den avklippta svansen. En svans kan innehålla flera
 * filer när fence-parningen hamnat ur fas, och då ska det kollapsade kortet
 * rapportera alla — inte bara den första.
 */
function collectTailFiles(tail: string): GeneratedFile[] {
  const re = new RegExp(TAIL_FILE_HEADER_RE.source, TAIL_FILE_HEADER_RE.flags);
  const headers: { start: number; end: number; language: string; path: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(tail)) !== null) {
    headers.push({
      start: match.index,
      end: match.index + match[0].length,
      language: match[1],
      path: match[2],
    });
  }

  return headers.map((header, i) => ({
    path: header.path,
    language: header.language,
    lineCount: tail.slice(header.end, headers[i + 1]?.start ?? tail.length).split("\n").length,
  }));
}

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

  let residual = raw
    .replace(CODE_BLOCK_RE, "")
    .replace(GENERIC_CODE_BLOCK_RE, "")
    .replace(THINKING_RE, "");

  const tailStart = findTailStart(residual);
  if (tailStart) {
    const tail = residual.slice(tailStart.index);
    residual = residual.slice(0, tailStart.index);
    const tailFiles = collectTailFiles(tail);
    genericCodeBlocks += Math.max(1, tailFiles.length);
    totalCodeLines += tail.split("\n").length;
    if (tailFiles.length > 0) {
      files.push(...tailFiles);
    } else if (tailStart.path) {
      files.push({
        path: tailStart.path,
        language: tailStart.language,
        lineCount: tail.split("\n").length,
      });
    }
  }

  return {
    proseText: residual.replace(/\n{3,}/g, "\n\n").trim(),
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

  // Även utan kompletta ```-fences kan innehållet vara kodström (t.ex. när
  // fences klippts/strömmats trasigt men `file="..."`-markörer finns kvar).
  // Sådana meddelanden får aldrig rendera som rå kodvägg i chatten — visa den
  // kollapsade "Genererat innehåll"-rutan i stället. OBS: kräv stream-formen
  // `<lang> file="..."` i radbörjan — prosa som bara nämner `file="..."` mitt i
  // en mening är ett färdigt svar och ska renderas som vanlig text.
  const hasOpenFences =
    !parsed.hasCodeBlocks &&
    (/```/.test(content) || /(?:^|\n)[a-z0-9]+ file="/.test(content));

  if (!parsed.hasCodeBlocks && !hasOpenFences) {
    return (
      <div
        data-testid="generation-summary-prose"
        className="rounded-2xl bg-zinc-800 px-4 py-3 text-sm leading-relaxed text-zinc-100 overflow-hidden wrap-break-word"
      >
        {isStreaming ? streamingNotice : content}
      </div>
    );
  }

  if (!parsed.hasCodeBlocks && hasOpenFences) {
    return (
      <div className="space-y-2 min-w-0">
        <div className="rounded-2xl bg-zinc-800 px-4 py-3 text-sm leading-relaxed text-zinc-100 overflow-hidden wrap-break-word">
          {isStreaming ? streamingNotice : "Genererat innehåll med kodblock."}
        </div>
        {!isStreaming && (
          <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/60 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowRaw((prev) => !prev)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-xs"
            >
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center size-5 rounded-full bg-emerald-500/10">
                  <FileCode2 className="size-3 text-emerald-400" />
                </div>
                <span className="font-medium text-zinc-200">Genererat innehåll</span>
              </div>
              {showRaw ? <ChevronUp className="size-3 text-zinc-500" /> : <ChevronDown className="size-3 text-zinc-500" />}
            </button>
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

  return (
    <div className="space-y-2 min-w-0">
      {previewText && (
        <div
          data-testid="generation-summary-prose"
          className="rounded-2xl bg-zinc-800 px-4 py-3 text-sm leading-relaxed text-zinc-100 whitespace-pre-wrap overflow-hidden wrap-break-word"
        >
          {previewText}
        </div>
      )}

      <div className="min-w-0 rounded-xl border border-zinc-700/50 bg-zinc-900/60 overflow-hidden">
        <div className="flex min-w-0 items-center justify-between gap-2 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
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
            {!isStreaming ? (
              <span className="text-[10px] text-zinc-500">{parsed.totalCodeLines} rader</span>
            ) : (
              <span className="text-[10px] text-zinc-500" title="Radantal räknas först när strömmen är klar">
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
