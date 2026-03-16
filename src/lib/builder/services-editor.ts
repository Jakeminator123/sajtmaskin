export type ServiceItemDraft = {
  title: string;
  description: string;
};

type ServiceItemMatch = {
  title: string;
  description: string;
  titleRange: { start: number; end: number };
  descriptionRange: { start: number; end: number };
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

const SERVICE_ITEM_RE =
  /\{\s*title:\s*(["'`])([\s\S]*?)\1\s*,\s*description:\s*(["'`])([\s\S]*?)\3[\s\S]*?\}/g;

function findServiceItemMatches(content: string): ServiceItemMatch[] {
  const matches: ServiceItemMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = SERVICE_ITEM_RE.exec(content)) !== null) {
    const full = match[0];
    const title = match[2] ?? "";
    const description = match[4] ?? "";
    const titleStartInMatch = full.indexOf(title);
    const descriptionStartInMatch = full.indexOf(description, titleStartInMatch + title.length);
    if (titleStartInMatch === -1 || descriptionStartInMatch === -1) continue;

    matches.push({
      title,
      description,
      titleRange: {
        start: match.index + titleStartInMatch,
        end: match.index + titleStartInMatch + title.length,
      },
      descriptionRange: {
        start: match.index + descriptionStartInMatch,
        end: match.index + descriptionStartInMatch + description.length,
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

export function readServiceItemsDraft(
  fileName: string,
  content: string,
): ServiceItemDraft[] | null {
  if (!isPageFile(fileName)) return null;
  const matches = findServiceItemMatches(content);
  if (matches.length < 2) return null;
  return matches.slice(0, 6).map((match) => ({
    title: match.title,
    description: match.description,
  }));
}

export function updateServiceItemsDraft(
  content: string,
  nextItems: ServiceItemDraft[],
): string {
  const matches = findServiceItemMatches(content);
  if (matches.length === 0) return content;

  const replacements: Array<{ start: number; end: number; value: string }> = [];
  matches.slice(0, nextItems.length).forEach((match, index) => {
    const nextItem = nextItems[index];
    if (!nextItem) return;
    if (nextItem.title !== match.title) {
      replacements.push({
        start: match.titleRange.start,
        end: match.titleRange.end,
        value: nextItem.title,
      });
    }
    if (nextItem.description !== match.description) {
      replacements.push({
        start: match.descriptionRange.start,
        end: match.descriptionRange.end,
        value: nextItem.description,
      });
    }
  });

  if (replacements.length === 0) return content;
  return replaceRanges(content, replacements);
}
