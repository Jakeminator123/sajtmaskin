/**
 * Directive loader for the adaptive prompt layer.
 *
 * Reads `config/codegen-directives-manifest.json` and loads each directive
 * markdown file with mtime-based caching (same pattern as static-core-loader.ts).
 *
 * Directives are prompt modules with placeholder defaults that get resolved
 * through the Directive Cascade:
 *   1. EXPLICIT  — Brief/prompt provides an exact value
 *   2. INDICATED — Brief-LLM infers from context
 *   3. INFERRED  — guidance-resolvers / deterministic heuristics
 *   4. DEFAULT   — Placeholder text in the directive file
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ROOT = join(/* turbopackIgnore: true */ process.cwd());

function getDirectivesManifestPath(): string {
  return join(/* turbopackIgnore: true */ PROJECT_ROOT, "config", "codegen-directives-manifest.json");
}

function getConfigDir(): string {
  return join(/* turbopackIgnore: true */ PROJECT_ROOT, "config");
}

export interface DirectiveMetadata {
  name: string;
  cascade: string | null;
  defaults: Map<string, string>;
}

export interface DirectiveContent {
  name: string;
  relativePath: string;
  rawMarkdown: string;
  metadata: DirectiveMetadata;
}

type ManifestJson = {
  fragmentSeparator?: string;
  directives?: unknown;
};

interface DirectiveCache {
  key: string;
  directives: Map<string, DirectiveContent>;
}

let cache: DirectiveCache | null = null;

function safeConfigPath(rel: string): string | null {
  const normalized = rel.replace(/\\/g, "/").trim();
  if (!normalized || normalized.includes("..") || normalized.startsWith("/")) {
    return null;
  }
  return join(getConfigDir(), /* turbopackIgnore: true */ ...normalized.split("/"));
}

function parseDirectiveMetadata(markdown: string): DirectiveMetadata {
  const nameMatch = /<!--\s*directive:\s*(.+?)\s*-->/.exec(markdown);
  const cascadeMatch = /<!--\s*cascade:\s*(.+?)\s*-->/.exec(markdown);

  const defaults = new Map<string, string>();
  const defaultPattern = /<!--\s*default:\s*(.+?)\s*-->/g;
  let match: RegExpExecArray | null;
  while ((match = defaultPattern.exec(markdown)) !== null) {
    defaults.set(`default_${defaults.size}`, match[1]);
  }

  return {
    name: nameMatch?.[1] ?? "unknown",
    cascade: cascadeMatch?.[1] ?? null,
    defaults,
  };
}

function buildCacheKey(manifestPath: string, directiveRels: string[]): string {
  const parts: string[] = [];
  try {
    parts.push(String(statSync(/* turbopackIgnore: true */ manifestPath).mtimeMs));
  } catch {
    parts.push("manifest-missing");
  }
  for (const rel of directiveRels) {
    const fp = safeConfigPath(rel);
    if (fp === null) {
      parts.push("invalid");
      continue;
    }
    try {
      parts.push(String(statSync(/* turbopackIgnore: true */ fp).mtimeMs));
    } catch {
      parts.push("missing");
    }
  }
  return parts.join("|");
}

function loadDirectivesFromManifest(): Map<string, DirectiveContent> | null {
  const manifestPath = getDirectivesManifestPath();
  if (!existsSync(/* turbopackIgnore: true */ manifestPath)) return null;

  let parsed: ManifestJson;
  try {
    parsed = JSON.parse(readFileSync(/* turbopackIgnore: true */ manifestPath, "utf8")) as ManifestJson;
  } catch {
    return null;
  }

  const entries = parsed.directives;
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const directiveRels = entries.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (directiveRels.length === 0) return null;

  const key = buildCacheKey(manifestPath, directiveRels);
  if (cache && cache.key === key) {
    return cache.directives;
  }

  const result = new Map<string, DirectiveContent>();
  for (const rel of directiveRels) {
    const fp = safeConfigPath(rel);
    if (fp === null) continue;

    let raw: string;
    try {
      raw = readFileSync(/* turbopackIgnore: true */ fp, "utf8").replace(/^\uFEFF/, "").trimEnd();
    } catch {
      continue;
    }

    if (!raw.trim()) continue;

    const metadata = parseDirectiveMetadata(raw);
    result.set(metadata.name, {
      name: metadata.name,
      relativePath: rel,
      rawMarkdown: raw,
      metadata,
    });
  }

  cache = { key, directives: result };
  return result;
}

export function getDirective(name: string): DirectiveContent | null {
  const all = loadDirectivesFromManifest();
  return all?.get(name) ?? null;
}

export function getAllDirectives(): Map<string, DirectiveContent> {
  return loadDirectivesFromManifest() ?? new Map();
}

export function getDirectiveNames(): string[] {
  const all = loadDirectivesFromManifest();
  return all ? Array.from(all.keys()) : [];
}

export function getDirectiveRawText(name: string): string | null {
  return getDirective(name)?.rawMarkdown ?? null;
}
