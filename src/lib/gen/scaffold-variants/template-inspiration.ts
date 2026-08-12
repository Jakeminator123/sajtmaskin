import { posix } from "node:path";

import type { CodeFile } from "../parser";
import {
  VARIANT_TEMPLATE_STYLE_REFERENCE_PURPOSE,
  type RequestAttachment,
} from "../request-metadata";
import blobManifestData from "../../templates/template-blob-manifest.json";
import type { ScaffoldVariant } from "./types";
import {
  resolveVariantTemplateAddendum,
  type VariantTemplateAddendumResolution,
  type VariantTemplateStructuralReference,
  warnVariantTemplateAddendumFallback,
} from "./variant-template-addendum";

export const VARIANT_TEMPLATE_FULL_PROJECT_CATEGORIES = [
  "landing-pages",
  "website-templates",
  "apps-and-games",
  "dashboards",
  "login-and-sign-up",
  "e-commerce",
  "blog-and-portfolio",
] as const;

export type VariantTemplateFullProjectCategory =
  (typeof VARIANT_TEMPLATE_FULL_PROJECT_CATEGORIES)[number];

/**
 * Explicitly reviewed complete projects whose gallery category is topical or
 * otherwise too broad to allow as a category. Id, category **and** archive
 * SHA-256 must all match: the id and category stop a regenerated catalog from
 * silently broadening the exception, and the SHA stops the reverse — the same
 * id keeping its reviewed status after the archive behind it was replaced with
 * different content.
 */
export const VARIANT_TEMPLATE_REVIEWED_FULL_PROJECTS = {
  h4nibkqysVJ: {
    category: "ai",
    archiveSha256: "4bc0cb3cf73ba2e4f98ded19a1240e040d179faecbcf1c41f7037059a040e337",
  },
} as const;

type VariantTemplateReviewedFullProjectCategory =
  (typeof VARIANT_TEMPLATE_REVIEWED_FULL_PROJECTS)[keyof typeof VARIANT_TEMPLATE_REVIEWED_FULL_PROJECTS]["category"];

export type VariantTemplateReferenceCategory =
  | VariantTemplateFullProjectCategory
  | VariantTemplateReviewedFullProjectCategory;

type ManifestTemplate = {
  id: string;
  title: string;
  category: string;
  archiveUrl: string;
  archiveSha256: string | null;
  stillImageUrl: string;
  previewFits?: boolean | null;
};

export type VariantTemplateInspiration = {
  templateId: string;
  title: string;
  category: VariantTemplateReferenceCategory;
  archiveUrl: string;
  stillImageUrl: string;
  structuralReferences: VariantTemplateStructuralReference[];
};

type TemplateFileLoader = (templateId: string) => Promise<{ files: CodeFile[] } | null>;
type TemplateAddendumLoader = (templateId: string) => VariantTemplateAddendumResolution;

type ResolveVariantTemplateInspirationOptions = {
  includeStructure?: boolean;
  loadAddendum?: TemplateAddendumLoader;
  loadFiles?: TemplateFileLoader;
  timeoutMs?: number;
};

const FULL_PROJECT_CATEGORY_SET = new Set<string>(VARIANT_TEMPLATE_FULL_PROJECT_CATEGORIES);
const REVIEWED_FULL_PROJECT_BY_ID: Readonly<
  Record<string, { category: string; archiveSha256: string }>
> = VARIANT_TEMPLATE_REVIEWED_FULL_PROJECTS;
const MAX_STRUCTURAL_EXCERPT_CHARS = 9_000;
const DEFAULT_ARCHIVE_TIMEOUT_MS = 15_000;
const STRUCTURAL_FILE_EXTENSIONS = [".tsx", ".jsx", ".ts", ".js", ".css"];

function readManifestTemplates(): ManifestTemplate[] {
  const templates = (blobManifestData as { templates?: unknown }).templates;
  if (!Array.isArray(templates)) return [];
  return templates.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const category = typeof row.category === "string" ? row.category.trim() : "";
    const archiveUrl = typeof row.archiveUrl === "string" ? row.archiveUrl.trim() : "";
    const stillImageUrl = typeof row.stillImageUrl === "string" ? row.stillImageUrl.trim() : "";
    if (!id || !title || !category || !archiveUrl || !stillImageUrl) return [];
    return [
      {
        id,
        title,
        category,
        archiveUrl,
        archiveSha256: typeof row.archiveSha256 === "string" ? row.archiveSha256.trim() : null,
        stillImageUrl,
        previewFits: typeof row.previewFits === "boolean" ? row.previewFits : null,
      },
    ];
  });
}

const TEMPLATE_BY_ID = new Map(
  readManifestTemplates().map((template) => [template.id, template] as const),
);

function isReviewedFullProjectTemplate(template: ManifestTemplate): boolean {
  const reviewed = REVIEWED_FULL_PROJECT_BY_ID[template.id];
  if (!reviewed || reviewed.category !== template.category) return false;
  return template.archiveSha256?.trim().toLowerCase() === reviewed.archiveSha256;
}

function isFullProjectTemplate(
  template: ManifestTemplate,
): template is ManifestTemplate & { category: VariantTemplateReferenceCategory } {
  return (
    FULL_PROJECT_CATEGORY_SET.has(template.category) || isReviewedFullProjectTemplate(template)
  );
}

/**
 * Pick at most one complete-project Blob template for a variant. Configured
 * source order is authoritative, except that a preview-compatible source is
 * preferred over an earlier source known not to fit the preview limits.
 */
export function selectVariantTemplateReference(
  variant: Pick<ScaffoldVariant, "sourceTemplateIds"> | null | undefined,
): Omit<VariantTemplateInspiration, "structuralReferences"> | null {
  const eligible = (variant?.sourceTemplateIds ?? []).flatMap((templateId) => {
    const template = TEMPLATE_BY_ID.get(templateId);
    return template && isFullProjectTemplate(template) ? [template] : [];
  });
  const selected = eligible.find((template) => template.previewFits !== false) ?? eligible[0];
  if (!selected || !isFullProjectTemplate(selected)) return null;

  return {
    templateId: selected.id,
    title: selected.title,
    category: selected.category,
    archiveUrl: selected.archiveUrl,
    stillImageUrl: selected.stillImageUrl,
  };
}

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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Template archive read timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

const structuralReferenceCache = new Map<string, Promise<VariantTemplateStructuralReference[]>>();

async function loadDefaultStructuralReferences(
  templateId: string,
  timeoutMs: number,
): Promise<VariantTemplateStructuralReference[]> {
  const cached = structuralReferenceCache.get(templateId);
  if (cached) return withTimeout(cached, timeoutMs);

  const pending = (async () => {
    const { loadLocalV0TemplateReferenceFiles } =
      await import("@/lib/templates/local-v0-template-source");
    const loaded = await loadLocalV0TemplateReferenceFiles(templateId, { timeoutMs });
    return extractVariantTemplateStructuralReferences(loaded?.files ?? []);
  })();
  structuralReferenceCache.set(templateId, pending);
  pending.catch(() => {
    structuralReferenceCache.delete(templateId);
  });
  return withTimeout(pending, timeoutMs);
}

/**
 * Resolve one selected template. A SHA-bound, reviewable addendum is preferred;
 * the bounded ZIP reader remains a fail-open compatibility fallback.
 */
export async function resolveVariantTemplateInspiration(
  variant: Pick<ScaffoldVariant, "sourceTemplateIds"> | null | undefined,
  options: ResolveVariantTemplateInspirationOptions = {},
): Promise<VariantTemplateInspiration | null> {
  const selected = selectVariantTemplateReference(variant);
  if (!selected) return null;

  const includeStructure = options.includeStructure ?? process.env.NODE_ENV !== "test";
  if (!includeStructure) return { ...selected, structuralReferences: [] };

  const addendum = (options.loadAddendum ?? resolveVariantTemplateAddendum)(selected.templateId);
  if (addendum.structuralReferences !== null) {
    return { ...selected, structuralReferences: addendum.structuralReferences };
  }
  if (addendum.state === "stale" || addendum.state === "invalid") {
    warnVariantTemplateAddendumFallback(selected.templateId, addendum);
  }

  try {
    const structuralReferences = options.loadFiles
      ? extractVariantTemplateStructuralReferences(
          (await options.loadFiles(selected.templateId))?.files ?? [],
        )
      : await loadDefaultStructuralReferences(
          selected.templateId,
          options.timeoutMs ?? DEFAULT_ARCHIVE_TIMEOUT_MS,
        );
    return { ...selected, structuralReferences };
  } catch (error) {
    console.warn(
      `[variant-template-inspiration] Could not read ${selected.templateId}; continuing without structural excerpts:`,
      error,
    );
    return { ...selected, structuralReferences: [] };
  }
}

function stillImageExtension(url: string): string {
  try {
    const extension = posix.extname(new URL(url).pathname).toLowerCase();
    return [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extension) ? extension : ".jpg";
  } catch {
    return ".jpg";
  }
}

export function buildVariantTemplateReferenceAttachments(
  inspiration: VariantTemplateInspiration | null | undefined,
): RequestAttachment[] {
  if (!inspiration?.stillImageUrl) return [];
  return [
    {
      type: "system_reference",
      url: inspiration.stillImageUrl,
      filename: `${inspiration.templateId}-style-reference${stillImageExtension(
        inspiration.stillImageUrl,
      )}`,
      purpose: VARIANT_TEMPLATE_STYLE_REFERENCE_PURPOSE,
    },
  ];
}
