import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { hasTraversalSegment, toPosixPath } from "@/lib/utils/path-utils";

/**
 * Own-engine Core Rules loader.
 *
 * Loads `config/codegen-core-manifest.json` and concatenates the listed
 * `config/prompt-core/*.md` fragments into the static core prompt.
 *
 * Paths are resolved once at module init so Turbopack never sees a nullable
 * `cwd` (which produced `null/...` union patterns and huge file sets).
 *
 * The legacy `codegen-static-prompt.json` + `config/prompt-static/` fallback
 * was removed 2026-04-18; the directive cascade (`config/prompt-directives/`
 * + `directive-loader.ts`) was removed in the same wave because only two of
 * its twelve files were ever runtime-injected — those were folded into core
 * (`prompt-core/03-visual-design.md` + `prompt-core/04-coding-direction.md`).
 * Anything per-request lives in `buildDynamicContext()` instead.
 */

const PROJECT_ROOT = join(/* turbopackIgnore: true */ process.cwd());

function getCoreManifestPath(): string {
  return join(/* turbopackIgnore: true */ PROJECT_ROOT, "config", "codegen-core-manifest.json");
}

function getConfigDir(): string {
  return join(/* turbopackIgnore: true */ PROJECT_ROOT, "config");
}

type ManifestJson = {
  fragmentSeparator?: string;
  fragments?: unknown;
};

type Cache = { key: string; content: string } | null;
let cache: Cache = null;

function safeConfigFragmentPath(rel: string): string | null {
  const normalized = rel.replace(/\\/g, "/").trim();
  // Segment-based (PR #396 class) så ett fragmentnamn som bara INNEHÅLLER
  // `..` inte avvisas i onödan; äkta `..`-segment stoppas fortfarande.
  if (!normalized || hasTraversalSegment(normalized) || normalized.startsWith("/")) {
    return null;
  }
  return join(getConfigDir(), /* turbopackIgnore: true */ ...normalized.split("/"));
}

function manifestCacheKey(manifestPath: string, fragmentRels: string[]): string {
  const parts: string[] = [String(statSync(/* turbopackIgnore: true */ manifestPath).mtimeMs)];
  for (const rel of fragmentRels) {
    const fp = safeConfigFragmentPath(rel);
    if (fp === null) {
      parts.push("missing");
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

function tryLoadFromManifestFile(manifestPath: string): string | null {
  if (!existsSync(/* turbopackIgnore: true */ manifestPath)) return null;

  let parsed: ManifestJson;
  try {
    parsed = JSON.parse(readFileSync(/* turbopackIgnore: true */ manifestPath, "utf8")) as ManifestJson;
  } catch {
    throw new Error(`[sajtmaskin] Invalid JSON: ${manifestPath}`);
  }

  const fr = parsed.fragments;
  if (!Array.isArray(fr) || fr.length === 0) return null;

  const fragmentRels = fr.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (fragmentRels.length === 0) return null;

  const sep =
    typeof parsed.fragmentSeparator === "string" ? parsed.fragmentSeparator : "\n\n";

  const key = manifestCacheKey(manifestPath, fragmentRels);
  if (cache && cache.key === key) {
    return cache.content;
  }

  const chunks: string[] = [];
  for (const rel of fragmentRels) {
    const fp = safeConfigFragmentPath(rel);
    if (fp === null) {
      throw new Error(`[sajtmaskin] Invalid fragment path in manifest: ${rel}`);
    }
    let raw: string;
    try {
      raw = readFileSync(/* turbopackIgnore: true */ fp, "utf8");
    } catch {
      throw new Error(`[sajtmaskin] Manifest fragment missing: ${rel} → ${toPosixPath(fp)}`);
    }
    chunks.push(raw.replace(/^\uFEFF/, "").trimEnd());
  }

  const text = chunks.join(sep);
  if (!text.trim()) {
    throw new Error("[sajtmaskin] Core prompt fragments produced an empty string.");
  }

  cache = { key, content: text };
  return text;
}

export function getStaticCoreFromWorkspace(): string {
  const fromCore = tryLoadFromManifestFile(getCoreManifestPath());
  if (fromCore !== null) {
    return fromCore;
  }

  throw new Error(
    `[sajtmaskin] Missing core prompt. Expected config/codegen-core-manifest.json with fragments under config/prompt-core/. Tried: ${toPosixPath(getCoreManifestPath())}`,
  );
}
