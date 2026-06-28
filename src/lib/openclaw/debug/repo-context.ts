/**
 * Read-only Sajtmaskin repo context for OpenClaw debug-mode.
 *
 * Lets OpenClaw read Sajtmaskin's OWN source (not the generated user project) so
 * it can reason about WHERE the platform itself is buggy — exactly the kind of
 * root-cause analysis this feature's förundersökning did by hand (media-token
 * leak, Clerk verbatim middleware, etc.).
 *
 * HARD GUARD: this module is strictly READ-ONLY. It exposes only GET helpers
 * against the GitHub contents API using `OC_REPO_READ_TOKEN` (which must carry
 * only `contents:read`). There is NO write/commit/PR path here — OpenClaw can
 * understand the platform but can never modify it.
 *
 * Only consulted when `OPENCLAW.debugEnabled` is true (callers check).
 */

import { OPENCLAW } from "@/lib/config";

const GITHUB_API = "https://api.github.com";
const MAX_FILE_BYTES = 60_000;
const FETCH_TIMEOUT_MS = 8_000;

/**
 * Curated default files that most often explain Sajtmaskin platform bugs — a
 * sensible starting set when the user asks "where does Sajtmaskin itself break?"
 * without naming a file. Aligned with the two known pipeline gaps.
 */
export const DEFAULT_REPO_CONTEXT_PATHS: readonly string[] = [
  "src/lib/gen/url-compress.ts",
  "data/dossiers/hard/clerk-auth/components/middleware.ts",
  "src/lib/gen/dossiers/verbatim-policy.ts",
  "src/lib/gen/verify/quality-gate-checks.ts",
] as const;

export function isRepoContextConfigured(): boolean {
  return Boolean(OPENCLAW.repoReadToken && OPENCLAW.repoSlug);
}

function encodeRepoPath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/**
 * Fetch a single file's raw text from the configured Sajtmaskin repo (read-only).
 * Returns null when not configured, on any HTTP/timeout error, or for binary/
 * oversized content. Never throws.
 */
export async function fetchRepoFile(
  path: string,
  ref = "HEAD",
): Promise<string | null> {
  if (!isRepoContextConfigured()) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;

  const url = `${GITHUB_API}/repos/${OPENCLAW.repoSlug}/contents/${encodeRepoPath(
    trimmed,
  )}?ref=${encodeURIComponent(ref)}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        // raw media type returns file content directly (not base64-wrapped JSON)
        Accept: "application/vnd.github.raw+json",
        Authorization: `Bearer ${OPENCLAW.repoReadToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    if (text.length > MAX_FILE_BYTES) {
      return `${text.slice(0, MAX_FILE_BYTES)}\n… (truncated at ${MAX_FILE_BYTES} bytes)`;
    }
    return text;
  } catch {
    return null;
  }
}

export interface RepoContextFile {
  path: string;
  content: string;
}

/** Fetch several repo files (read-only), dropping any that fail. */
export async function fetchRepoFiles(
  paths: string[],
  ref = "HEAD",
): Promise<RepoContextFile[]> {
  if (!isRepoContextConfigured() || paths.length === 0) return [];
  const unique = Array.from(new Set(paths.map((p) => p.trim()).filter(Boolean)));
  const settled = await Promise.all(
    unique.map(async (path) => {
      const content = await fetchRepoFile(path, ref);
      return content ? { path, content } : null;
    }),
  );
  return settled.filter((entry): entry is RepoContextFile => entry !== null);
}

/**
 * Build a `[SAJTMASKIN-KÄLLKOD]` context block from read-only repo files for
 * injection into the OpenClaw system context in debug-mode. Returns null when
 * not configured or nothing could be fetched.
 */
export async function buildOpenClawRepoContextBlock(
  paths: string[] = [...DEFAULT_REPO_CONTEXT_PATHS],
  ref = "HEAD",
): Promise<string | null> {
  const files = await fetchRepoFiles(paths, ref);
  if (files.length === 0) return null;
  const parts: string[] = [
    "[SAJTMASKIN-KÄLLKOD — read-only utdrag ur plattformens egen kod, för rotorsaksanalys. Du kan INTE ändra denna kod.]",
  ];
  for (const file of files) {
    parts.push(`--- ${file.path} ---\n${file.content}`);
  }
  parts.push("[/SAJTMASKIN-KÄLLKOD]");
  return parts.join("\n\n");
}
