/**
 * Client-safe naming for generated Vercel projects. The deploy route
 * (`buildGeneratedVercelProjectName`) and the publish dialog's address
 * preview share it, so the dialog shows the name a first publish creates.
 */

const MAX_VERCEL_PROJECT_NAME_LENGTH = 52;
const MAX_READABLE_SEGMENT_LENGTH = 30;

/** Lowercase `[a-z0-9-]`, collapsed dashes, max 52 chars. May return "". */
export function sanitizeVercelProjectNameBase(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, MAX_VERCEL_PROJECT_NAME_LENGTH)
    .replace(/-+$/, "");
}

/** Readable part of a generated name: "Frisör i Malmö" -> "frisor-i-malmo". */
export function readableVercelNameSegment(displayName: string): string {
  return (
    displayName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_READABLE_SEGMENT_LENGTH)
      .replace(/-+$/, "") || "site"
  );
}

/** `sajtmaskin-<readable>-<suffix>`; `suffix` is the first 8 hex of sha256(projectId). */
export function generatedVercelProjectName(displayName: string, suffix: string): string {
  return sanitizeVercelProjectNameBase(
    `sajtmaskin-${readableVercelNameSegment(displayName)}-${suffix}`,
  );
}
