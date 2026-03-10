const MAX_PATH_LENGTH = 200;
const VALID_CHARS_RE = /^[a-zA-Z0-9\-_./]+$/;

const ALLOWED_ROOT_PREFIXES = [
  "app/",
  "components/",
  "lib/",
  "public/",
  "hooks/",
  "styles/",
];

const BLOCKED_SEGMENTS = [
  "node_modules",
  ".env",
  ".git",
  ".next",
];

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

  if (filePath.includes("..")) {
    return { valid: false, reason: "Path traversal (..) not allowed" };
  }

  if (filePath.startsWith("/")) {
    const withoutSlash = filePath.slice(1);
    const isAllowed = ALLOWED_ROOT_PREFIXES.some((p) => withoutSlash.startsWith(p));
    if (!isAllowed) {
      return { valid: false, reason: "Absolute path outside allowed directories" };
    }
  }

  const segments = filePath.split("/");
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
  let cleaned = filePath.replace(/[^a-zA-Z0-9\-_./]/g, "");

  while (cleaned.includes("..")) {
    cleaned = cleaned.replace(/\.\./g, "");
  }

  cleaned = cleaned.replace(/\/+/g, "/");

  if (cleaned.startsWith("/")) {
    cleaned = cleaned.slice(1);
  }

  if (cleaned.length > MAX_PATH_LENGTH) {
    cleaned = cleaned.slice(0, MAX_PATH_LENGTH);
  }

  return cleaned || "unnamed-file.txt";
}
