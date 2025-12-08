/**
 * Password hashing utilities
 *
 * Extracted to avoid circular dependencies between auth.ts and database.ts.
 * Using crypto module to avoid native dependency issues with bcrypt on Windows.
 */

import crypto from "crypto";

/**
 * Hash a password using PBKDF2
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a hash
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;

  const verifyHash = crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha512")
    .toString("hex");
  return hash === verifyHash;
}
