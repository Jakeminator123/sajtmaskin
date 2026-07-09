export type StatItemDraft = {
  label: string;
  value: string;
};

type StatItemMatch = {
  label: string;
  value: string;
  labelRange: { start: number; end: number };
  valueRange: { start: number; end: number };
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

// Bounded captures ((?:(?!\N)[\s\S])*?): may not cross the closing quote, so a
// sibling object that has `label:` but no `value:` cannot leak into the match.
const STAT_ITEM_RE =
  /\{\s*label:\s*(["'`])((?:\\[\s\S]|(?!\1)[^\\])*?)\1\s*,\s*value:\s*(["'`])((?:\\[\s\S]|(?!\3)[^\\])*?)\3[\s\S]*?\}/g;

function findStatItemMatches(content: string): StatItemMatch[] {
  const matches: StatItemMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = STAT_ITEM_RE.exec(content)) !== null) {
    const full = match[0];
    const label = match[2] ?? "";
    const value = match[4] ?? "";
    const labelStartInMatch = full.indexOf(label);
    const valueStartInMatch = full.indexOf(value, labelStartInMatch + label.length);
    if (labelStartInMatch === -1 || valueStartInMatch === -1) continue;

    matches.push({
      label,
      value,
      labelRange: {
        start: match.index + labelStartInMatch,
        end: match.index + labelStartInMatch + label.length,
      },
      valueRange: {
        start: match.index + valueStartInMatch,
        end: match.index + valueStartInMatch + value.length,
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

export function readStatItemsDraft(
  fileName: string,
  content: string,
): StatItemDraft[] | null {
  if (!isPageFile(fileName)) return null;
  const matches = findStatItemMatches(content);
  if (matches.length < 2) return null;
  return matches.slice(0, 8).map((match) => ({
    label: match.label,
    value: match.value,
  }));
}

export function updateStatItemsDraft(
  content: string,
  nextItems: StatItemDraft[],
): string {
  const matches = findStatItemMatches(content);
  if (matches.length === 0) return content;

  const replacements: Array<{ start: number; end: number; value: string }> = [];
  matches.slice(0, nextItems.length).forEach((match, index) => {
    const nextItem = nextItems[index];
    if (!nextItem) return;
    if (nextItem.label !== match.label) {
      replacements.push({
        start: match.labelRange.start,
        end: match.labelRange.end,
        value: nextItem.label,
      });
    }
    if (nextItem.value !== match.value) {
      replacements.push({
        start: match.valueRange.start,
        end: match.valueRange.end,
        value: nextItem.value,
      });
    }
  });

  if (replacements.length === 0) return content;
  return replaceRanges(content, replacements);
}
