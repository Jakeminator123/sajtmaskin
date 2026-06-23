/**
 * Quick-edit path guards. Edits here are explicit and user-directed (the user
 * picked the file/element), so we trust the path but still reject anything that
 * could escape the project (`isQuickEditSafePath`) or is genuinely sensitive
 * (`isBlockedQuickEditPath`: secrets and lockfiles).
 *
 * Note the deliberate split: ordinary structural/dependency config
 * (`package.json`, `*.config.*`, `tsconfig*.json`) is NOT blocked — it stays
 * editable, and the preview patch lane just routes it to a full restart instead
 * of a hot patch (see `isStructuralQuickEditPath` + preview-host runtime).
 */
export function normalizeQuickEditPath(rawPath: string): string {
  return rawPath.replace(/\\/g, "/").trim();
}

export function isQuickEditSafePath(rawPath: string): boolean {
  const path = normalizeQuickEditPath(rawPath);
  if (!path) return false;
  if (path.startsWith("/")) return false;
  if (/^[a-zA-Z]:/.test(path)) return false;
  if (path.split("/").some((segment) => segment === "..")) return false;
  return true;
}

const STRUCTURAL_EXACT = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "pnpm-lock.yml",
  "yarn.lock",
]);

/**
 * Mirrors the preview-host structural gate. Used for telemetry / response hints
 * so callers can tell when an edit will force a full preview restart rather
 * than a hot patch.
 */
export function isStructuralQuickEditPath(rawPath: string): boolean {
  const path = normalizeQuickEditPath(rawPath).toLowerCase();
  if (!path) return false;
  if (STRUCTURAL_EXACT.has(path)) return true;
  if (/^next\.config\.(?:js|cjs|mjs|ts)$/.test(path)) return true;
  if (/^tsconfig(?:\.[\w.-]+)?\.json$/.test(path)) return true;
  if (path === ".env" || path.startsWith(".env.")) return true;
  if (/^(?:postcss|tailwind)\.config\.[\w.-]+$/.test(path)) return true;
  return false;
}

/** Exact basenames that must never pass through the deterministic quick-edit lane. */
const BLOCKED_EXACT_BASENAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "pnpm-lock.yml",
  "yarn.lock",
  "credentials.json",
  "id_rsa",
]);

/** Basename suffixes for secret/credential material (private keys, certs, keystores). */
const BLOCKED_SUFFIXES = [".pem", ".key", ".p12", ".pfx"];

/**
 * Hard block for files that must never be mutated through the deterministic,
 * no-LLM quick-edit lane. Unlike structural files (which are merely routed to a
 * full preview restart), these are rejected outright: hand-patching them via
 * this path could leak or silently rewrite secrets (`.env*`, private keys and
 * certs, `credentials.json`, `id_rsa`) or break installs by editing a lockfile.
 * The user has no legitimate reason to edit them from the code view, so we fail
 * closed.
 *
 * Matching is case-insensitive on the normalized basename (last path segment),
 * so nested copies such as `config/.env.local` are caught too. Ordinary
 * editable config (`package.json`, `tsconfig*.json`, `*.config.*`) is
 * intentionally NOT matched here and stays editable.
 */
export function isBlockedQuickEditPath(rawPath: string): boolean {
  const path = normalizeQuickEditPath(rawPath).toLowerCase();
  if (!path) return false;
  const segments = path.split("/");
  const basename = segments[segments.length - 1] ?? "";
  if (!basename) return false;
  if (basename === ".env" || basename.startsWith(".env.")) return true;
  if (BLOCKED_EXACT_BASENAMES.has(basename)) return true;
  if (BLOCKED_SUFFIXES.some((suffix) => basename.endsWith(suffix))) return true;
  return false;
}
