export type ProductItemDraft = {
  name: string;
  price: string;
};

type ProductItemMatch = {
  name: string;
  price: string;
  nameRange: { start: number; end: number };
  priceRange: { start: number; end: number };
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

const PRODUCT_ITEM_RE =
  /\{\s*id:\s*(["'`])([\s\S]*?)\1\s*,\s*name:\s*(["'`])([\s\S]*?)\3\s*,\s*price:\s*(["'`])([\s\S]*?)\5[\s\S]*?\}/g;

function findProductItemMatches(content: string): ProductItemMatch[] {
  const matches: ProductItemMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = PRODUCT_ITEM_RE.exec(content)) !== null) {
    const full = match[0];
    const name = match[4] ?? "";
    const price = match[6] ?? "";
    const nameStartInMatch = full.indexOf(name);
    const priceStartInMatch = full.indexOf(price, nameStartInMatch + name.length);
    if (nameStartInMatch === -1 || priceStartInMatch === -1) continue;

    matches.push({
      name,
      price,
      nameRange: {
        start: match.index + nameStartInMatch,
        end: match.index + nameStartInMatch + name.length,
      },
      priceRange: {
        start: match.index + priceStartInMatch,
        end: match.index + priceStartInMatch + price.length,
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

export function readProductItemsDraft(
  fileName: string,
  content: string,
): ProductItemDraft[] | null {
  if (!isPageFile(fileName)) return null;
  const matches = findProductItemMatches(content);
  if (matches.length < 2) return null;
  return matches.slice(0, 8).map((match) => ({
    name: match.name,
    price: match.price,
  }));
}

export function updateProductItemsDraft(
  content: string,
  nextItems: ProductItemDraft[],
): string {
  const matches = findProductItemMatches(content);
  if (matches.length === 0) return content;

  const replacements: Array<{ start: number; end: number; value: string }> = [];
  matches.slice(0, nextItems.length).forEach((match, index) => {
    const nextItem = nextItems[index];
    if (!nextItem) return;
    if (nextItem.name !== match.name) {
      replacements.push({
        start: match.nameRange.start,
        end: match.nameRange.end,
        value: nextItem.name,
      });
    }
    if (nextItem.price !== match.price) {
      replacements.push({
        start: match.priceRange.start,
        end: match.priceRange.end,
        value: nextItem.price,
      });
    }
  });

  if (replacements.length === 0) return content;
  return replaceRanges(content, replacements);
}
