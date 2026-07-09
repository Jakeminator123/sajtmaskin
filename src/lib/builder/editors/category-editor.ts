export type CategoryItemDraft = {
  name: string;
};

type CategoryItemMatch = {
  name: string;
  nameRange: { start: number; end: number };
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
// sibling object that has `name:` but no `slug:` cannot leak into the match.
const CATEGORY_ITEM_RE =
  /\{\s*name:\s*(["'`])((?:\\[\s\S]|(?!\1)[\s\S])*?)\1\s*,\s*slug:\s*(["'`])((?:\\[\s\S]|(?!\3)[\s\S])*?)\3[\s\S]*?\}/g;

function findCategoryItemMatches(content: string): CategoryItemMatch[] {
  const matches: CategoryItemMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = CATEGORY_ITEM_RE.exec(content)) !== null) {
    const full = match[0];
    const name = match[2] ?? "";
    const nameStartInMatch = full.indexOf(name);
    if (nameStartInMatch === -1) continue;

    matches.push({
      name,
      nameRange: {
        start: match.index + nameStartInMatch,
        end: match.index + nameStartInMatch + name.length,
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

export function readCategoryItemsDraft(
  fileName: string,
  content: string,
): CategoryItemDraft[] | null {
  if (!isPageFile(fileName)) return null;
  const matches = findCategoryItemMatches(content);
  if (matches.length < 2) return null;
  return matches.slice(0, 8).map((match) => ({
    name: match.name,
  }));
}

export function updateCategoryItemsDraft(
  content: string,
  nextItems: CategoryItemDraft[],
): string {
  const matches = findCategoryItemMatches(content);
  if (matches.length === 0) return content;

  const replacements: Array<{ start: number; end: number; value: string }> = [];
  matches.slice(0, nextItems.length).forEach((match, index) => {
    const nextItem = nextItems[index];
    if (!nextItem || nextItem.name === match.name) return;
    replacements.push({
      start: match.nameRange.start,
      end: match.nameRange.end,
      value: nextItem.name,
    });
  });

  if (replacements.length === 0) return content;
  return replaceRanges(content, replacements);
}
