import path from "node:path";

// ── Canonical log paths ─────────────────────────────────────────────────
export const LOGS_ROOT_DIR = path.join(process.cwd(), "logs");
export const DEV_LOG_ROLLING_PATH = path.join(LOGS_ROOT_DIR, "sajtmaskin-local.log");
export const DEV_LOG_DOC_PATH = path.join(LOGS_ROOT_DIR, "sajtmaskin-local-document.txt");

// ── Dev-log gating (shared by writer and reader) ────────────────────────
export function isDevLoggingEnabled(): boolean {
  if (process.env.SAJTMASKIN_DEV_LOG === "false") return false;
  return process.env.NODE_ENV !== "production";
}

// ── Slug normalization (shared by devLog and generation-log-writer) ─────
export function normalizeSlug(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || null;
}

// ── Sensitive key redaction ─────────────────────────────────────────────
export const SENSITIVE_KEY_PATTERN =
  /(?<!(?:input|output|prompt|completion))token|secret|password|authorization|cookie|api[-_]?key|session/i;
