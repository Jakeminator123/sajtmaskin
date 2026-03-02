import type { FileNode } from "@/lib/builder/types";

export type JsxElementRegistryItem = {
  id: string;
  tag: string;
  className: string | null;
  idAttribute: string | null;
  text: string | null;
  filePath: string;
  lineNumber: number;
};

const JSX_TAG_RE = /<([a-z][a-z0-9-]*)\b([^<>]*)\/?>/g;

function flattenFileNodes(nodes: FileNode[]): FileNode[] {
  const flat: FileNode[] = [];
  const walk = (items: FileNode[]) => {
    for (const item of items) {
      if (item.type === "file") {
        flat.push(item);
        continue;
      }
      if (item.children?.length) {
        walk(item.children);
      }
    }
  };
  walk(nodes);
  return flat;
}

function normalizeText(value: string): string | null {
  const cleaned = value.replace(/\{[^}]*\}/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 140);
}

function getStaticAttribute(attrs: string, name: "className" | "class" | "id"): string | null {
  const attrRegex = new RegExp(
    `\\b${name}\\s*=\\s*(?:\\{\\s*)?(["'\`])([\\s\\S]*?)\\1(?:\\s*\\})?`,
    "i",
  );
  const match = attrs.match(attrRegex);
  if (!match?.[2]) return null;
  return match[2].trim() || null;
}

function getLineNumber(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function extractPossibleText(content: string, fromIndex: number): string | null {
  const nextChunk = content.slice(fromIndex, fromIndex + 220);
  const beforeNextTag = nextChunk.split("<")[0] || "";
  return normalizeText(beforeNextTag);
}

function isEligibleFile(path: string): boolean {
  return /\.(tsx|jsx)$/i.test(path);
}

export function buildJsxElementRegistry(files: FileNode[]): JsxElementRegistryItem[] {
  const result: JsxElementRegistryItem[] = [];
  const flatFiles = flattenFileNodes(files);

  for (const file of flatFiles) {
    if (!isEligibleFile(file.path) || !file.content) continue;
    const content = file.content;
    const matches = content.matchAll(JSX_TAG_RE);

    for (const match of matches) {
      const tag = match[1]?.toLowerCase();
      const attrs = match[2] || "";
      const wholeTag = match[0] || "";
      const index = match.index ?? -1;

      if (!tag || index < 0) continue;

      const className = getStaticAttribute(attrs, "className") || getStaticAttribute(attrs, "class");
      const idAttribute = getStaticAttribute(attrs, "id");
      const isSelfClosing = wholeTag.endsWith("/>");
      const text = isSelfClosing ? null : extractPossibleText(content, index + wholeTag.length);
      const lineNumber = getLineNumber(content, index);

      result.push({
        id: `${file.path}:${lineNumber}:${result.length}`,
        tag,
        className,
        idAttribute,
        text,
        filePath: file.path,
        lineNumber,
      });
    }
  }

  return result.sort((a, b) => {
    if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
    return a.lineNumber - b.lineNumber;
  });
}

export function filterJsxElementRegistry(
  items: JsxElementRegistryItem[],
  query: string,
): JsxElementRegistryItem[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return items;
  return items.filter((item) => {
    const haystack = [
      item.tag,
      item.className || "",
      item.idAttribute || "",
      item.text || "",
      item.filePath,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(trimmed);
  });
}

export type CapturedElementHint = {
  tag?: string;
  id?: string | null;
  className?: string | null;
  text?: string | null;
  selector?: string | null;
};

export type RegistryMatch = {
  item: JsxElementRegistryItem;
  score: number;
};

function classOverlap(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/).filter(Boolean));
  const setB = new Set(b.split(/\s+/).filter(Boolean));
  let hits = 0;
  for (const cls of setA) {
    if (setB.has(cls)) hits += 1;
  }
  if (setA.size === 0) return 0;
  return hits / Math.max(setA.size, setB.size);
}

function textSimilarity(a: string, b: string): number {
  const normA = a.toLowerCase().trim();
  const normB = b.toLowerCase().trim();
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;
  if (normA.includes(normB) || normB.includes(normA)) return 0.7;
  const wordsA = new Set(normA.split(/\s+/));
  const wordsB = new Set(normB.split(/\s+/));
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap += 1;
  }
  return overlap / Math.max(wordsA.size, wordsB.size);
}

export function matchCapturedElement(
  registry: JsxElementRegistryItem[],
  hint: CapturedElementHint,
): RegistryMatch | null {
  if (!hint.tag || ["html", "body", "head", "style", "script"].includes(hint.tag)) return null;
  if (registry.length === 0) return null;

  let best: RegistryMatch | null = null;

  for (const item of registry) {
    let score = 0;

    if (item.tag === hint.tag) {
      score += 30;
    } else {
      continue;
    }

    if (hint.id && item.idAttribute && hint.id === item.idAttribute) {
      score += 50;
    }

    if (hint.className && item.className) {
      score += classOverlap(hint.className, item.className) * 40;
    }

    if (hint.text && item.text) {
      score += textSimilarity(hint.text, item.text) * 35;
    }

    if (score <= 30) continue;

    if (!best || score > best.score) {
      best = { item, score };
    }
  }

  return best;
}
