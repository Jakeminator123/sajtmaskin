import { PAGE_BLOCKS_TARGET_FILE_CANDIDATES } from "@/lib/builder/page-blocks-catalog";

export type PageBlockPatchResult =
  | { ok: true; content: string }
  | { ok: false; reason: string };

type FlatFile = { name: string; content?: string | null };

/**
 * Välj startsidans fil från versionens fillista.
 */
export function resolveHomePageFilePath(files: FlatFile[]): string | null {
  const names = new Set(files.map((f) => f.name));
  for (const candidate of PAGE_BLOCKS_TARGET_FILE_CANDIDATES) {
    if (names.has(candidate)) return candidate;
  }
  return null;
}

/** Markörer som matchar sektionens *identitet* (klass/id/komponentnamn), inte generiska HTML-taggar. */
const AFTER_SECTION_MARKERS: Record<string, RegExp[]> = {
  hero: [/\bhero\b/i, /\bbanner\b/i, /\bjumbotron\b/i],
  header: [/\bheader\b/i, /\bnavbar\b/i, /\bnav-bar\b/i, /\btopbar\b/i],
  features: [/\bfeatures?\b/i, /\bbenefits?\b/i, /\bservices?\b/i],
  pricing: [/\bpricing\b/i, /\bplans?\b/i, /\bpackages?\b/i],
  testimonials: [/\btestimonials?\b/i, /\breviews?\b/i],
  cta: [/\bcta\b/i, /\bcall-?to-?action\b/i],
  faq: [/\bfaq\b/i, /\baccordion\b/i],
  contact: [/\bcontact\b/i],
  about: [/\babout\b/i],
  team: [/\bteam\b/i],
  stats: [/\bstats\b/i, /\bmetrics\b/i],
  gallery: [/\bgallery\b/i, /\bportfolio\b/i],
  form: [/\bnewsletter\b/i, /\bsignup-?form\b/i],
  footer: [/\bfooter\b/i],
};

const PREFERRED_SECTION_TAGS = new Set([
  "section",
  "header",
  "footer",
  "article",
  "main",
  "nav",
]);

function isSelfClosingTag(tag: string, slash: string): boolean {
  if (slash) return true;
  const lower = tag.toLowerCase();
  return lower === "img" || lower === "input" || lower === "br" || lower === "hr";
}

/**
 * Hitta slutindex (exklusivt) för det bästa JSX-elementet vars öppningstag
 * matchar sektionstypen. Fail-closed: returnerar null vid tvetydighet.
 */
function findSectionEndIndex(pageContent: string, sectionType: string): number | null {
  const markers = AFTER_SECTION_MARKERS[sectionType];
  if (!markers || markers.length === 0) return null;

  type Candidate = { score: number; end: number; openStart: number };
  const candidates: Candidate[] = [];

  const openRe = /<([A-Za-z][\w.-]*)\b([^>]*)(\/?)>/g;
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(pageContent)) !== null) {
    const tag = match[1];
    const attrs = match[2] ?? "";
    const selfClosing = isSelfClosingTag(tag, match[3] ?? "");
    const haystack = `${tag} ${attrs}`;
    if (!markers.some((re) => re.test(haystack))) continue;

    // Prefer semantic section hosts / PascalCase components over nested cards.
    let score = 0;
    if (PREFERRED_SECTION_TAGS.has(tag.toLowerCase())) score += 3;
    if (/^[A-Z]/.test(tag)) score += 2;
    if (new RegExp(`\\b${sectionType}\\b`, "i").test(haystack)) score += 2;
    // Nested utility classes like "hero-card" inside a real hero score lower.
    if (/className\s*=/.test(attrs) && new RegExp(`\\b${sectionType}-`, "i").test(attrs)) {
      score -= 1;
    }

    const openStart = match.index;
    const openEnd = openRe.lastIndex;
    if (selfClosing) {
      candidates.push({ score, end: openEnd, openStart });
      continue;
    }

    const end = findMatchingCloseEnd(pageContent, tag, openEnd);
    if (end == null) continue;
    candidates.push({ score, end, openStart });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score || a.openStart - b.openStart);
  const best = candidates[0];
  // Ambiguous: two top-scoring matches → fail closed to AI.
  if (candidates.length > 1 && candidates[1].score === best.score) {
    return null;
  }
  return best.end;
}

function findMatchingCloseEnd(
  pageContent: string,
  tag: string,
  fromIndex: number,
): number | null {
  const openToken = new RegExp(`<${tag}\\b([^>]*)(\\/?)>`, "gi");
  const closeToken = new RegExp(`</${tag}\\s*>`, "gi");
  let depth = 1;
  let cursor = fromIndex;

  while (depth > 0 && cursor < pageContent.length) {
    openToken.lastIndex = cursor;
    closeToken.lastIndex = cursor;
    const nextOpen = openToken.exec(pageContent);
    const nextClose = closeToken.exec(pageContent);
    if (!nextClose) return null;

    if (nextOpen && nextOpen.index < nextClose.index) {
      const innerSelfClosing = isSelfClosingTag(tag, nextOpen[2] ?? "");
      cursor = openToken.lastIndex;
      if (!innerSelfClosing) depth += 1;
      continue;
    }

    depth -= 1;
    cursor = closeToken.lastIndex;
    if (depth === 0) return cursor;
  }
  return null;
}

/**
 * Deterministisk infogning i landningssidan.
 *
 * - `top` / `bottom`: säkra när `<main>...</main>` finns.
 * - `after-<type>`: best-effort direkt efter bästa matchande sektions-/
 *   komponenttaggen; fail-closed till AI vid tvetydighet eller saknad match.
 */
export function tryInsertPageBlockIntoHomePage(
  pageContent: string,
  jsxSnippet: string,
  placement: string,
): PageBlockPatchResult {
  const trimmed = jsxSnippet.trimEnd();
  if (!trimmed) {
    return { ok: false, reason: "Tomt block." };
  }

  const mainOpen = pageContent.match(/<main\b[^>]*>/i);
  const mainClose = pageContent.lastIndexOf("</main>");
  if (!mainOpen || mainClose < 0 || mainClose <= mainOpen.index!) {
    return {
      ok: false,
      reason: "Hittade inte välformad <main>...</main> — använd AI.",
    };
  }

  const openEnd = mainOpen.index! + mainOpen[0].length;

  if (placement === "top") {
    const next = `${pageContent.slice(0, openEnd)}\n${trimmed}\n${pageContent.slice(openEnd)}`;
    return { ok: true, content: next };
  }

  if (placement === "bottom") {
    const next = `${pageContent.slice(0, mainClose)}\n${trimmed}\n${pageContent.slice(mainClose)}`;
    return { ok: true, content: next };
  }

  if (placement.startsWith("after-")) {
    const sectionType = placement.slice("after-".length).trim().toLowerCase();
    if (!sectionType || !(sectionType in AFTER_SECTION_MARKERS)) {
      return { ok: false, reason: "Okänd after-placering — använd AI." };
    }
    const endIndex = findSectionEndIndex(pageContent, sectionType);
    if (endIndex == null || endIndex <= openEnd || endIndex > mainClose) {
      return {
        ok: false,
        reason: `Kunde inte hitta sektion "${sectionType}" för direkt patch — använd AI.`,
      };
    }
    const next = `${pageContent.slice(0, endIndex)}\n${trimmed}\n${pageContent.slice(endIndex)}`;
    return { ok: true, content: next };
  }

  return {
    ok: false,
    reason: `Placering "${placement}" stöds inte för direkt patch ännu — använd AI.`,
  };
}
