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
 *
 * Paths are resolved once at module init to avoid Turbopack flagging repeated
 * dynamic `join(process.cwd(), ...)` as overly broad file patterns.
 */

const CWD = process.cwd();
const MANIFEST_PATH = join(CWD, "config", "codegen-static-prompt.json");
const CONFIG_DIR = join(CWD, "config");

const MONOLITH_CANDIDATES = [
  join(CWD, "config", "systemprompt.md"),
  join(CWD, "src", "config", "systemprompt"),
  join(CWD, "scripts", "systemprompt"),
] as const;

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
  return join(CONFIG_DIR, ...normalized.split("/"));
}

function manifestCacheKey(fragmentRels: string[]): string {
  const parts: string[] = [String(statSync(MANIFEST_PATH).mtimeMs)];
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
  if (!existsSync(MANIFEST_PATH)) return null;

  let parsed: ManifestJson;
  try {
    parsed = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as ManifestJson;
  } catch {
    throw new Error(`[sajtmaskin] Invalid JSON: ${MANIFEST_PATH}`);
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
      throw new Error(`[sajtmaskin] Manifest fragment missing: ${rel} → ${fp}`);
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
  for (const candidate of MONOLITH_CANDIDATES) {
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
  const fromManifest = tryLoadFromManifest();
  if (fromManifest !== null) {
    return fromManifest;
  }

  const fromMono = tryLoadMonolith();
  if (fromMono !== null) {
    return fromMono;
  }

  const tried = [MANIFEST_PATH, ...MONOLITH_CANDIDATES].join(", ");
  throw new Error(
    `[sajtmaskin] Missing static system prompt. Expected config/codegen-static-prompt.json + fragments, or a monolithic config/systemprompt.md. Tried: ${tried}`,
  );
}
