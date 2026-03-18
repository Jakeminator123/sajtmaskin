import { hashString } from "./helpers";
import type { FileEntry, VersionEntry } from "./types";

export type FileDiff = {
  added: string[];
  removed: string[];
  modified: string[];
};

export type FileContentDiff = {
  path: string;
  type: "added" | "removed" | "modified";
  hunks: DiffHunk[];
};

export type DiffHunk = {
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
};

export type DiffLine = {
  type: "context" | "added" | "removed";
  content: string;
  lineNumber: number;
};

const MAX_FILES = 20;
const MAX_LINES_PER_FILE = 50;

function diffModifiedFile(oldContent: string, newContent: string): DiffHunk[] {
  const oldLines = (oldContent ?? "").split("\n");
  const newLines = (newContent ?? "").split("\n");
  const raw: DiffLine[] = [];
  const maxLen = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    if (oldLine === newLine) {
      raw.push({ type: "context", content: newLine ?? "", lineNumber: i + 1 });
    } else if (oldLine === undefined) {
      raw.push({ type: "added", content: newLine ?? "", lineNumber: i + 1 });
    } else if (newLine === undefined) {
      raw.push({ type: "removed", content: oldLine, lineNumber: i + 1 });
    } else {
      raw.push({ type: "removed", content: oldLine, lineNumber: i + 1 });
      raw.push({ type: "added", content: newLine, lineNumber: i + 1 });
    }
  }

  const hunks: DiffHunk[] = [];
  const contextSize = 2;
  let i = 0;

  while (i < raw.length) {
    while (i < raw.length && raw[i].type === "context") i++;
    if (i >= raw.length) break;

    let start = Math.max(0, i - contextSize);
    while (start > 0 && raw[start - 1].type === "context") start--;

    let end = i;
    while (end < raw.length && raw[end].type !== "context") end++;
    end = Math.min(raw.length, end + contextSize);
    while (end < raw.length && end < i + 1 + contextSize && raw[end].type === "context") end++;

    const chunk = raw.slice(start, Math.min(end, start + MAX_LINES_PER_FILE));
    const firstChange = chunk.find((l) => l.type !== "context");
    const lineNum = firstChange?.lineNumber ?? 1;
    hunks.push({ oldStart: lineNum, newStart: lineNum, lines: chunk });
    i = end;
  }

  if (hunks.length === 0 && raw.length > 0) {
    hunks.push({
      oldStart: 1,
      newStart: 1,
      lines: raw.slice(0, MAX_LINES_PER_FILE),
    });
  }

  return hunks;
}

export function diffFileContents(
  previousFiles: FileEntry[],
  currentFiles: FileEntry[],
): FileContentDiff[] {
  const prevMap = new Map<string, FileEntry>();
  previousFiles.forEach((f) => prevMap.set(f.name, f));
  const currentMap = new Map<string, FileEntry>();
  currentFiles.forEach((f) => currentMap.set(f.name, f));

  const result: FileContentDiff[] = [];

  currentMap.forEach((current, path) => {
    if (result.length >= MAX_FILES) return;
    const prev = prevMap.get(path);
    if (!prev) {
      const content = (current.content ?? "").split("\n");
      const lines: DiffLine[] = content.slice(0, MAX_LINES_PER_FILE).map((c, i) => ({
        type: "added" as const,
        content: c,
        lineNumber: i + 1,
      }));
      if (content.length > MAX_LINES_PER_FILE) {
        lines.push({ type: "context", content: "... (trunkerad)", lineNumber: 0 });
      }
      result.push({
        path,
        type: "added",
        hunks: [{ oldStart: 0, newStart: 1, lines }],
      });
      return;
    }
    if ((prev.content ?? "") !== (current.content ?? "")) {
      const hunks = diffModifiedFile(prev.content ?? "", current.content ?? "");
      if (hunks.length > 0) {
        result.push({ path, type: "modified", hunks });
      }
    }
  });

  prevMap.forEach((_prev, path) => {
    if (result.length >= MAX_FILES) return;
    if (!currentMap.has(path)) {
      const content = (prevMap.get(path)?.content ?? "").split("\n");
      const lines: DiffLine[] = content.slice(0, MAX_LINES_PER_FILE).map((c, i) => ({
        type: "removed" as const,
        content: c,
        lineNumber: i + 1,
      }));
      if (content.length > MAX_LINES_PER_FILE) {
        lines.push({ type: "context", content: "... (trunkerad)", lineNumber: 0 });
      }
      result.push({
        path,
        type: "removed",
        hunks: [{ oldStart: 1, newStart: 0, lines }],
      });
    }
  });

  return result;
}

export function resolvePreviousVersionId(
  currentVersionId: string,
  versions: VersionEntry[],
): string | null {
  const byDate = [...versions].sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bTime - aTime;
  });
  const index = byDate.findIndex(
    (entry) => entry.versionId === currentVersionId || entry.id === currentVersionId,
  );
  if (index === -1) {
    return byDate[0]?.versionId || byDate[0]?.id || null;
  }
  return byDate[index + 1]?.versionId || byDate[index + 1]?.id || null;
}

function buildFileHashMap(files: FileEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  files.forEach((file) => {
    map.set(file.name, hashString(file.content ?? ""));
  });
  return map;
}

export function diffFiles(previous: FileEntry[], current: FileEntry[]): FileDiff {
  const prevMap = buildFileHashMap(previous);
  const nextMap = buildFileHashMap(current);
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  nextMap.forEach((hash, name) => {
    if (!prevMap.has(name)) {
      added.push(name);
      return;
    }
    if (prevMap.get(name) !== hash) {
      modified.push(name);
    }
  });

  prevMap.forEach((_hash, name) => {
    if (!nextMap.has(name)) removed.push(name);
  });

  return { added, removed, modified };
}
