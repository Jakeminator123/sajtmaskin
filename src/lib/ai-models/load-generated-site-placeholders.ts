import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getGeneratedSiteIntegrationPlaceholdersMeta,
} from "@/lib/ai-models/load-manifest";

const DEFAULT_ENV_FRAGMENT = "40-generated-site-integration-placeholders.env.txt";

/**
 * Absolute path to the dotenv-style placeholder fragment for generated user sites.
 * Use only from Node (API routes, scripts, MCP); never import from client components.
 */
export function resolveGeneratedSitePlaceholdersPath(cwd: string = process.cwd()): string {
  const meta = getGeneratedSiteIntegrationPlaceholdersMeta();
  const name = meta?.envFragmentFile?.trim() || DEFAULT_ENV_FRAGMENT;
  if (name.includes("..") || name.startsWith("/") || name.startsWith("\\")) {
    throw new Error(
      `[sajtmaskin] generatedSiteIntegrationPlaceholders.envFragmentFile must be a plain filename under config/ai_models/: got "${name}"`,
    );
  }
  return join(cwd, "config", "ai_models", name);
}

/** Raw file contents (comments + KEY=value lines). */
export function readGeneratedSitePlaceholdersEnvText(cwd: string = process.cwd()): string {
  const fp = resolveGeneratedSitePlaceholdersPath(cwd);
  if (!existsSync(fp)) {
    throw new Error(`[sajtmaskin] Missing generated-site placeholders file: ${fp}`);
  }
  return readFileSync(fp, "utf8");
}

/** Non-comment, non-empty KEY=value lines (no export parsing). */
export function parseGeneratedSitePlaceholderLines(text: string): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    const value = t.slice(eq + 1).trim();
    if (!key) continue;
    out.push({ key, value });
  }
  return out;
}

