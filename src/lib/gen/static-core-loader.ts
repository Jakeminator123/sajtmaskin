import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Own-engine static system prompt.
 *
 * **Preferred:** `config/codegen-static-prompt.json` lists Markdown fragments under
 * `config/prompt-static/*.md` (see `config/prompt-static/_READ_ME_FIRST.md`).
 *
 * **Fallback:** monolithic `config/systemprompt.md` (e.g. before re-split), or
 * `src/config/systemprompt` / `scripts/systemprompt` on older checkouts.
 * The extensionless `config/systemprompt` path is intentionally not supported — use fragments or `.md`.
 */
const MANIFEST_SEGMENTS = ["config", "codegen-static-prompt.json"] as const;

const MONOLITH_CANDIDATES = [
  ["config", "systemprompt.md"],
  ["src", "config", "systemprompt"],
  ["scripts", "systemprompt"],
] as const;

type ManifestJson = {
  fragmentSeparator?: string;
  fragments?: unknown;
};

type Cache = { key: string; content: string } | null;
let cache: Cache = null;

function safeConfigFragmentPath(cwd: string, rel: string): string | null {
  const normalized = rel.replace(/\\/g, "/").trim();
  if (!normalized || normalized.includes("..") || normalized.startsWith("/")) {
    return null;
  }
  return join(cwd, "config", ...normalized.split("/"));
}

function manifestCacheKey(cwd: string, manifestPath: string, fragmentRels: string[]): string {
  const parts: string[] = [String(statSync(manifestPath).mtimeMs)];
  for (const rel of fragmentRels) {
    const fp = safeConfigFragmentPath(cwd, rel);
    if (!fp || !existsSync(fp)) {
      parts.push("missing");
      continue;
    }
    parts.push(String(statSync(fp).mtimeMs));
  }
  return parts.join("|");
}

function tryLoadFromManifest(cwd: string): string | null {
  const manifestPath = join(cwd, ...MANIFEST_SEGMENTS);
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

  const key = manifestCacheKey(cwd, manifestPath, fragmentRels);
  if (cache && cache.key === key) {
    return cache.content;
  }

  const chunks: string[] = [];
  for (const rel of fragmentRels) {
    const fp = safeConfigFragmentPath(cwd, rel);
    if (!fp) {
      throw new Error(`[sajtmaskin] Invalid fragment path in manifest: ${rel}`);
    }
    if (!existsSync(fp)) {
      throw new Error(`[sajtmaskin] Manifest fragment missing: ${rel} → ${fp}`);
    }
    chunks.push(readFileSync(fp, "utf8").replace(/^\uFEFF/, "").trimEnd());
  }

  const text = chunks.join(sep);
  if (!text.trim()) {
    throw new Error("[sajtmaskin] Static prompt fragments produced an empty string.");
  }

  cache = { key, content: text };
  return text;
}

function tryLoadMonolith(cwd: string): string | null {
  for (const segments of MONOLITH_CANDIDATES) {
    const candidate = join(cwd, ...segments);
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      const st = statSync(candidate);
      const key = `mono|${candidate}|${st.mtimeMs}`;
      if (cache && cache.key === key) {
        return cache.content;
      }
      const raw = readFileSync(candidate, "utf8").replace(/^\uFEFF/, "");
      if (!raw.trim()) {
        throw new Error(`[sajtmaskin] Static system prompt file is empty: ${candidate}`);
      }
      cache = { key, content: raw };
      return raw;
    }
  }
  return null;
}

export function getStaticCoreFromWorkspace(): string {
  const cwd = process.cwd();

  const fromManifest = tryLoadFromManifest(cwd);
  if (fromManifest !== null) {
    return fromManifest;
  }

  const fromMono = tryLoadMonolith(cwd);
  if (fromMono !== null) {
    return fromMono;
  }

  const tried = [
    join(cwd, ...MANIFEST_SEGMENTS),
    ...MONOLITH_CANDIDATES.map((s) => join(cwd, ...s)),
  ].join(", ");
  throw new Error(
    `[sajtmaskin] Missing static system prompt. Expected config/codegen-static-prompt.json + fragments, or a monolithic config/systemprompt.md. Tried: ${tried}`,
  );
}

