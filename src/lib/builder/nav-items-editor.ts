export type NavItemDraft = {
  label: string;
};

type NavItemMatch = {
  label: string;
  labelRange: { start: number; end: number };
};

function isLikelyNavFile(fileName: string): boolean {
  const normalized = fileName.replace(/\\/g, "/").toLowerCase();
  return (
    normalized.endsWith(".tsx") ||
    normalized.endsWith(".jsx") ||
    normalized.endsWith(".ts") ||
    normalized.endsWith(".js")
  );
}

const NAV_ITEM_RE =
  /\{\s*label:\s*(["'`])([\s\S]*?)\1\s*,\s*href:\s*(["'`])([\s\S]*?)\3[\s\S]*?\}/g;

function findNavItemMatches(content: string): NavItemMatch[] {
  const matches: NavItemMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = NAV_ITEM_RE.exec(content)) !== null) {
    const full = match[0];
    const label = match[2] ?? "";
    const labelStartInMatch = full.indexOf(label);
    if (labelStartInMatch === -1) continue;

    matches.push({
      label,
      labelRange: {
        start: match.index + labelStartInMatch,
        end: match.index + labelStartInMatch + label.length,
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

export function readNavItemsDraft(
  fileName: string,
  content: string,
): NavItemDraft[] | null {
  if (!isLikelyNavFile(fileName)) return null;
  const matches = findNavItemMatches(content);
  if (matches.length < 2) return null;
  return matches.slice(0, 8).map((match) => ({
    label: match.label,
  }));
}

export function updateNavItemsDraft(
  content: string,
  nextItems: NavItemDraft[],
): string {
  const matches = findNavItemMatches(content);
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
