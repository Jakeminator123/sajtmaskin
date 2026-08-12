import { extname } from "node:path";

export const CANONICAL_GLOSSARY = "docs/architecture/glossary.md";

const CANONICAL_TERM_SECTIONS = Object.freeze(["Kärntermer", "Publicering och URL-nivåer"]);
const ALIAS_SECTION = "Namnskuggor och legacy";

export function normalizeTerm(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function cleanMarkdownCell(value) {
  return String(value)
    .replace(/!?(?:\[([^\]]*)\])\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sectionLines(markdown, heading) {
  const lines = String(markdown).split(/\r?\n/);
  const expected = `## ${heading}`;
  const start = lines.findIndex((line) => line.trim() === expected);
  if (start === -1) return [];
  const result = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^#{1,2}\s/.test(lines[index])) break;
    result.push(lines[index]);
  }
  return result;
}

function parseTableRows(lines) {
  const rows = [];
  let passedSeparator = false;
  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map(cleanMarkdownCell);
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
      passedSeparator = true;
      continue;
    }
    if (!passedSeparator || cells.length < 2) continue;
    rows.push({ left: cells[0], right: cells[1] });
  }
  return rows;
}

function canonicalVariants(termCell) {
  const cleaned = cleanMarkdownCell(termCell);
  const variants = new Set([normalizeTerm(cleaned)]);
  for (const part of cleaned.split(/\s+\/\s+/)) variants.add(normalizeTerm(part));
  return [...variants].filter(Boolean);
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort((left, right) => left.localeCompare(right, "en"));
}

export function parseGlossary(markdown) {
  const missingSections = [];
  const canonicalRows = [];
  for (const section of CANONICAL_TERM_SECTIONS) {
    const lines = sectionLines(markdown, section);
    if (lines.length === 0) missingSections.push(section);
    canonicalRows.push(...parseTableRows(lines));
  }

  const aliasLines = sectionLines(markdown, ALIAS_SECTION);
  if (aliasLines.length === 0) missingSections.push(ALIAS_SECTION);
  const aliasRows = parseTableRows(aliasLines);
  const canonicalTerms = new Set(canonicalRows.flatMap((row) => canonicalVariants(row.left)));

  return {
    missingSections,
    canonicalRows,
    aliasRows,
    canonicalTerms,
    duplicateCanonicalRows: findDuplicates(
      canonicalRows.flatMap((row) => canonicalVariants(row.left)),
    ),
    duplicateAliasRows: findDuplicates(aliasRows.flatMap((row) => canonicalVariants(row.left))),
  };
}

export function normalizeRules(dictionary) {
  if (!Array.isArray(dictionary?.rules)) return [];
  return dictionary.rules.map((rule) => ({
    match: String(rule?.match ?? "").trim(),
    canonicalTerms: Array.isArray(rule?.canonicalTerms)
      ? rule.canonicalTerms.map((term) => String(term).trim()).filter(Boolean)
      : [],
    caseSensitive: rule?.caseSensitive === true,
    severity: rule?.severity === "block" ? "block" : "advisory",
  }));
}

export function aliasRegex(match, caseSensitive = false) {
  const escaped = String(match)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const leftBoundary = "(?<![\\p{L}\\p{N}_])";
  const rightBoundary = "(?![\\p{L}\\p{N}_])";
  return new RegExp(`${leftBoundary}${escaped}${rightBoundary}`, caseSensitive ? "gu" : "giu");
}

/**
 * Return Markdown prose line-by-line while preserving original line numbers.
 * Fenced code, inline code and HTML comments become empty text.
 */
export function markdownProseLines(content) {
  const lines = String(content).split(/\r?\n/);
  let fence = null;
  let inComment = false;
  return lines.map((source, index) => {
    const openingFence = source.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence === null && openingFence) {
      fence = { marker: openingFence[1][0], length: openingFence[1].length };
      return { line: index + 1, text: "" };
    }
    if (fence !== null) {
      const closingFence = source.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (
        closingFence &&
        closingFence[1][0] === fence.marker &&
        closingFence[1].length >= fence.length
      ) {
        fence = null;
      }
      return { line: index + 1, text: "" };
    }
    let text = source;
    if (inComment) {
      const end = text.indexOf("-->");
      if (end === -1) return { line: index + 1, text: "" };
      text = text.slice(end + 3);
      inComment = false;
    }
    while (true) {
      const start = text.indexOf("<!--");
      if (start === -1) break;
      const end = text.indexOf("-->", start + 4);
      if (end === -1) {
        text = text.slice(0, start);
        inComment = true;
        break;
      }
      text = `${text.slice(0, start)} ${text.slice(end + 3)}`;
    }
    text = text.replace(/(`+).*?\1/g, " ");
    return { line: index + 1, text };
  });
}

export function isMarkdownPath(path) {
  const extension = extname(path).toLowerCase();
  return extension === ".md" || extension === ".mdx";
}
