export type TestimonialItemDraft = {
  name: string;
  role: string;
  quote: string;
};

type TestimonialItemMatch = {
  name: string;
  role: string;
  quote: string;
  nameRange: { start: number; end: number };
  roleRange: { start: number; end: number };
  quoteRange: { start: number; end: number };
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

// Matches { name: '...', role: '...', quote: '...' } with optional trailing fields (e.g. rating).
// Each capture uses ((?:(?!\N)[\s\S])*?) so it can never backtrack past its own
// closing quote — otherwise a sibling array whose objects also start with `name:`
// but lack `role:`/`quote:` (e.g. a menu with `{ name, price }`) gets swallowed
// into the first capture and leaks foreign data into the editor (and corrupts
// the file on save, since replacements are position-based).
const TESTIMONIAL_ITEM_RE =
  /\{\s*name:\s*(["'`])((?:\\[\s\S]|(?!\1)[\s\S])*?)\1\s*,\s*role:\s*(["'`])((?:\\[\s\S]|(?!\3)[\s\S])*?)\3\s*,\s*quote:\s*(["'`])((?:\\[\s\S]|(?!\5)[\s\S])*?)\5[\s\S]*?\}/g;

function findTestimonialItemMatches(content: string): TestimonialItemMatch[] {
  const matches: TestimonialItemMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = TESTIMONIAL_ITEM_RE.exec(content)) !== null) {
    const full = match[0];
    const name = match[2] ?? "";
    const role = match[4] ?? "";
    const quote = match[6] ?? "";
    const nameStartInMatch = full.indexOf(name);
    const roleStartInMatch = full.indexOf(role, nameStartInMatch + name.length);
    const quoteStartInMatch = full.indexOf(quote, roleStartInMatch + role.length);
    if (nameStartInMatch === -1 || roleStartInMatch === -1 || quoteStartInMatch === -1) continue;

    matches.push({
      name,
      role,
      quote,
      nameRange: {
        start: match.index + nameStartInMatch,
        end: match.index + nameStartInMatch + name.length,
      },
      roleRange: {
        start: match.index + roleStartInMatch,
        end: match.index + roleStartInMatch + role.length,
      },
      quoteRange: {
        start: match.index + quoteStartInMatch,
        end: match.index + quoteStartInMatch + quote.length,
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

export function readTestimonialItemsDraft(
  fileName: string,
  content: string,
): TestimonialItemDraft[] | null {
  if (!isPageFile(fileName)) return null;
  const matches = findTestimonialItemMatches(content);
  if (matches.length < 2) return null;
  return matches.slice(0, 8).map((match) => ({
    name: match.name,
    role: match.role,
    quote: match.quote,
  }));
}

export function updateTestimonialItemsDraft(
  content: string,
  nextItems: TestimonialItemDraft[],
): string {
  const matches = findTestimonialItemMatches(content);
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
    if (nextItem.role !== match.role) {
      replacements.push({
        start: match.roleRange.start,
        end: match.roleRange.end,
        value: nextItem.role,
      });
    }
    if (nextItem.quote !== match.quote) {
      replacements.push({
        start: match.quoteRange.start,
        end: match.quoteRange.end,
        value: nextItem.quote,
      });
    }
  });

  if (replacements.length === 0) return content;
  return replaceRanges(content, replacements);
}
