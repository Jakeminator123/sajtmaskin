export type StaticMetadataDraft = {
  title: string;
  description: string;
};

type Range = {
  start: number;
  end: number;
};

type FieldRange = Range & {
  value: string;
};

function isLayoutFile(fileName: string): boolean {
  const normalized = fileName.replace(/\\/g, "/");
  return (
    normalized === "layout.tsx" ||
    normalized.endsWith("/layout.tsx")
  );
}

function findMetadataObjectRange(content: string): Range | null {
  const match = /export\s+const\s+metadata\s*=\s*\{/m.exec(content);
  if (!match) return null;

  const braceStart = match.index + match[0].length - 1;
  let depth = 0;
  let quote: '"' | "'" | "`" | null = null;
  let escaped = false;

  for (let i = braceStart; i < content.length; i += 1) {
    const char = content[i];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return { start: braceStart, end: i + 1 };
      }
    }
  }

  return null;
}

function isWordBoundary(char: string | undefined): boolean {
  return !char || !/[A-Za-z0-9_$]/.test(char);
}

function findTopLevelStringFieldRange(
  content: string,
  objectRange: Range,
  fieldName: keyof StaticMetadataDraft,
): FieldRange | null {
  let depth = 0;
  let quote: '"' | "'" | "`" | null = null;
  let escaped = false;

  for (let i = objectRange.start; i < objectRange.end; i += 1) {
    const char = content[i];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      continue;
    }

    if (depth !== 1) continue;
    if (!content.startsWith(fieldName, i)) continue;
    if (!isWordBoundary(content[i - 1]) || !isWordBoundary(content[i + fieldName.length])) continue;

    let cursor = i + fieldName.length;
    while (cursor < objectRange.end && /\s/.test(content[cursor] ?? "")) cursor += 1;
    if (content[cursor] !== ":") continue;
    cursor += 1;
    while (cursor < objectRange.end && /\s/.test(content[cursor] ?? "")) cursor += 1;

    const valueQuote = content[cursor];
    if (valueQuote !== '"' && valueQuote !== "'" && valueQuote !== "`") continue;
    const valueStart = cursor;
    cursor += 1;
    let value = "";
    let valueEscaped = false;

    while (cursor < objectRange.end) {
      const valueChar = content[cursor];
      if (valueEscaped) {
        value += valueChar;
        valueEscaped = false;
        cursor += 1;
        continue;
      }
      if (valueChar === "\\") {
        value += valueChar;
        valueEscaped = true;
        cursor += 1;
        continue;
      }
      if (valueChar === valueQuote) {
        return {
          start: valueStart,
          end: cursor + 1,
          value,
        };
      }
      value += valueChar;
      cursor += 1;
    }
  }

  return null;
}

function replaceRange(content: string, range: Range, next: string): string {
  return `${content.slice(0, range.start)}${next}${content.slice(range.end)}`;
}

function getNewline(content: string): string {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function getTopLevelIndent(content: string, objectRange: Range): string {
  const body = content.slice(objectRange.start + 1, objectRange.end - 1);
  const match = body.match(/\r?\n([ \t]+)[A-Za-z_$]/);
  return match?.[1] ?? "  ";
}

function upsertStringField(
  content: string,
  fieldName: keyof StaticMetadataDraft,
  value: string,
): string {
  const objectRange = findMetadataObjectRange(content);
  if (!objectRange) return content;

  const existingRange = findTopLevelStringFieldRange(content, objectRange, fieldName);
  if (existingRange) {
    return replaceRange(content, existingRange, JSON.stringify(value));
  }

  const newline = getNewline(content);
  const indent = getTopLevelIndent(content, objectRange);
  const insertion = `${newline}${indent}${fieldName}: ${JSON.stringify(value)},`;
  return `${content.slice(0, objectRange.start + 1)}${insertion}${content.slice(objectRange.start + 1)}`;
}

export function readStaticMetadataDraft(
  fileName: string,
  content: string,
): StaticMetadataDraft | null {
  if (!isLayoutFile(fileName)) return null;
  const objectRange = findMetadataObjectRange(content);
  if (!objectRange) return null;

  return {
    title: findTopLevelStringFieldRange(content, objectRange, "title")?.value ?? "",
    description: findTopLevelStringFieldRange(content, objectRange, "description")?.value ?? "",
  };
}

export function updateStaticMetadataDraft(
  content: string,
  draft: StaticMetadataDraft,
): string {
  let next = content;
  next = upsertStringField(next, "title", draft.title);
  next = upsertStringField(next, "description", draft.description);
  return next;
}
