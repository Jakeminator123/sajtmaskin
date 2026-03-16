export type HeroContentDraft = {
  title: string;
  intro: string;
  ctaLabel: string;
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

function readFirstTextMatch(source: string, pattern: RegExp): string {
  const match = source.match(pattern);
  return match?.[1]?.trim() ?? "";
}

function replaceFirstTextMatch(
  source: string,
  pattern: RegExp,
  nextText: string,
): string {
  let replaced = false;
  return source.replace(pattern, (full, text) => {
    if (replaced) return full;
    replaced = true;
    return full.replace(text, nextText);
  });
}

export function readHeroContentDraft(
  fileName: string,
  content: string,
): HeroContentDraft | null {
  if (!isPageFile(fileName)) return null;

  const title = readFirstTextMatch(content, /<h1\b[^>]*>([^<]+)<\/h1>/i);
  const intro = readFirstTextMatch(content, /<p\b[^>]*>([^<]+)<\/p>/i);
  const ctaLabel = readFirstTextMatch(
    content,
    /<(?:a|button|Button|Link)\b[^>]*>([^<]+)<\/(?:a|button|Button|Link)>/i,
  );

  if (!title && !intro && !ctaLabel) return null;

  return { title, intro, ctaLabel };
}

export function updateHeroContentDraft(
  content: string,
  previousDraft: HeroContentDraft,
  nextDraft: HeroContentDraft,
): string {
  let next = content;

  if (previousDraft.title && previousDraft.title !== nextDraft.title) {
    next = replaceFirstTextMatch(next, /<h1\b[^>]*>([^<]+)<\/h1>/i, nextDraft.title);
  }
  if (previousDraft.intro && previousDraft.intro !== nextDraft.intro) {
    next = replaceFirstTextMatch(next, /<p\b[^>]*>([^<]+)<\/p>/i, nextDraft.intro);
  }
  if (previousDraft.ctaLabel && previousDraft.ctaLabel !== nextDraft.ctaLabel) {
    next = replaceFirstTextMatch(
      next,
      /<(?:a|button|Button|Link)\b[^>]*>([^<]+)<\/(?:a|button|Button|Link)>/i,
      nextDraft.ctaLabel,
    );
  }

  return next;
}
