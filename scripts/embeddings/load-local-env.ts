/**
 * Load `.env` then `.env.local` without overriding already-set process env.
 *
 * `import "dotenv/config"` only reads `.env`, so a token that lives in
 * `.env.local` (the Next.js / Backoffice source) was silently missing and
 * generate scripts fell back to the gitignored local JSON cache.
 */
import { existsSync } from "node:fs";
import { config } from "dotenv";

export function loadLocalEnv(): void {
  config();
  if (existsSync(".env.local")) {
    config({ path: ".env.local" });
  }
}
