export type FooterLinkGroupDraft = {
  heading: string;
  items: string[];
};

type FooterLinkItemMatch = {
  text: string;
  start: number;
  end: number;
};

type FooterLinkGroupMatch = {
  heading: string;
  headingRange: { start: number; end: number };
  items: FooterLinkItemMatch[];
};

function isLikelyFooterFile(fileName: string): boolean {
  const normalized = fileName.replace(/\\/g, "/").toLowerCase();
  return normalized.includes("footer") && /\.(tsx|jsx|ts|js)$/.test(normalized);
}

const FOOTER_OBJECT_RE = /const\s+(footerLinks|links)\s*=\s*\{/;
const FOOTER_GROUP_RE =
  /^\s*([^:\n]+?)\s*:\s*\[([\s\S]*?)\](?=\s*,\s*(?:\n\s*[^:\n]+?\s*:|$)|\s*$)/gm;
const LABEL_ITEM_RE = /label:\s*(["'`])([\s\S]*?)\1/g;
const STRING_ITEM_RE = /(["'`])([\s\S]*?)\1/g;

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  let quote: string | null = null;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const prev = source[index - 1];

    if (quote) {
      if (char === quote && prev !== "\\") {
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
      if (depth === 0) return index;
    }
  }

  return -1;
}

function extractFooterItemMatches(
  arrayContent: string,
  contentOffset: number,
): FooterLinkItemMatch[] {
  const labelMatches: FooterLinkItemMatch[] = [];
  LABEL_ITEM_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = LABEL_ITEM_RE.exec(arrayContent)) !== null) {
    const full = match[0];
    const text = match[2] ?? "";
    const textStartInMatch = full.indexOf(text);
    if (textStartInMatch === -1) continue;
    labelMatches.push({
      text,
      start: contentOffset + match.index + textStartInMatch,
      end: contentOffset + match.index + textStartInMatch + text.length,
    });
  }

  if (labelMatches.length > 0) return labelMatches;

  const stringMatches: FooterLinkItemMatch[] = [];
  STRING_ITEM_RE.lastIndex = 0;
  while ((match = STRING_ITEM_RE.exec(arrayContent)) !== null) {
    const full = match[0];
    const text = match[2] ?? "";
    const textStartInMatch = full.indexOf(text);
    if (textStartInMatch === -1) continue;
    stringMatches.push({
      text,
      start: contentOffset + match.index + textStartInMatch,
      end: contentOffset + match.index + textStartInMatch + text.length,
    });
  }

  return stringMatches;
}

function findFooterLinkGroupMatches(content: string): FooterLinkGroupMatch[] {
  const objectMatch = FOOTER_OBJECT_RE.exec(content);
  if (!objectMatch) return [];

  const openIndex = content.indexOf("{", objectMatch.index);
  if (openIndex === -1) return [];

  const closeIndex = findMatchingBrace(content, openIndex);
  if (closeIndex === -1) return [];

  const objectBody = content.slice(openIndex + 1, closeIndex);
  const bodyOffset = openIndex + 1;
  const groups: FooterLinkGroupMatch[] = [];

  FOOTER_GROUP_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FOOTER_GROUP_RE.exec(objectBody)) !== null) {
    const full = match[0];
    const heading = (match[1] ?? "").trim();
    const arrayContent = match[2] ?? "";
    const headingStartInMatch = full.indexOf(match[1] ?? "");
    const arrayStartInMatch = full.indexOf(arrayContent);
    if (headingStartInMatch === -1 || arrayStartInMatch === -1 || !heading) continue;

    const groupStart = bodyOffset + match.index;
    const items = extractFooterItemMatches(
      arrayContent,
      groupStart + arrayStartInMatch,
    );
    if (items.length === 0) continue;

    groups.push({
      heading,
      headingRange: {
        start: groupStart + headingStartInMatch,
        end: groupStart + headingStartInMatch + heading.length,
      },
      items,
    });
  }

  return groups;
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

export function readFooterLinkGroupsDraft(
  fileName: string,
  content: string,
): FooterLinkGroupDraft[] | null {
  if (!isLikelyFooterFile(fileName)) return null;
  const matches = findFooterLinkGroupMatches(content);
  if (matches.length < 2) return null;
  return matches.slice(0, 6).map((match) => ({
    heading: match.heading,
    items: match.items.slice(0, 8).map((item) => item.text),
  }));
}

export function updateFooterLinkGroupsDraft(
  content: string,
  nextGroups: FooterLinkGroupDraft[],
): string {
  const matches = findFooterLinkGroupMatches(content);
  if (matches.length === 0) return content;

  const replacements: Array<{ start: number; end: number; value: string }> = [];
  matches.slice(0, nextGroups.length).forEach((match, groupIndex) => {
    const nextGroup = nextGroups[groupIndex];
    if (!nextGroup) return;

    if (nextGroup.heading !== match.heading) {
      replacements.push({
        start: match.headingRange.start,
        end: match.headingRange.end,
        value: nextGroup.heading,
      });
    }

    match.items.slice(0, nextGroup.items.length).forEach((item, itemIndex) => {
      const nextItem = nextGroup.items[itemIndex];
      if (typeof nextItem !== "string" || nextItem === item.text) return;
      replacements.push({
        start: item.start,
        end: item.end,
        value: nextItem,
      });
    });
  });

  if (replacements.length === 0) return content;
  return replaceRanges(content, replacements);
}
