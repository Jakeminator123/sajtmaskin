export type PricingCardDraft = {
  name: string;
  price: string;
  description: string;
};

type PricingCardMatch = {
  name: string;
  price: string;
  description: string;
  nameRange: { start: number; end: number };
  priceRange: { start: number; end: number };
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

// Quoted captures are bounded ((?:(?!\N)[\s\S])*?) and the gaps between
// attributes may not cross a `/>` — otherwise a card missing one attribute
// makes the regex swallow the next <PricingCard /> and mix values across cards.
const PRICING_CARD_RE =
  /<PricingCard\b(?:(?!\/>)[\s\S])*?name=(["'`])((?:\\[\s\S]|(?!\1)[\s\S])*?)\1(?:(?!\/>)[\s\S])*?price=(["'`])((?:\\[\s\S]|(?!\3)[\s\S])*?)\3(?:(?!\/>)[\s\S])*?description=(["'`])((?:\\[\s\S]|(?!\5)[\s\S])*?)\5[\s\S]*?\/>/g;

function findPricingCardMatches(content: string): PricingCardMatch[] {
  const matches: PricingCardMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = PRICING_CARD_RE.exec(content)) !== null) {
    const full = match[0];
    const name = match[2] ?? "";
    const price = match[4] ?? "";
    const description = match[6] ?? "";
    const nameStartInMatch = full.indexOf(name);
    const priceStartInMatch = full.indexOf(price, nameStartInMatch + name.length);
    const descriptionStartInMatch = full.indexOf(
      description,
      priceStartInMatch + price.length,
    );
    if (
      nameStartInMatch === -1 ||
      priceStartInMatch === -1 ||
      descriptionStartInMatch === -1
    ) {
      continue;
    }

    matches.push({
      name,
      price,
      description,
      nameRange: {
        start: match.index + nameStartInMatch,
        end: match.index + nameStartInMatch + name.length,
      },
      priceRange: {
        start: match.index + priceStartInMatch,
        end: match.index + priceStartInMatch + price.length,
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

export function readPricingCardsDraft(
  fileName: string,
  content: string,
): PricingCardDraft[] | null {
  if (!isPageFile(fileName)) return null;
  const matches = findPricingCardMatches(content);
  if (matches.length < 2) return null;
  return matches.slice(0, 6).map((match) => ({
    name: match.name,
    price: match.price,
    description: match.description,
  }));
}

export function updatePricingCardsDraft(
  content: string,
  nextItems: PricingCardDraft[],
): string {
  const matches = findPricingCardMatches(content);
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
