import type { CodeFile } from "@/lib/gen/parser";

/**
 * BUG-SWARM B11 — strip secret VALUES from env files before a project is
 * uploaded to a PUBLIC, unauthenticated blob (the export route's
 * `put(..., { access: "public" })`).
 *
 * Primary vector is the canonical `env.example` (no leading dot,
 * `PROJECT_ENV_FILE_PATH`): it is injected into `versions.files_json` and in
 * F3 merges REAL user-panel values (`projectEnvVars`, e.g. STRIPE_SECRET_KEY)
 * via `buildProjectEnvFileContents`. A model-emitted `.env.local` can also
 * carry real keys. Without this, those land in a permanent public CDN zip.
 *
 * Keys, comments and structure are preserved so the export stays a usable env
 * template — only values are dropped. Owner-scoped downloads (`/download`,
 * `/api/download`) keep full content and must NOT use this; the shared
 * `buildExportableProject` is likewise untouched so verify / quality-gate /
 * repair lanes are unaffected.
 */

/** Env files that may carry secret values in a public export. Includes the
 * canonical project env doc `env.example` (PROJECT_ENV_FILE_PATH) and its
 * pre-rename legacy name `env.env` (older, un-regenerated version snapshots can
 * still carry it with merged F3 values), plus every `.env*` variant. We do NOT
 * exempt `*.example` — `env.example` is exactly the file that merges real F3
 * values. Being conservative is correct for a public, unauthenticated CDN blob.
 * Keep the no-dot names in sync with `project-env-file.ts`. */
function isEnvFile(path: string): boolean {
  const base = path.split("/").pop() ?? path;
  return (
    base === "env.example" ||
    base === "env.env" ||
    base === ".env" ||
    base.startsWith(".env.")
  );
}

const KEY_ASSIGN = /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=)/;

/**
 * Keep `KEY=` (value dropped), comments and blank lines; DROP every other
 * non-empty line. Dropping continuation lines is what makes this safe against
 * multiline / backslash-wrapped / quoted-across-lines values — no value text,
 * single- or multi-line, can survive.
 */
function redactEnvValues(content: string): string {
  const out: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }
    const match = line.match(KEY_ASSIGN);
    if (match) {
      out.push(match[1]);
    }
    // else: continuation / value-only line → dropped so no value text leaks
  }
  return out.join("\n");
}

/** Redact env-file values for a public, unauthenticated export blob. */
export function sanitizeEnvSecretsForPublicExport(files: CodeFile[]): CodeFile[] {
  return files.map((file) =>
    typeof file.path === "string" &&
    typeof file.content === "string" &&
    isEnvFile(file.path)
      ? { ...file, content: redactEnvValues(file.content) }
      : file,
  );
}
