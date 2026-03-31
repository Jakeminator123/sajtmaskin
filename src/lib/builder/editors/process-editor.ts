export type ProcessStepDraft = {
  text: string;
};

type StringRange = {
  start: number;
  end: number;
  text: string;
};

function isPageFile(fileName: string): boolean {
  const normalized = fileName.replace(/\\/g, "/");
  return (
    normalized === "page.tsx" ||
    normalized.endsWith("/page.tsx") ||
    normalized === "pages/index.tsx" ||
    normalized.endsWith("/index.tsx")
  );
}

const PROCESS_ARRAY_RE =
  /(?:const|let|var)\s+(process|steps)\s*=\s*\[([\s\S]*?)\]/;
const STRING_ITEM_RE = /(["'`])([\s\S]*?)\1/g;

function findProcessStepMatches(content: string): StringRange[] {
  const arrayMatch = PROCESS_ARRAY_RE.exec(content);
  if (!arrayMatch) return [];

  const fullMatch = arrayMatch[0];
  const innerContent = arrayMatch[2] ?? "";
  const innerStart = fullMatch.indexOf(innerContent);
  if (innerStart === -1) return [];

  const contentOffset = arrayMatch.index + innerStart;
  const matches: StringRange[] = [];
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = STRING_ITEM_RE.exec(innerContent)) !== null) {
    const text = itemMatch[2] ?? "";
    const fullItem = itemMatch[0];
    const textStartInItem = fullItem.indexOf(text);
    if (textStartInItem === -1) continue;

    matches.push({
      text,
      start: contentOffset + itemMatch.index + textStartInItem,
      end: contentOffset + itemMatch.index + textStartInItem + text.length,
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

export function readProcessStepsDraft(
  fileName: string,
  content: string,
): ProcessStepDraft[] | null {
  if (!isPageFile(fileName)) return null;
  const matches = findProcessStepMatches(content);
  if (matches.length < 2) return null;
  return matches.slice(0, 8).map((match) => ({ text: match.text }));
}

export function updateProcessStepsDraft(
  content: string,
  nextItems: ProcessStepDraft[],
): string {
  const matches = findProcessStepMatches(content);
  if (matches.length === 0) return content;

  const replacements: Array<{ start: number; end: number; value: string }> = [];
  matches.slice(0, nextItems.length).forEach((match, index) => {
    const nextItem = nextItems[index];
    if (!nextItem || nextItem.text === match.text) return;
    replacements.push({
      start: match.start,
      end: match.end,
      value: nextItem.text,
    });
  });

  if (replacements.length === 0) return content;
  return replaceRanges(content, replacements);
}
