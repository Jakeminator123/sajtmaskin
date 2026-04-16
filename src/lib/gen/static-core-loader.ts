import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { toPosixPath } from "@/lib/utils/path-utils";

/**
 * Own-engine static system prompt.
 *
 * **Preferred:** `config/codegen-static-prompt.json` lists Markdown fragments under
 * `config/prompt-static/*.md` (see `config/prompt-static/_READ_ME_FIRST.md`).
 *
 * **Fallback:** monolithic `config/systemprompt.md` (e.g. before re-split), or
 * `src/config/systemprompt` / `scripts/systemprompt` on older checkouts.
 * The extensionless `config/systemprompt` path is intentionally not supported — use fragments or `.md`.
 *
 * Paths are resolved once at module init to avoid Turbopack flagging repeated
 * dynamic `join(process.cwd(), ...)` as overly broad file patterns.
 */

let _cwd: string | null = null;
function getCwd(): string {
  // Avoid Turbopack treating every join(cwd, …) as a pattern over the entire project tree.
  if (!_cwd) _cwd = join(/* turbopackIgnore: true */ process.cwd());
  return _cwd;
}

function getManifestPath(): string {
  return join(/* turbopackIgnore: true */ getCwd(), "config", "codegen-static-prompt.json");
}

function getConfigDir(): string {
  return join(/* turbopackIgnore: true */ getCwd(), "config");
}

function getMonolithCandidates(): readonly string[] {
  const cwd = getCwd();
  return [
    join(/* turbopackIgnore: true */ cwd, "config", "systemprompt.md"),
    join(/* turbopackIgnore: true */ cwd, "src", "config", "systemprompt"),
    join(/* turbopackIgnore: true */ cwd, "scripts", "systemprompt"),
  ];
}

type ManifestJson = {
  fragmentSeparator?: string;
  fragments?: unknown;
};

type Cache = { key: string; content: string } | null;
let cache: Cache = null;

function safeConfigFragmentPath(rel: string): string | null {
  const normalized = rel.replace(/\\/g, "/").trim();
  if (!normalized || normalized.includes("..") || normalized.startsWith("/")) {
    return null;
  }
  return join(getConfigDir(), /* turbopackIgnore: true */ ...normalized.split("/"));
}

function manifestCacheKey(fragmentRels: string[]): string {
  const parts: string[] = [String(statSync(getManifestPath()).mtimeMs)];
  for (const rel of fragmentRels) {
    const fp = safeConfigFragmentPath(rel);
    if (fp === null) {
      parts.push("missing");
      continue;
    }
    try {
      parts.push(String(statSync(fp).mtimeMs));
    } catch {
      parts.push("missing");
    }
  }
  return parts.join("|");
}

function tryLoadFromManifest(): string | null {
  const manifestPath = getManifestPath();
  if (!existsSync(manifestPath)) return null;

  let parsed: ManifestJson;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as ManifestJson;
  } catch {
    throw new Error(`[sajtmaskin] Invalid JSON: ${manifestPath}`);
  }

  const fr = parsed.fragments;
  if (!Array.isArray(fr) || fr.length === 0) return null;

  const fragmentRels = fr.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (fragmentRels.length === 0) return null;

  const sep =
    typeof parsed.fragmentSeparator === "string" ? parsed.fragmentSeparator : "\n\n";

  const key = manifestCacheKey(fragmentRels);
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
      raw = readFileSync(fp, "utf8");
    } catch {
      throw new Error(`[sajtmaskin] Manifest fragment missing: ${rel} → ${toPosixPath(fp)}`);
    }
    chunks.push(raw.replace(/^\uFEFF/, "").trimEnd());
  }

  const text = chunks.join(sep);
  if (!text.trim()) {
    throw new Error("[sajtmaskin] Static prompt fragments produced an empty string.");
  }

  cache = { key, content: text };
  return text;
}

function tryLoadMonolith(): string | null {
  for (const candidate of getMonolithCandidates()) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      const st = statSync(candidate);
      const key = `mono|${candidate}|${st.mtimeMs}`;
      if (cache && cache.key === key) {
        return cache.content;
      }
      const raw = readFileSync(candidate, "utf8").replace(/^\uFEFF/, "");
      if (!raw.trim()) {
        throw new Error(`[sajtmaskin] Static system prompt file is empty: ${toPosixPath(candidate)}`);
      }
      cache = { key, content: raw };
      return raw;
    }
  }
  return null;
}

export function getStaticCoreFromWorkspace(): string {
  const fromManifest = tryLoadFromManifest();
  if (fromManifest !== null) {
    return fromManifest;
  }

  const fromMono = tryLoadMonolith();
  if (fromMono !== null) {
    return fromMono;
  }

  const tried = [getManifestPath(), ...getMonolithCandidates()].map(toPosixPath).join(", ");
  throw new Error(
    `[sajtmaskin] Missing static system prompt. Expected config/codegen-static-prompt.json + fragments, or a monolithic config/systemprompt.md. Tried: ${tried}`,
  );
}
