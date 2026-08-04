import { z } from "zod";

import addendaData from "../../../../config/variant-template-addenda.json";
import blobManifestData from "../../templates/template-blob-manifest.json";

export const VARIANT_TEMPLATE_ADDENDA_VERSION = "1.0.0" as const;
export const VARIANT_TEMPLATE_ADDENDUM_REVIEW_STATUSES = [
  "generated",
  "reviewed",
  "disabled",
] as const;

const STRUCTURAL_REFERENCE_REASONS = [
  "primary-page",
  "direct-component",
  "global-styles",
  "root-layout",
] as const;
const MAX_STRUCTURAL_REFERENCES = 3;
const MAX_STRUCTURAL_EXCERPT_CHARS = 9_000;
const MAX_REFERENCE_PATH_CHARS = 300;
const MAX_REVIEW_NOTES_CHARS = 2_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const LANGUAGE_PATTERN = /^[a-z0-9-]{1,24}$/;
/**
 * Same frontend allowlist the generator applies when it harvests candidates, so
 * a hand-edited `reviewed` record cannot smuggle a lockfile or package manifest
 * into the prompt.
 */
const REFERENCE_PATH_EXTENSION_PATTERN = /\.(?:tsx|jsx|ts|js|css)$/i;
/**
 * The path is rendered into a Markdown list item outside the code fence, so a
 * backtick or a line break in it could close the inline span and open a new
 * prompt section. Excerpts are already boundary-checked; paths need the same.
 */
const UNSAFE_REFERENCE_PATH_CHARS = /[`\u0000-\u001f\u007f]/;
const warnedAddendumProblems = new Set<string>();

function isSafeReferencePath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  return (
    value === normalized &&
    normalized.length > 0 &&
    normalized.length <= MAX_REFERENCE_PATH_CHARS &&
    !normalized.startsWith("/") &&
    !UNSAFE_REFERENCE_PATH_CHARS.test(normalized) &&
    !normalized.split("/").some((segment) => segment === "..") &&
    !/(^|\/)api\//i.test(normalized) &&
    REFERENCE_PATH_EXTENSION_PATTERN.test(normalized)
  );
}

function isPromptSafeExcerpt(value: string): boolean {
  return !value.includes("```") && !/^##(?=\s)/m.test(value);
}

const structuralReferenceSchema = z
  .object({
    path: z.string().refine(isSafeReferencePath, "unsafe or non-normalized reference path"),
    language: z.string().regex(LANGUAGE_PATTERN),
    reason: z.enum(STRUCTURAL_REFERENCE_REASONS),
    excerpt: z.string().min(1).max(MAX_STRUCTURAL_EXCERPT_CHARS),
  })
  .strict()
  .superRefine((reference, context) => {
    if (!isPromptSafeExcerpt(reference.excerpt)) {
      context.addIssue({
        code: "custom",
        path: ["excerpt"],
        message: "excerpt contains an unsafe Markdown boundary",
      });
    }
  });

export type VariantTemplateStructuralReference = z.infer<typeof structuralReferenceSchema>;

export const variantTemplateAddendumSchema = z
  .object({
    templateId: z.string().trim().min(1).max(100),
    sourceArchiveSha256: z.string().regex(SHA256_PATTERN),
    reviewStatus: z.enum(VARIANT_TEMPLATE_ADDENDUM_REVIEW_STATUSES),
    reviewNotes: z.string().trim().min(1).max(MAX_REVIEW_NOTES_CHARS).optional(),
    structuralReferences: z.array(structuralReferenceSchema).max(MAX_STRUCTURAL_REFERENCES),
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.reviewStatus === "disabled" && entry.structuralReferences.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["structuralReferences"],
        message: "disabled addenda must not contain structural references",
      });
    }

    const seenPaths = new Set<string>();
    for (let index = 0; index < entry.structuralReferences.length; index += 1) {
      const path = entry.structuralReferences[index]?.path.toLowerCase();
      if (!path || !seenPaths.has(path)) {
        if (path) seenPaths.add(path);
        continue;
      }
      context.addIssue({
        code: "custom",
        path: ["structuralReferences", index, "path"],
        message: `duplicate structural reference path ${path}`,
      });
    }

    const totalChars = entry.structuralReferences.reduce(
      (sum, reference) => sum + reference.excerpt.length,
      0,
    );
    if (totalChars > MAX_STRUCTURAL_EXCERPT_CHARS) {
      context.addIssue({
        code: "custom",
        path: ["structuralReferences"],
        message: `combined excerpts exceed ${MAX_STRUCTURAL_EXCERPT_CHARS} characters`,
      });
    }
  });

export const variantTemplateAddendaRegistrySchema = z
  .object({
    $schema: z.string().min(1),
    _comment: z.string().min(1),
    _version: z.literal(VARIANT_TEMPLATE_ADDENDA_VERSION),
    templates: z.array(variantTemplateAddendumSchema),
  })
  .strict()
  .superRefine((registry, context) => {
    const seen = new Set<string>();
    for (let index = 0; index < registry.templates.length; index += 1) {
      const templateId = registry.templates[index]?.templateId;
      if (!templateId || !seen.has(templateId)) {
        if (templateId) seen.add(templateId);
        continue;
      }
      context.addIssue({
        code: "custom",
        path: ["templates", index, "templateId"],
        message: `duplicate templateId ${templateId}`,
      });
    }
  });

export type VariantTemplateAddendum = z.infer<typeof variantTemplateAddendumSchema>;
export type VariantTemplateAddendaRegistry = z.infer<typeof variantTemplateAddendaRegistrySchema>;

export type VariantTemplateAddendumResolution =
  | {
      state: "hit" | "disabled";
      structuralReferences: VariantTemplateStructuralReference[];
    }
  | {
      state: "missing";
      structuralReferences: null;
    }
  | {
      state: "stale" | "invalid";
      structuralReferences: null;
      detail?: string;
    };

type BlobManifest = {
  templates?: Array<{ id?: unknown; archiveSha256?: unknown }>;
};

export function parseVariantTemplateAddendaRegistry(
  input: unknown,
): VariantTemplateAddendaRegistry {
  return variantTemplateAddendaRegistrySchema.parse(input);
}

export function buildVariantTemplateArchiveShaMap(input: unknown): Map<string, string> {
  const templates = (input as BlobManifest | null | undefined)?.templates;
  const result = new Map<string, string>();
  if (!Array.isArray(templates)) return result;
  for (const row of templates) {
    const id = typeof row?.id === "string" ? row.id.trim() : "";
    const archiveSha256 =
      typeof row?.archiveSha256 === "string" ? row.archiveSha256.trim().toLowerCase() : "";
    if (id && SHA256_PATTERN.test(archiveSha256)) {
      result.set(id, archiveSha256);
    }
  }
  return result;
}

function resolveVariantTemplateAddendumEntry(
  templateId: string,
  entry: VariantTemplateAddendum | undefined,
  archiveShaById: ReadonlyMap<string, string>,
): VariantTemplateAddendumResolution {
  if (!entry) return { state: "missing", structuralReferences: null };
  if (entry.reviewStatus === "disabled") {
    return { state: "disabled", structuralReferences: [] };
  }

  const expectedSha = archiveShaById.get(templateId);
  if (!expectedSha || entry.sourceArchiveSha256 !== expectedSha) {
    return {
      state: "stale",
      structuralReferences: null,
      detail: expectedSha
        ? `addendum sha ${entry.sourceArchiveSha256} does not match archive sha ${expectedSha}`
        : "template archive sha is missing from the Blob manifest",
    };
  }

  return {
    state: "hit",
    structuralReferences: entry.structuralReferences.map((reference) => ({ ...reference })),
  };
}

export function resolveVariantTemplateAddendumFromRegistry(
  templateId: string,
  registryInput: unknown,
  archiveShaById: ReadonlyMap<string, string>,
): VariantTemplateAddendumResolution {
  const parsed = variantTemplateAddendaRegistrySchema.safeParse(registryInput);
  if (!parsed.success) {
    return {
      state: "invalid",
      structuralReferences: null,
      detail: z.prettifyError(parsed.error),
    };
  }
  return resolveVariantTemplateAddendumEntry(
    templateId,
    parsed.data.templates.find((candidate) => candidate.templateId === templateId),
    archiveShaById,
  );
}

const archiveShaByTemplateId = buildVariantTemplateArchiveShaMap(blobManifestData);
const staticRegistry = variantTemplateAddendaRegistrySchema.safeParse(addendaData);
const staticAddendumByTemplateId = staticRegistry.success
  ? new Map(staticRegistry.data.templates.map((entry) => [entry.templateId, entry] as const))
  : null;
const staticRegistryError = staticRegistry.success ? null : z.prettifyError(staticRegistry.error);

export function resolveVariantTemplateAddendum(
  templateId: string,
): VariantTemplateAddendumResolution {
  if (!staticAddendumByTemplateId) {
    return {
      state: "invalid",
      structuralReferences: null,
      detail: staticRegistryError ?? "unknown addendum registry validation error",
    };
  }
  return resolveVariantTemplateAddendumEntry(
    templateId,
    staticAddendumByTemplateId.get(templateId),
    archiveShaByTemplateId,
  );
}

export function warnVariantTemplateAddendumFallback(
  templateId: string,
  resolution: { state: "stale" | "invalid"; detail?: string },
): void {
  const key = `${templateId}:${resolution.state}:${resolution.detail ?? ""}`;
  if (warnedAddendumProblems.has(key)) return;
  warnedAddendumProblems.add(key);
  console.warn(
    `[variant-template-addendum] ${templateId} is ${resolution.state}; falling back to the bounded ZIP reader${
      resolution.detail ? `: ${resolution.detail}` : ""
    }`,
  );
}
