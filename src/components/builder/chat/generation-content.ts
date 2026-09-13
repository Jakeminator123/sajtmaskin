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
  if (fenceMatch) {
    candidates.push({
      index: fenceMatch.index,
      language: fenceMatch[1] ?? "",
      path: FILE_ATTRIBUTE_RE.exec(fenceMatch[0])?.[1] ?? null,
    });
  }

  const streamMatch = STREAM_FILE_HEADER_RE.exec(residual);
  if (streamMatch) {
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

export function parseGenerationContent(raw: string): ParsedContent {
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
