import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getGeneratedSiteIntegrationPlaceholdersMeta,
} from "@/lib/ai-models/load-manifest";

const DEFAULT_HARMLESS_FRAGMENT = "40-harmless-placeholders.env.txt";
const DEFAULT_TIER3_STUB_FRAGMENT = "41-tier3-stub-placeholders.env.txt";

export type PlaceholderTier = "harmless" | "tier3-stub";

function safeFragmentName(name: string): string {
  if (name.includes("..") || name.startsWith("/") || name.startsWith("\\")) {
    throw new Error(
      `[sajtmaskin] generatedSiteIntegrationPlaceholders fragment must be a plain filename under config/ai_models/: got "${name}"`,
    );
  }
  return name;
}

function resolveFragmentPath(name: string, cwd: string): string {
  return join(cwd, "config", "ai_models", safeFragmentName(name));
}

/**
 * Absolute path to the harmless placeholder fragment for generated user sites.
 * Use only from Node (API routes, scripts, MCP); never import from client components.
 */
export function resolveHarmlessPlaceholdersPath(cwd: string = process.cwd()): string {
  const meta = getGeneratedSiteIntegrationPlaceholdersMeta();
  const name = meta?.harmlessEnvFragmentFile?.trim() || DEFAULT_HARMLESS_FRAGMENT;
  return resolveFragmentPath(name, cwd);
}

/** Absolute path to the tier-3 stub placeholder fragment (F2-only). */
export function resolveTier3StubPlaceholdersPath(cwd: string = process.cwd()): string {
  const meta = getGeneratedSiteIntegrationPlaceholdersMeta();
  const name = meta?.tier3StubEnvFragmentFile?.trim() || DEFAULT_TIER3_STUB_FRAGMENT;
  return resolveFragmentPath(name, cwd);
}

function readFragmentText(filePath: string): string {
  if (!existsSync(filePath)) {
    throw new Error(`[sajtmaskin] Missing generated-site placeholders file: ${filePath}`);
  }
  return readFileSync(filePath, "utf8");
}

/** Raw harmless fragment contents. */
export function readHarmlessPlaceholdersEnvText(cwd: string = process.cwd()): string {
  return readFragmentText(resolveHarmlessPlaceholdersPath(cwd));
}

/** Raw tier-3 stub fragment contents (F2-only). */
export function readTier3StubPlaceholdersEnvText(cwd: string = process.cwd()): string {
  return readFragmentText(resolveTier3StubPlaceholdersPath(cwd));
}

/**
 * Combined harmless + tier-3 stub text. Used by F2 placeholder merge and
 * by callers that need the historic single-text shape (e.g. parity tests).
 */
export function readGeneratedSitePlaceholdersEnvText(cwd: string = process.cwd()): string {
  const harmless = readHarmlessPlaceholdersEnvText(cwd);
  const tier3 = readTier3StubPlaceholdersEnvText(cwd);
  return `${harmless}\n${tier3}`;
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
