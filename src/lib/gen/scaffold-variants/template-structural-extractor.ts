import { posix } from "node:path";

import type { CodeFile } from "../parser";
import type { VariantTemplateStructuralReference } from "./variant-template-addendum";

/**
 * Harvests bounded frontend excerpts from a template archive for the SHA-bound
 * addenda registry. Kept apart from template selection on purpose: the addenda
 * cache is fingerprinted over this module (`extractor-fingerprint.ts`), so an
 * edit to how a template is *chosen* must not invalidate every cached excerpt.
 *
 * Offline only: read by `scripts/v0-templates/generate-variant-template-addenda.ts`.
 * The user-site hot path never runs it.
 */

const MAX_STRUCTURAL_EXCERPT_CHARS = 9_000;
const STRUCTURAL_FILE_EXTENSIONS = [".tsx", ".jsx", ".ts", ".js", ".css"];

function normalizedPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function isStructuralTextFile(file: CodeFile): boolean {
  const path = normalizedPath(file.path).toLowerCase();
  return (
    Boolean(file.content.trim()) &&
    file.language !== "binary" &&
    STRUCTURAL_FILE_EXTENSIONS.some((extension) => path.endsWith(extension))
  );
}

function findPrimaryPage(files: CodeFile[]): CodeFile | null {
  const exactPriority = [
    "app/page.tsx",
    "src/app/page.tsx",
    "app/page.jsx",
    "src/app/page.jsx",
    "pages/index.tsx",
    "src/pages/index.tsx",
    "pages/index.jsx",
    "src/pages/index.jsx",
  ];
  const byPath = new Map(
    files.map((file) => [normalizedPath(file.path).toLowerCase(), file] as const),
  );
  for (const path of exactPriority) {
    const match = byPath.get(path);
    if (match) return match;
  }

  return (
    files
      .filter((file) => {
        const path = normalizedPath(file.path).toLowerCase();
        return (
          !path.includes("/api/") && /(^|\/)app\/(?:\([^/]+\)\/)*page\.(tsx|jsx|ts|js)$/.test(path)
        );
      })
      .sort(
        (a, b) =>
          normalizedPath(a.path).split("/").length - normalizedPath(b.path).split("/").length ||
          normalizedPath(a.path).localeCompare(normalizedPath(b.path)),
      )[0] ?? null
  );
}

function localImportSpecifiers(content: string): string[] {
  const matches = content.matchAll(/(?:from\s*|import\s*)["'](\.{1,2}\/[^"']+|@\/[^"']+)["']/g);
  return Array.from(matches, (match) => match[1]).filter(Boolean);
}

/** Markörer som gör en fil till serverkod oavsett var den ligger. */
const SERVER_ONLY_MARKERS = [
  /^\s*["']use server["']/m,
  /from\s+["']next\/server["']/,
  /from\s+["']server-only["']/,
];

/**
 * Sant bara för filer som bevisligen renderar UI.
 *
 * Kravet är positivt bevis, inte frånvaro av misstanke: rätt filändelse, ingen
 * servermarkör, och faktisk JSX i innehållet. En server action eller ett
 * datalager passerar inte, och det är hela poängen — inspirationen ska bara
 * bära frontend.
 */
function looksLikeFrontendComponent(file: CodeFile): boolean {
  const path = normalizedPath(file.path).toLowerCase();
  if (/(^|\/)api\//.test(path)) return false;
  const extension = posix.extname(path);
  if (extension !== ".tsx" && extension !== ".jsx") return false;
  if (SERVER_ONLY_MARKERS.some((marker) => marker.test(file.content))) return false;
  return /<[A-Za-z][\w.-]*[\s/>]/.test(file.content);
}

function resolveImportedFile(primaryPage: CodeFile, files: CodeFile[]): CodeFile | null {
  const byPath = new Map(
    files.map((file) => [normalizedPath(file.path).toLowerCase(), file] as const),
  );
  const pagePath = normalizedPath(primaryPage.path);
  const candidateFiles: CodeFile[] = [];

  for (const specifier of localImportSpecifiers(primaryPage.content)) {
    const bases = specifier.startsWith("@/")
      ? [specifier.slice(2), `src/${specifier.slice(2)}`]
      : [posix.normalize(posix.join(posix.dirname(pagePath), specifier))];
    for (const base of bases) {
      const candidates = posix.extname(base)
        ? [base]
        : [
            ...STRUCTURAL_FILE_EXTENSIONS.filter((extension) => extension !== ".css").map(
              (extension) => `${base}${extension}`,
            ),
            ...STRUCTURAL_FILE_EXTENSIONS.filter((extension) => extension !== ".css").map(
              (extension) => `${base}/index${extension}`,
            ),
          ];
      for (const candidate of candidates) {
        const match = byPath.get(normalizedPath(candidate).toLowerCase());
        if (match && match !== primaryPage && !candidateFiles.includes(match)) {
          candidateFiles.push(match);
        }
      }
    }
  }

  const longestFirst = (a: CodeFile, b: CodeFile) => b.content.length - a.content.length;
  // Fallbacken tog tidigare den längsta lokala importen rakt av. Har sidan
  // ingen import under `components/` kunde det lika gärna vara en server
  // action, auth-helper eller datalagerfil — och då hade backendkod hamnat i
  // "Variant Template Inspiration", tvärtemot kontraktet att bara frontend
  // följer med. Hellre ingen komponent alls än fel sorts kod.
  //
  // Kravet gäller `components/`-grenen också: den mappen innehåller lika ofta
  // hooks och state-reducers (`components/ui/use-toast.ts`) som faktisk UI, och
  // en hook utan JSX är ingen visuell inspiration — bara bortkastad
  // prompt-budget.
  const frontendCandidates = candidateFiles.filter(looksLikeFrontendComponent);
  return (
    frontendCandidates
      .filter((file) => /(^|\/)components?\//i.test(normalizedPath(file.path)))
      .sort(longestFirst)[0] ??
    [...frontendCandidates].sort(longestFirst)[0] ??
    null
  );
}

function findExactFile(files: CodeFile[], paths: string[]): CodeFile | null {
  const byPath = new Map(
    files.map((file) => [normalizedPath(file.path).toLowerCase(), file] as const),
  );
  for (const path of paths) {
    const match = byPath.get(path.toLowerCase());
    if (match) return match;
  }
  return null;
}

function truncateStructuralExcerpt(content: string, language: string, maxChars: number): string {
  const safe = content
    .trim()
    .replace(/```/g, "``\\`")
    // Dynamic-context budgeting splits on Markdown H2 lines. A template
    // literal or comment must never be able to create a new privileged block.
    .replace(/^##(?=\s)/gm, "\u200B##");
  if (safe.length <= maxChars) return safe;
  const marker =
    language === "css" ? "\n/* … excerpt truncated … */\n" : "\n// … excerpt truncated …\n";
  const available = maxChars - marker.length;
  const headLength = Math.floor(available * 0.68);
  return `${safe.slice(0, headLength)}${marker}${safe.slice(-(available - headLength))}`;
}

/**
 * Extract only high-signal frontend structure. Package manifests, lockfiles,
 * backend code and template assets are deliberately excluded.
 */
export function extractVariantTemplateStructuralReferences(
  inputFiles: CodeFile[],
): VariantTemplateStructuralReference[] {
  const files = inputFiles.filter(isStructuralTextFile);
  const primaryPage = findPrimaryPage(files);
  const directComponent = primaryPage ? resolveImportedFile(primaryPage, files) : null;
  const globalStyles = findExactFile(files, [
    "app/globals.css",
    "src/app/globals.css",
    "styles/globals.css",
    "src/styles/globals.css",
  ]);
  const rootLayout = findExactFile(files, [
    "app/layout.tsx",
    "src/app/layout.tsx",
    "app/layout.jsx",
    "src/app/layout.jsx",
  ]);

  const chosen: Array<{
    file: CodeFile;
    reason: VariantTemplateStructuralReference["reason"];
    maxChars: number;
  }> = [];
  const seen = new Set<string>();
  const add = (
    file: CodeFile | null,
    reason: VariantTemplateStructuralReference["reason"],
    maxChars: number,
  ) => {
    if (!file || chosen.length >= 3) return;
    const path = normalizedPath(file.path);
    if (seen.has(path.toLowerCase())) return;
    seen.add(path.toLowerCase());
    chosen.push({ file: { ...file, path }, reason, maxChars });
  };

  add(primaryPage, "primary-page", 4_200);
  add(directComponent, "direct-component", 2_700);
  add(globalStyles, "global-styles", 1_900);
  add(rootLayout, "root-layout", 2_000);

  let remaining = MAX_STRUCTURAL_EXCERPT_CHARS;
  return chosen.flatMap(({ file, reason, maxChars }) => {
    if (remaining <= 0) return [];
    const excerpt = truncateStructuralExcerpt(
      file.content,
      file.language,
      Math.min(maxChars, remaining),
    );
    remaining -= excerpt.length;
    return [
      {
        path: file.path,
        language: file.language || "text",
        reason,
        excerpt,
      },
    ];
  });
}
