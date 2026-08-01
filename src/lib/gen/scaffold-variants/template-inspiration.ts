import { posix } from "node:path";

import type { CodeFile } from "../parser";
import {
  VARIANT_TEMPLATE_STYLE_REFERENCE_PURPOSE,
  type RequestAttachment,
} from "../request-metadata";
import blobManifestData from "../../templates/template-blob-manifest.json";
import type { ScaffoldVariant } from "./types";

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

type ManifestTemplate = {
  id: string;
  title: string;
  category: string;
  archiveUrl: string;
  stillImageUrl: string;
  previewFits?: boolean | null;
};

export type VariantTemplateStructuralReference = {
  path: string;
  language: string;
  reason: "primary-page" | "direct-component" | "global-styles" | "root-layout";
  excerpt: string;
};

export type VariantTemplateInspiration = {
  templateId: string;
  title: string;
  category: VariantTemplateFullProjectCategory;
  archiveUrl: string;
  stillImageUrl: string;
  structuralReferences: VariantTemplateStructuralReference[];
};

type TemplateFileLoader = (templateId: string) => Promise<{ files: CodeFile[] } | null>;

type ResolveVariantTemplateInspirationOptions = {
  includeStructure?: boolean;
  loadFiles?: TemplateFileLoader;
  timeoutMs?: number;
};

const FULL_PROJECT_CATEGORY_SET = new Set<string>(VARIANT_TEMPLATE_FULL_PROJECT_CATEGORIES);
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
        stillImageUrl,
        previewFits: typeof row.previewFits === "boolean" ? row.previewFits : null,
      },
    ];
  });
}

const TEMPLATE_BY_ID = new Map(
  readManifestTemplates().map((template) => [template.id, template] as const),
);

function isFullProjectTemplate(
  template: ManifestTemplate,
): template is ManifestTemplate & { category: VariantTemplateFullProjectCategory } {
  return FULL_PROJECT_CATEGORY_SET.has(template.category);
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
  return (
    candidateFiles
      .filter((file) => /(^|\/)components?\//i.test(normalizedPath(file.path)))
      .sort(longestFirst)[0] ??
    // Fallbacken tog tidigare den längsta lokala importen rakt av. Har sidan
    // ingen import under `components/` kunde det lika gärna vara en server
    // action, auth-helper eller datalagerfil — och då hade backendkod hamnat i
    // "Variant Template Inspiration", tvärtemot kontraktet att bara frontend
    // följer med. Hellre ingen komponent alls än fel sorts kod.
    candidateFiles.filter(looksLikeFrontendComponent).sort(longestFirst)[0] ??
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
  if (cached) return cached;

  const pending = (async () => {
    const { loadLocalV0TemplateFiles } = await import("@/lib/templates/local-v0-template-source");
    const loaded = await withTimeout(loadLocalV0TemplateFiles(templateId), timeoutMs);
    return extractVariantTemplateStructuralReferences(loaded?.files ?? []);
  })();
  structuralReferenceCache.set(templateId, pending);
  try {
    return await pending;
  } catch (error) {
    structuralReferenceCache.delete(templateId);
    throw error;
  }
}

/** Resolve the one selected template and, when enabled, its bounded ZIP excerpts. */
export async function resolveVariantTemplateInspiration(
  variant: Pick<ScaffoldVariant, "sourceTemplateIds"> | null | undefined,
  options: ResolveVariantTemplateInspirationOptions = {},
): Promise<VariantTemplateInspiration | null> {
  const selected = selectVariantTemplateReference(variant);
  if (!selected) return null;

  const includeStructure = options.includeStructure ?? process.env.NODE_ENV !== "test";
  if (!includeStructure) return { ...selected, structuralReferences: [] };

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
