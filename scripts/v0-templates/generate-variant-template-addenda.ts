#!/usr/bin/env node
/**
 * Materialize the bounded frontend excerpts used by scaffold variants.
 *
 * The generated registry is SHA-bound to template-blob-manifest.json. Runtime
 * consumes a valid entry without downloading the ZIP and falls back to the
 * existing bounded ZIP reader when an entry is missing, stale, or invalid.
 *
 * Usage:
 *   npm run templates:addenda -- --write
 *   npm run templates:addenda -- --write --refresh-generated
 *   npm run templates:addenda -- --write --refresh-reviewed
 *   npm run templates:addenda -- --check
 *   npm run templates:addenda -- --write --all
 *   npm run templates:addenda -- --write --ids=id1,id2
 */

import { createHash } from "node:crypto";
import { readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

import {
  parseVariantTemplateAddendaRegistry,
  type VariantTemplateAddendaRegistry,
  type VariantTemplateAddendum,
  VARIANT_TEMPLATE_ADDENDA_VERSION,
} from "../../src/lib/gen/scaffold-variants/variant-template-addendum";
import { extractVariantTemplateStructuralReferences } from "../../src/lib/gen/scaffold-variants/template-inspiration";
import { extractV0TemplateReferenceFiles } from "../../src/lib/templates/local-v0-template-source";

const ROOT = process.cwd();
const MANIFEST_PATH = resolve(ROOT, "src/lib/templates/template-blob-manifest.json");
const ADDENDA_PATH = resolve(ROOT, "config/variant-template-addenda.json");
const VARIANTS_ROOT = resolve(ROOT, "config/scaffold-variants");
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const ARCHIVE_TIMEOUT_MS = 30_000;
const DEFAULT_CONCURRENCY = 4;

type ManifestTemplate = {
  id: string;
  archiveUrl: string;
  archiveSha256: string;
};

type Manifest = {
  templates?: unknown;
};

const args = process.argv.slice(2);
const shouldWrite = args.includes("--write");
const shouldCheck = args.includes("--check");
const includeAll = args.includes("--all");
const refreshGenerated = args.includes("--refresh-generated");
const refreshReviewed = args.includes("--refresh-reviewed");
const idsArg = readArg("--ids");
const concurrency = readPositiveInt("--concurrency") ?? DEFAULT_CONCURRENCY;

function readArg(name: string): string | null {
  const prefix = `${name}=`;
  return (
    args
      .find((arg) => arg.startsWith(prefix))
      ?.slice(prefix.length)
      .trim() || null
  );
}

function readPositiveInt(name: string): number | null {
  const value = readArg(name);
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseManifestTemplate(value: unknown): ManifestTemplate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const archiveUrl = typeof row.archiveUrl === "string" ? row.archiveUrl.trim() : "";
  const archiveSha256 =
    typeof row.archiveSha256 === "string" ? row.archiveSha256.trim().toLowerCase() : "";
  if (!id || !/^https:\/\//.test(archiveUrl) || !/^[a-f0-9]{64}$/.test(archiveSha256)) {
    return null;
  }
  return { id, archiveUrl, archiveSha256 };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function readManifest(): Promise<Map<string, ManifestTemplate>> {
  const raw = (await readJson(MANIFEST_PATH)) as Manifest;
  const templates = Array.isArray(raw.templates) ? raw.templates : [];
  const result = new Map<string, ManifestTemplate>();
  for (const value of templates) {
    const parsed = parseManifestTemplate(value);
    if (!parsed) continue;
    result.set(parsed.id, parsed);
  }
  return result;
}

async function readReferencedTemplateIds(): Promise<Set<string>> {
  const result = new Set<string>();
  for (const scaffoldEntry of await readdir(VARIANTS_ROOT, { withFileTypes: true })) {
    if (!scaffoldEntry.isDirectory() || scaffoldEntry.name.startsWith("_")) continue;
    const scaffoldDir = resolve(VARIANTS_ROOT, scaffoldEntry.name);
    for (const file of await readdir(scaffoldDir, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith(".json")) continue;
      const raw = (await readJson(resolve(scaffoldDir, file.name))) as {
        sourceTemplateIds?: unknown;
      };
      if (!Array.isArray(raw.sourceTemplateIds)) continue;
      for (const value of raw.sourceTemplateIds) {
        if (typeof value === "string" && value.trim()) result.add(value.trim());
      }
    }
  }
  return result;
}

async function fetchVerifiedArchive(template: ManifestTemplate): Promise<Buffer> {
  const response = await fetch(template.archiveUrl, {
    signal: AbortSignal.timeout(ARCHIVE_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`archive fetch failed (${response.status})`);
  }
  const contentLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_ARCHIVE_BYTES) {
    throw new Error(`archive exceeds ${MAX_ARCHIVE_BYTES} bytes`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error(`archive exceeds ${MAX_ARCHIVE_BYTES} bytes`);
  }
  const actualSha = createHash("sha256").update(buffer).digest("hex");
  if (actualSha !== template.archiveSha256) {
    throw new Error(`archive sha mismatch (${actualSha} != ${template.archiveSha256})`);
  }
  return buffer;
}

async function generateEntry(template: ManifestTemplate): Promise<VariantTemplateAddendum> {
  const archive = await fetchVerifiedArchive(template);
  const files = await extractV0TemplateReferenceFiles(archive);
  return {
    templateId: template.id,
    sourceArchiveSha256: template.archiveSha256,
    reviewStatus: "generated",
    structuralReferences: extractVariantTemplateStructuralReferences(files),
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  task: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, Math.max(values.length, 1)) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      results[index] = await task(values[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

function registryForWrite(templates: VariantTemplateAddendum[]): VariantTemplateAddendaRegistry {
  return {
    $schema: "../docs/schemas/strict/variant-template-addenda.schema.json",
    _comment:
      "SHA-bound structural excerpts used by scaffold variants before falling back to a template ZIP.",
    _version: VARIANT_TEMPLATE_ADDENDA_VERSION,
    templates: [...templates].sort((a, b) => a.templateId.localeCompare(b.templateId)),
  };
}

async function writeRegistryAtomically(registry: VariantTemplateAddendaRegistry): Promise<void> {
  const validated = parseVariantTemplateAddendaRegistry(registry);
  const temporaryPath = resolve(
    dirname(ADDENDA_PATH),
    `.variant-template-addenda.${process.pid}.${Date.now()}.tmp.json`,
  );
  try {
    await writeFile(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
    await rename(temporaryPath, ADDENDA_PATH);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function checkRegistry(
  registry: VariantTemplateAddendaRegistry,
  manifestById: ReadonlyMap<string, ManifestTemplate>,
): Promise<void> {
  const referencedIds = await readReferencedTemplateIds();
  const entriesById = new Map(registry.templates.map((entry) => [entry.templateId, entry]));
  const problems: string[] = [];
  for (const templateId of referencedIds) {
    const manifest = manifestById.get(templateId);
    const entry = entriesById.get(templateId);
    if (!manifest) {
      problems.push(`${templateId}: missing valid Blob manifest row`);
    } else if (!entry) {
      problems.push(`${templateId}: missing addendum`);
    } else if (
      entry.reviewStatus !== "disabled" &&
      entry.sourceArchiveSha256 !== manifest.archiveSha256
    ) {
      problems.push(`${templateId}: stale addendum sha`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`variant-template addenda check failed:\n- ${problems.join("\n- ")}`);
  }
  console.log(
    `[variant-template-addenda] OK: ${registry.templates.length} entries; ${referencedIds.size} referenced template ids covered`,
  );
}

async function main(): Promise<void> {
  if (shouldWrite && shouldCheck) throw new Error("Choose either --write or --check.");
  if (!shouldWrite && !shouldCheck) {
    throw new Error("No action selected. Use --write or --check.");
  }

  const manifestById = await readManifest();
  const existing = parseVariantTemplateAddendaRegistry(await readJson(ADDENDA_PATH));
  if (shouldCheck) {
    await checkRegistry(existing, manifestById);
    return;
  }

  const requestedIds = idsArg
    ? new Set(
        idsArg
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      )
    : includeAll
      ? new Set(manifestById.keys())
      : await readReferencedTemplateIds();
  const existingById = new Map(existing.templates.map((entry) => [entry.templateId, entry]));
  const generatedById = new Map(existingById);
  const toGenerate: ManifestTemplate[] = [];

  for (const templateId of [...requestedIds].sort((a, b) => a.localeCompare(b))) {
    const template = manifestById.get(templateId);
    if (!template) throw new Error(`${templateId}: no valid Blob manifest row`);
    const current = existingById.get(templateId);
    if (current?.reviewStatus === "disabled") {
      generatedById.set(templateId, {
        ...current,
        sourceArchiveSha256: template.archiveSha256,
        structuralReferences: [],
      });
      continue;
    }
    const currentMatches = current?.sourceArchiveSha256 === template.archiveSha256;
    if (current?.reviewStatus === "reviewed" && !currentMatches && !refreshReviewed) {
      throw new Error(
        `${templateId}: reviewed addendum is stale; inspect the new archive and rerun with --refresh-reviewed to replace the manual edits`,
      );
    }
    const shouldRefresh = refreshGenerated && current?.reviewStatus === "generated";
    const shouldRefreshReviewed = refreshReviewed && current?.reviewStatus === "reviewed";
    if (currentMatches && !shouldRefresh && !shouldRefreshReviewed) continue;
    toGenerate.push(template);
  }

  console.log(
    `[variant-template-addenda] requested=${requestedIds.size} generate=${toGenerate.length} preserved=${requestedIds.size - toGenerate.length}`,
  );
  const generated = await mapWithConcurrency(toGenerate, concurrency, async (template) => {
    console.log(`[variant-template-addenda] reading ${template.id}`);
    try {
      return await generateEntry(template);
    } catch (error) {
      throw new Error(`${template.id}: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  });
  for (const entry of generated) generatedById.set(entry.templateId, entry);

  const registry = registryForWrite([...generatedById.values()]);
  await checkRegistry(registry, manifestById);
  await writeRegistryAtomically(registry);
  console.log(`[variant-template-addenda] wrote ${ADDENDA_PATH}`);
}

main().catch((error) => {
  console.error(
    "[variant-template-addenda] Failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
