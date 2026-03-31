export function chooseUnsplashOrientation(
  width: number,
  height: number,
): "landscape" | "portrait" | "squarish" {
  const ratio = width / height;
  if (ratio > 1.3) return "landscape";
  if (ratio < 0.77) return "portrait";
  return "squarish";
}

export function inferUnsplashOrientationFromUrl(
  url: string,
): "landscape" | "portrait" | "squarish" {
  try {
    const parsed = new URL(url);
    const width = Number(parsed.searchParams.get("w"));
    const height = Number(parsed.searchParams.get("h"));
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return chooseUnsplashOrientation(width, height);
    }
  } catch {
    // Ignore malformed URLs and fall back to landscape.
  }
  return "landscape";
}

const FILLER_WORDS = new Set([
  "och", "i", "med", "som", "en", "ett", "den", "det", "av", "på", "för",
  "pa", "for",
  "till", "från", "om", "att", "är", "var", "har", "kan", "ska", "vill",
  "the", "a", "an", "of", "in", "with", "and", "for", "on", "at", "from",
  "that", "is", "are", "was", "has", "very", "really", "also", "some",
]);

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeQuery(raw: string): string {
  return raw
    .replace(/\$\{[^}]*\}/g, "")
    .replace(/`/g, "")
    .replace(/encodeURIComponent/gi, "")
    .replace(/\([^)]*\)/g, "")
    .trim();
}

function normalizeSearchQuery(raw: string, maxWords = 6): string {
  const words = sanitizeQuery(raw)
    .replace(/[+_-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !FILLER_WORDS.has(word.toLowerCase()));
  return words.slice(0, maxWords).join(" ");
}

function shortenQuery(normalized: string, maxWords = 3): string {
  return normalized.split(/\s+/).slice(0, maxWords).join(" ");
}

const STYLE_WORDS = new Set([
  "dramatic", "dramatiskt", "dramatiska",
  "futuristic", "futuristisk", "futuristiska",
  "cinematic", "cinematisk", "cinematiska",
  "neon", "neonaktiga", "intelligent", "nyfiket", "nyfikna",
  "family", "friendly", "familjevanlig", "familjevänlig",
  "adventure", "adventurous", "upptackarkansla", "upptäckarkänsla",
  "high", "contrast", "kontrast",
  "future", "framtid", "framtidskansla", "framtidskänsla",
]);

/**
 * Keep replacements generic and photography-oriented.
 * Avoid hard-coding domain nouns like coffee, Mallorca, Zelda, etc.
 */
const QUERY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bportratt\b/giu, "portrait"],
  [/\bporträtt\b/giu, "portrait"],
  [/\bnärbild\b/giu, "close up"],
  [/\butomhus\b/giu, "outdoor"],
  [/\buttryck\b/giu, "expression"],
  [/\brörelse\b/giu, "movement"],
  [/\brorelse\b/giu, "movement"],
  [/\bsolnedgang\b/giu, "sunset"],
  [/\bsolnedgång\b/giu, "sunset"],
  [/\bvarmt ljus\b/giu, "warm light"],
  [/\bnaturligt ljus\b/giu, "natural light"],
  [/\bvarma farger\b/giu, "warm colors"],
  [/\bvarma färger\b/giu, "warm colors"],
  [/\bnaturmiljö\b/giu, "nature"],
  [/\bnaturlandskap\b/giu, "nature landscape"],
  [/\bmedelhav(?:s)?\b/giu, "mediterranean"],
  [/\bklippmiljö\b/giu, "cliffs"],
  [/\bklippor\b/giu, "cliffs"],
  [/\bgrönska\b/giu, "greenery"],
  [/\bljusdetaljer\b/giu, "light details"],
  [/\bneonreflexer\b/giu, "neon reflections"],
  [/\bskymningen\b/giu, "twilight"],
];

function stripLeadingProperName(raw: string): string {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  if (words.length < 3) return raw;
  const first = words[0] ?? "";
  if (!/^[A-ZÅÄÖ][A-Za-zÅÄÖåäö-]+$/.test(first)) {
    return raw;
  }
  return words.slice(1).join(" ");
}

function translateSearchQuery(raw: string): string {
  let translated = raw.toLowerCase();
  for (const [pattern, replacement] of QUERY_REPLACEMENTS) {
    translated = translated.replace(pattern, replacement);
  }
  return normalizeWhitespace(translated);
}

function toAscii(value: string): string {
  return normalizeWhitespace(
    value.normalize("NFD").replace(/\p{Diacritic}/gu, ""),
  );
}

function stripStyleWords(raw: string, maxWords = 6): string {
  const words = raw
    .split(/\s+/)
    .filter((word) => word.length > 0 && !STYLE_WORDS.has(word.toLowerCase()));
  return words.slice(0, maxWords).join(" ");
}

function buildCompactFallbackQuery(raw: string): string | null {
  const compact = raw.replace(/\s+/g, "");
  if (compact.length >= 4 && compact.length <= 24) return compact;
  return null;
}

function buildProgressivePhraseCandidates(raw: string): string[] {
  const words = raw.split(/\s+/).filter(Boolean);
  const candidates: string[] = [];

  for (let size = words.length; size >= 1; size -= 1) {
    candidates.push(words.slice(0, size).join(" "));
  }
  for (let start = 1; start < words.length; start += 1) {
    candidates.push(words.slice(start).join(" "));
  }

  return candidates.map(normalizeWhitespace).filter(Boolean);
}

function buildSegmentCandidates(raw: string): string[] {
  return raw
    .split(/[,:;/|]/)
    .map((segment) => normalizeWhitespace(segment))
    .filter(Boolean);
}

function buildBroadFallbackQuery(raw: string): string[] {
  const words = raw.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const candidates: string[] = [];
  if (words.length >= 2) {
    candidates.push(words.slice(0, 2).join(" "));
  }
  if (words.length >= 1) {
    candidates.push(words[0]);
    candidates.push(words[words.length - 1]!);
  }
  return candidates.map(normalizeWhitespace).filter(Boolean);
}

export function buildUnsplashSearchCandidates(raw: string): string[] {
  const nameStrippedRaw = stripLeadingProperName(raw);
  const normalized = normalizeSearchQuery(raw);
  const normalizedNameStripped =
    nameStrippedRaw !== raw ? normalizeSearchQuery(nameStrippedRaw, 8) : "";
  const translated = normalizeSearchQuery(translateSearchQuery(raw), 8);
  const translatedNameStripped =
    nameStrippedRaw !== raw ? normalizeSearchQuery(translateSearchQuery(nameStrippedRaw), 8) : "";
  const strippedTranslated = stripStyleWords(translated);
  const strippedTranslatedNameStripped = stripStyleWords(translatedNameStripped);
  const baseQuery =
    strippedTranslatedNameStripped ||
    strippedTranslated ||
    translatedNameStripped ||
    translated ||
    normalizedNameStripped ||
    normalized;
  const asciiBaseQuery = toAscii(baseQuery);

  const segmentCandidates = [
    ...buildSegmentCandidates(raw),
    ...buildSegmentCandidates(translateSearchQuery(raw)),
  ];

  const progressiveCandidates = [
    ...buildProgressivePhraseCandidates(baseQuery),
    ...buildProgressivePhraseCandidates(asciiBaseQuery),
    ...segmentCandidates.flatMap((segment) => buildProgressivePhraseCandidates(segment)),
  ];

  const compactCandidates = [
    buildCompactFallbackQuery(baseQuery),
    buildCompactFallbackQuery(asciiBaseQuery),
    ...progressiveCandidates.map(buildCompactFallbackQuery),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const broadFallbacks = buildBroadFallbackQuery(baseQuery);

  return [
    translatedNameStripped,
    strippedTranslatedNameStripped,
    translated,
    strippedTranslated,
    normalizedNameStripped,
    normalized,
    toAscii(translatedNameStripped),
    toAscii(strippedTranslatedNameStripped),
    toAscii(translated),
    toAscii(strippedTranslated),
    toAscii(normalizedNameStripped),
    toAscii(normalized),
    translatedNameStripped ? shortenQuery(translatedNameStripped, 4) : "",
    translated ? shortenQuery(translated, 4) : "",
    normalizedNameStripped ? shortenQuery(normalizedNameStripped, 4) : "",
    normalized ? shortenQuery(normalized, 4) : "",
    ...progressiveCandidates,
    ...compactCandidates,
    ...broadFallbacks,
  ]
    .map((candidate) => normalizeWhitespace(candidate))
    .filter(Boolean)
    .filter((candidate, index, arr) => arr.indexOf(candidate) === index);
}
