/**
 * Path Utilities
 * ==============
 *
 * Shared utilities for validating and sanitizing file paths.
 * Used to prevent directory traversal attacks in:
 * - ZIP file creation (download API)
 * - WebContainer file tree mounting
 * - OpenAI agent file operations
 */

import path from "path";

/**
 * Normalize a native OS path to forward slashes for consistent log output.
 * No-op on POSIX; replaces `\` with `/` on Windows.
 */
export function toPosixPath(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * True when a relative POSIX-style path contains an actual traversal SEGMENT
 * (`..` or `.`). Segment-based on purpose (Codex P1 on PR #396): Next.js
 * catch-all route directories (`[...slug]`, `[[...slug]]`) legitimately
 * contain the substring `..` but are literal directory names the OS never
 * resolves specially — a substring `includes("..")` check silently drops
 * those files from ZIP export, warm verification and the quality gate.
 */
export function hasTraversalSegment(p: string): boolean {
  return p
    .split("/")
    .some((segment) => segment === ".." || segment === ".");
}

/**
 * Sanitize a project file path to prevent directory traversal attacks.
 *
 * @param p - The raw file path from user input or AI response
 * @returns The sanitized path, or null if the path is invalid/malicious
 *
 * @example
 * sanitizeProjectPath("src/app/page.tsx") // "src/app/page.tsx"
 * sanitizeProjectPath("app/docs/[...slug]/page.tsx") // kept (catch-all route)
 * sanitizeProjectPath("/etc/passwd") // null (absolute path)
 * sanitizeProjectPath("../../../etc/passwd") // null (traversal)
 * sanitizeProjectPath("src/../../../etc/passwd") // null (hidden traversal)
 */
export function sanitizeProjectPath(p: string): string | null {
  if (!p || typeof p !== "string") return null;

  // Strip leading slashes (both Unix and Windows style)
  const trimmed = p.replace(/^[/\\]+/, "");

  // Reject empty after trimming
  if (!trimmed) return null;

  // Normalize using POSIX (works consistently on all platforms).
  // NOTE: normalize resolves real `../` segments; it never touches literal
  // directory names like `[...slug]`.
  const normalized = path.posix.normalize(trimmed);

  // Reject if normalization reveals traversal or absolute path
  if (hasTraversalSegment(normalized) || normalized.startsWith("/")) return null;

  // Reject Windows-style drive letters (e.g., "C:")
  if (/^[a-zA-Z]:/.test(normalized)) return null;

  // Reject null bytes (potential security issue)
  if (normalized.includes("\0")) return null;

  return normalized;
}

