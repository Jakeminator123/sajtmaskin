const MAX_PATH_LENGTH = 200;
// Next.js App Router route conventions REQUIRE bracket/paren/at characters in
// file paths: dynamic segments `[slug]`, catch-alls `[...slug]` /
// `[[...slug]]`, route groups `(marketing)` and parallel slots `@modal`.
// The old charset rejected them, and `sanitizeFilePath` then silently
// stripped the brackets — `app/blog/[slug]/page.tsx` became
// `app/blog/slug/page.tsx`, turning every dynamic route in generated sites
// into a static 404 (prod chat 7826fcda, blog scaffold). Traversal safety
// does NOT come from this charset — it comes from the segment checks below
// (no `.`/`..` segments, no backslashes, no `:` drive letters, allowed
// root prefixes).
const VALID_CHARS_RE = /^[a-zA-Z0-9\-_./[\]()@]+$/;

const ALLOWED_ROOT_PREFIXES = [
  "app/",
  "src/",
  "components/",
  "lib/",
  "public/",
  "hooks/",
  "styles/",
  "utils/",
  "types/",
  "config/",
  "data/",
];

const BLOCKED_SEGMENTS = [
  "node_modules",
  ".env",
  ".git",
  ".next",
];

/**
 * True when a path segment is an actual filesystem traversal token. Note the
 * distinction from a SUBSTRING check: catch-all route segments (`[...slug]`,
 * `[[...slug]]`) legitimately contain `..` but are literal directory names,
 * never traversal. Only the exact segments `.` and `..` (what the OS resolves
 * specially) are dangerous.
 */
function isTraversalSegment(segment: string): boolean {
  return segment === "." || segment === "..";
}

export function validateFilePath(filePath: string): { valid: boolean; reason?: string } {
  if (!filePath || filePath.trim().length === 0) {
    return { valid: false, reason: "Empty path" };
  }

  if (filePath.length > MAX_PATH_LENGTH) {
    return { valid: false, reason: `Path exceeds ${MAX_PATH_LENGTH} characters` };
  }

  if (!VALID_CHARS_RE.test(filePath)) {
    return { valid: false, reason: "Path contains invalid characters" };
  }

  const segments = filePath.split("/");

  if (segments.some(isTraversalSegment)) {
    return { valid: false, reason: "Path traversal (..) not allowed" };
  }

  const normalized = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  const isNested = normalized.includes("/");
  if (isNested) {
    const isAllowed = ALLOWED_ROOT_PREFIXES.some((p) => normalized.startsWith(p));
    if (!isAllowed) {
      return { valid: false, reason: "Path outside allowed directories" };
    }
  }

  for (const seg of segments) {
    for (const blocked of BLOCKED_SEGMENTS) {
      if (seg === blocked || seg.startsWith(blocked)) {
        return { valid: false, reason: `Blocked path segment: ${blocked}` };
      }
    }
  }

  return { valid: true };
}

export function sanitizeFilePath(filePath: string): string {
  let cleaned = filePath.replace(/[^a-zA-Z0-9\-_./[\]()@]/g, "");

  // Remove traversal SEGMENTS (`.` / `..`) rather than stripping every `..`
  // substring — a substring strip would corrupt catch-all route segments
  // (`[...slug]` → `[.slug]`).
  cleaned = cleaned
    .split("/")
    .filter((segment) => !isTraversalSegment(segment))
    .join("/");

  cleaned = cleaned.replace(/\/+/g, "/");

  if (cleaned.startsWith("/")) {
    cleaned = cleaned.slice(1);
  }

  if (cleaned.length > MAX_PATH_LENGTH) {
    cleaned = cleaned.slice(0, MAX_PATH_LENGTH);
  }

  return cleaned || "unnamed-file.txt";
}
