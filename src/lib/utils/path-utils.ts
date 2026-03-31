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
 * Sanitize a project file path to prevent directory traversal attacks.
 *
 * @param p - The raw file path from user input or AI response
 * @returns The sanitized path, or null if the path is invalid/malicious
 *
 * @example
 * sanitizeProjectPath("src/app/page.tsx") // "src/app/page.tsx"
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

  // Normalize using POSIX (works consistently on all platforms)
  const normalized = path.posix.normalize(trimmed);

  // Reject if normalization reveals traversal or absolute path
  if (normalized.includes("..") || normalized.startsWith("/")) return null;

  // Reject Windows-style drive letters (e.g., "C:")
  if (/^[a-zA-Z]:/.test(normalized)) return null;

  // Reject null bytes (potential security issue)
  if (normalized.includes("\0")) return null;

  return normalized;
}

