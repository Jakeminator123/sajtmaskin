export type PricingFeatureCardDraft = {
  name: string;
  features: string[];
};

type FeatureItemMatch = {
  text: string;
  start: number;
  end: number;
};

type PricingFeatureCardMatch = {
  name: string;
  features: FeatureItemMatch[];
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

// Quoted capture bounded ((?:(?!\1)[\s\S])*?) and inter-attribute gaps may not
// cross `/>` — a card without `features` must not swallow the next card's list.
const PRICING_CARD_FEATURES_RE =
  /<PricingCard\b(?:(?!\/>)[\s\S])*?name=(["'`])((?:\\[\s\S]|(?!\1)[\s\S])*?)\1(?:(?!\/>)[\s\S])*?features=\{\[([\s\S]*?)\]\}[\s\S]*?\/>/g;
const STRING_ITEM_RE = /(["'`])([\s\S]*?)\1/g;

function findPricingFeatureCardMatches(content: string): PricingFeatureCardMatch[] {
  const matches: PricingFeatureCardMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = PRICING_CARD_FEATURES_RE.exec(content)) !== null) {
    const full = match[0];
    const name = match[2] ?? "";
    const featuresContent = match[3] ?? "";
    const featuresStartInMatch = full.indexOf(featuresContent);
    if (featuresStartInMatch === -1) continue;

    const featuresOffset = match.index + featuresStartInMatch;
    const features: FeatureItemMatch[] = [];
    let itemMatch: RegExpExecArray | null;

    while ((itemMatch = STRING_ITEM_RE.exec(featuresContent)) !== null) {
      const text = itemMatch[2] ?? "";
      const fullItem = itemMatch[0];
      const textStartInItem = fullItem.indexOf(text);
      if (textStartInItem === -1) continue;

      features.push({
        text,
        start: featuresOffset + itemMatch.index + textStartInItem,
        end: featuresOffset + itemMatch.index + textStartInItem + text.length,
      });
    }

    matches.push({
      name,
      features,
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

export function readPricingFeatureCardsDraft(
  fileName: string,
  content: string,
): PricingFeatureCardDraft[] | null {
  if (!isPageFile(fileName)) return null;
  const matches = findPricingFeatureCardMatches(content);
  if (matches.length < 2) return null;
  return matches.slice(0, 6).map((match) => ({
    name: match.name,
    features: match.features.slice(0, 6).map((feature) => feature.text),
  }));
}

export function updatePricingFeatureCardsDraft(
  content: string,
  nextItems: PricingFeatureCardDraft[],
): string {
  const matches = findPricingFeatureCardMatches(content);
  if (matches.length === 0) return content;

  const replacements: Array<{ start: number; end: number; value: string }> = [];
  matches.slice(0, nextItems.length).forEach((match, cardIndex) => {
    const nextCard = nextItems[cardIndex];
    if (!nextCard) return;
    match.features.slice(0, nextCard.features.length).forEach((feature, featureIndex) => {
      const nextFeature = nextCard.features[featureIndex];
      if (typeof nextFeature !== "string" || nextFeature === feature.text) return;
      replacements.push({
        start: feature.start,
        end: feature.end,
        value: nextFeature,
      });
    });
  });

  if (replacements.length === 0) return content;
  return replaceRanges(content, replacements);
}
