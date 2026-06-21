import type { CodeFile } from "@/lib/gen/parser";

/**
 * BUG-SWARM B11 — strip secret VALUES from dotenv files before a project is
 * uploaded to a PUBLIC, unauthenticated blob (the export route's
 * `put(..., { access: "public" })`). A version's files can carry a real
 * `.env.local` (pasted by the user, hallucinated by the model, or merged from
 * preview); without this it would land in a permanent public CDN zip.
 *
 * Keys, comments and structure are preserved so the export stays a usable
 * env template — only the values are dropped. Owner-scoped downloads
 * (`/download`, `/api/download`) keep full content and must NOT use this;
 * the shared `buildExportableProject` is likewise left untouched so verify /
 * quality-gate / repair lanes are unaffected.
 */

/** True for real dotenv files that may carry secrets (`.env`, `.env.local`,
 * `.env.production`, …) but NOT `*.example` templates. */
function isSecretEnvFile(path: string): boolean {
  const base = path.split("/").pop() ?? path;
  if (base.endsWith(".example")) return false;
  return base === ".env" || base.startsWith(".env.");
}

/** Drop the value from every `KEY=value` line, keeping keys, comments and
 * blank lines intact. */
function redactEnvValues(content: string): string {
  return content
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trimStart();
      if (!trimmed || trimmed.startsWith("#")) return line;
      const eq = line.indexOf("=");
      if (eq === -1) return line;
      return line.slice(0, eq + 1);
    })
    .join("\n");
}

/** Redact dotenv values in any `.env*` (non-example) file for a public export. */
export function sanitizeEnvSecretsForPublicExport(files: CodeFile[]): CodeFile[] {
  return files.map((file) =>
    typeof file.path === "string" &&
    typeof file.content === "string" &&
    isSecretEnvFile(file.path)
      ? { ...file, content: redactEnvValues(file.content) }
      : file,
  );
}
