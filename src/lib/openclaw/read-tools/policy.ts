import {
  isBlockedQuickEditPath,
  isQuickEditSafePath,
  normalizeQuickEditPath,
} from "@/lib/gen/quick-edit/guards";

export const OPENCLAW_READ_SESSION_MAX_TTL_MS = 60_000;
export const OPENCLAW_READ_MAX_PROJECT_FILES = 500;
export const OPENCLAW_READ_MAX_PROJECT_CHARS = 12_000_000;
export const OPENCLAW_READ_MAX_RAW_SNAPSHOT_CHARS = 24_000_000;
export const OPENCLAW_READ_MAX_LANGUAGE_CHARS = 40;
export const OPENCLAW_READ_MAX_FILE_CHARS = 20_000;
export const OPENCLAW_READ_MAX_FILE_LINES = 250;
export const OPENCLAW_READ_MAX_SEARCH_SCAN_CHARS = 1_000_000;
export const OPENCLAW_READ_MAX_SEARCH_LINE_CHARS = 600;

export type OpenClawReadBudgetPolicy = {
  maxCalls: number;
  maxOutputChars: number;
  maxSearchMatches: number;
  maxListedFiles: number;
};

export const DEFAULT_OPENCLAW_READ_BUDGET: Readonly<OpenClawReadBudgetPolicy> = {
  maxCalls: 12,
  maxOutputChars: 80_000,
  maxSearchMatches: 80,
  maxListedFiles: 400,
};

export type OpenClawReadBudgetState = {
  callsRemaining: number;
  outputCharsRemaining: number;
  searchMatchesRemaining: number;
  listedFilesRemaining: number;
};

const EXTRA_SENSITIVE_BASENAMES = new Set([
  ".npmrc",
  ".yarnrc",
  ".yarnrc.yml",
  ".netrc",
  "service-account.json",
  "service_account.json",
]);
const EXTRA_SENSITIVE_SUFFIXES = [".jks", ".keystore"];

export function normalizeOpenClawReadPath(rawPath: string): string | null {
  const path = normalizeQuickEditPath(rawPath);
  if (!path || path.length > 200 || !isQuickEditSafePath(path)) return null;
  if (path.includes("\u0000")) return null;
  if (path.split("/").some((segment) => segment === "." || !segment)) return null;
  return path;
}

export function normalizeOpenClawReadPrefix(rawPrefix: string | undefined): string | null {
  const prefix = normalizeQuickEditPath(rawPrefix ?? "");
  if (!prefix) return "";
  const normalized = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return normalizeOpenClawReadPath(normalized);
}

export function isSensitiveOpenClawReadPath(rawPath: string): boolean {
  const path = normalizeQuickEditPath(rawPath).toLowerCase();
  if (!path) return true;
  if (isBlockedQuickEditPath(path)) return true;
  const basename = path.split("/").at(-1) ?? "";
  if (EXTRA_SENSITIVE_BASENAMES.has(basename)) return true;
  if (EXTRA_SENSITIVE_SUFFIXES.some((suffix) => basename.endsWith(suffix))) return true;
  if (/(?:^|[-_.])(?:secret|credentials?)(?:[-_.]|$)/i.test(basename)) return true;
  return false;
}

export function createOpenClawReadBudget(
  policy: OpenClawReadBudgetPolicy = DEFAULT_OPENCLAW_READ_BUDGET,
): OpenClawReadBudgetState {
  return {
    callsRemaining: Math.max(0, Math.floor(policy.maxCalls)),
    outputCharsRemaining: Math.max(0, Math.floor(policy.maxOutputChars)),
    searchMatchesRemaining: Math.max(0, Math.floor(policy.maxSearchMatches)),
    listedFilesRemaining: Math.max(0, Math.floor(policy.maxListedFiles)),
  };
}

export function consumeOpenClawReadCall(state: OpenClawReadBudgetState): boolean {
  if (state.callsRemaining < 1) return false;
  state.callsRemaining -= 1;
  return true;
}

export function consumeOpenClawReadOutput(
  state: OpenClawReadBudgetState,
  params: { outputChars: number; searchMatches?: number; listedFiles?: number },
): boolean {
  const outputChars = Math.max(0, Math.ceil(params.outputChars));
  const searchMatches = Math.max(0, Math.ceil(params.searchMatches ?? 0));
  const listedFiles = Math.max(0, Math.ceil(params.listedFiles ?? 0));
  if (
    outputChars > state.outputCharsRemaining ||
    searchMatches > state.searchMatchesRemaining ||
    listedFiles > state.listedFilesRemaining
  ) {
    return false;
  }
  state.outputCharsRemaining -= outputChars;
  state.searchMatchesRemaining -= searchMatches;
  state.listedFilesRemaining -= listedFiles;
  return true;
}

export function clampOpenClawReadSessionTtl(ttlMs: number | undefined): number {
  if (!Number.isFinite(ttlMs)) return OPENCLAW_READ_SESSION_MAX_TTL_MS;
  return Math.max(1, Math.min(Math.floor(ttlMs!), OPENCLAW_READ_SESSION_MAX_TTL_MS));
}
