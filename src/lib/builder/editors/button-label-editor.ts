export type ButtonLabelDraft = {
  label: string;
};

type ButtonLabelMatch = {
  label: string;
  labelRange: { start: number; end: number };
};

function isLikelyComponentFile(fileName: string): boolean {
  const normalized = fileName.replace(/\\/g, "/").toLowerCase();
  return (
    normalized.endsWith(".tsx") ||
    normalized.endsWith(".jsx") ||
    normalized.endsWith(".ts") ||
    normalized.endsWith(".js")
  );
}

const BUTTON_RE = /<Button\b(?![^>]*\basChild\b)[^>]*>([\s\S]*?)<\/Button>/g;

function findButtonLabelRange(innerContent: string): { start: number; end: number; label: string } | null {
  let start = -1;
  for (let index = 0; index < innerContent.length; index += 1) {
    const char = innerContent[index];
    if (!/\s/.test(char)) {
      if (char === "<" || char === "{") return null;
      start = index;
      break;
    }
  }
  if (start === -1) return null;

  let end = innerContent.length;
  for (let index = start; index < innerContent.length; index += 1) {
    const char = innerContent[index];
    if (char === "<" || char === "{") {
      end = index;
      break;
    }
  }

  let trimmedEnd = end;
  while (trimmedEnd > start && /\s/.test(innerContent[trimmedEnd - 1] ?? "")) {
    trimmedEnd -= 1;
  }

  const label = innerContent.slice(start, trimmedEnd);
  if (!label) return null;

  return { start, end: trimmedEnd, label };
}

function findButtonLabelMatches(content: string): ButtonLabelMatch[] {
  const matches: ButtonLabelMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = BUTTON_RE.exec(content)) !== null) {
    const innerContent = match[1] ?? "";
    const innerStartInMatch = match[0].indexOf(innerContent);
    if (innerStartInMatch === -1) continue;

    const labelRange = findButtonLabelRange(innerContent);
    if (!labelRange) continue;

    const contentOffset = match.index + innerStartInMatch;
    matches.push({
      label: labelRange.label,
      labelRange: {
        start: contentOffset + labelRange.start,
        end: contentOffset + labelRange.end,
      },
    });
  }

  return matches;
}

function replaceRanges(
  content: string,
  replacements: Array<{ start: number; end: number; value: string }>,
): string {
  return replacements
    .sort((a, b) => b.start - a.start)
    .reduce(
      (next, replacement) =>
        `${next.slice(0, replacement.start)}${replacement.value}${next.slice(replacement.end)}`,
      content,
    );
}

export function readButtonLabelsDraft(
  fileName: string,
  content: string,
): ButtonLabelDraft[] | null {
  if (!isLikelyComponentFile(fileName)) return null;
  const matches = findButtonLabelMatches(content);
  if (matches.length < 1) return null;
  return matches.slice(0, 8).map((match) => ({
    label: match.label,
  }));
}

export function updateButtonLabelsDraft(
  content: string,
  nextItems: ButtonLabelDraft[],
): string {
  const matches = findButtonLabelMatches(content);
  if (matches.length === 0) return content;

  const replacements: Array<{ start: number; end: number; value: string }> = [];
  matches.slice(0, nextItems.length).forEach((match, index) => {
    const nextItem = nextItems[index];
    if (!nextItem || nextItem.label === match.label) return;
    replacements.push({
      start: match.labelRange.start,
      end: match.labelRange.end,
      value: nextItem.label,
    });
  });

  if (replacements.length === 0) return content;
  return replaceRanges(content, replacements);
}
