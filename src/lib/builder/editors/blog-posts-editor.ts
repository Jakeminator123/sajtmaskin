export type BlogPostDraft = {
  title: string;
  excerpt: string;
};

type BlogPostMatch = {
  title: string;
  excerpt: string;
  titleRange: { start: number; end: number };
  excerptRange: { start: number; end: number };
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
// sibling object that starts with `slug:` but lacks `title:`/`excerpt:` cannot leak in.
const BLOG_POST_ITEM_RE =
  /\{\s*slug:\s*(["'`])((?:\\[\s\S]|(?!\1)[^\\])*?)\1\s*,\s*title:\s*(["'`])((?:\\[\s\S]|(?!\3)[^\\])*?)\3\s*,\s*excerpt:\s*(["'`])((?:\\[\s\S]|(?!\5)[^\\])*?)\5[\s\S]*?\}/g;

function findBlogPostMatches(content: string): BlogPostMatch[] {
  const matches: BlogPostMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = BLOG_POST_ITEM_RE.exec(content)) !== null) {
    const full = match[0];
    const title = match[4] ?? "";
    const excerpt = match[6] ?? "";
    const titleStartInMatch = full.indexOf(title);
    const excerptStartInMatch = full.indexOf(excerpt, titleStartInMatch + title.length);
    if (titleStartInMatch === -1 || excerptStartInMatch === -1) continue;

    matches.push({
      title,
      excerpt,
      titleRange: {
        start: match.index + titleStartInMatch,
        end: match.index + titleStartInMatch + title.length,
      },
      excerptRange: {
        start: match.index + excerptStartInMatch,
        end: match.index + excerptStartInMatch + excerpt.length,
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

export function readBlogPostsDraft(
  fileName: string,
  content: string,
): BlogPostDraft[] | null {
  if (!isPageFile(fileName)) return null;
  const matches = findBlogPostMatches(content);
  if (matches.length < 2) return null;
  return matches.slice(0, 8).map((match) => ({
    title: match.title,
    excerpt: match.excerpt,
  }));
}

export function updateBlogPostsDraft(
  content: string,
  nextItems: BlogPostDraft[],
): string {
  const matches = findBlogPostMatches(content);
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
    if (nextItem.excerpt !== match.excerpt) {
      replacements.push({
        start: match.excerptRange.start,
        end: match.excerptRange.end,
        value: nextItem.excerpt,
      });
    }
  });

  if (replacements.length === 0) return content;
  return replaceRanges(content, replacements);
}
