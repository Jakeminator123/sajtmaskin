/**
 * Load `.env` then `.env.local`.
 *
 * `.env.local` overrides `.env` (Next.js / Backoffice source of truth) so a
 * placeholder or empty `BLOB_READ_WRITE_TOKEN` in `.env` cannot hide the real
 * token. Already-set process env from the parent (CI, Streamlit) is then
 * replaced by `.env.local` when that file exists — the operator file wins.
 *
 * `import "dotenv/config"` only reads `.env` and is not enough.
 */
import { existsSync } from "node:fs";
import { config } from "dotenv";

export function dotenvLoadSpec(
  fileExists: (path: string) => boolean = existsSync,
): { path?: string; override: boolean }[] {
  const spec: { path?: string; override: boolean }[] = [{ override: false }];
  if (fileExists(".env.local")) {
    spec.push({ path: ".env.local", override: true });
  }
  return spec;
}

export function loadLocalEnv(): void {
  for (const entry of dotenvLoadSpec()) {
    config({ ...entry, quiet: true });
  }
}
