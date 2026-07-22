/**
 * Stub-placeholder filter for project env artifacts (P2 "F3
 * suggestIntegration-loop", BUG-SWARM-BACKLOG åtgärd 2).
 *
 * F2 boots generated previews with tier-3 STUB placeholder env values
 * (`config/ai_models/41-tier3-stub-placeholders.env.txt`, e.g.
 * `STRIPE_SECRET_KEY=sk_test_placeholder_preview_not_real`). Those stubs
 * end up in the version's `.env.local` / `env.example` files — and both the
 * integration detection regexes (`detect-integrations.ts`) and the codegen
 * LLM (via `## Current Project Files`) used to read them as EVIDENCE of a
 * configured integration. Prod chat `fa6515bc`: a landing page with zero
 * payment code got well-formed Stripe Checkout proposals in F3 purely from
 * env boilerplate.
 *
 * This module strips lines whose VALUE looks like a boot stub from env
 * artifact files before they feed detection or prompt context. A line with
 * a real-looking value survives — user-provided keys are genuine intent.
 *
 * Client-safe by design (no `node:fs`): the heuristics mirror the stub
 * vocabulary of the 40-/41-placeholder files instead of reading them,
 * because `detect-integrations.ts` is imported by client components
 * (builder env/dossier surfaces).
 */

/** `.env`, `.env.local`, `.env.production`, `env.example`, `.env.example`, … */
const ENV_ARTIFACT_PATH_RE = /(?:^|\/)(?:\.env(?:\.[A-Za-z0-9._-]+)?|env\.example)$/i;

export function isEnvArtifactPath(path: string): boolean {
  if (typeof path !== "string" || !path.trim()) return false;
  return ENV_ARTIFACT_PATH_RE.test(path.trim().replace(/\\/g, "/"));
}

/**
 * Stub-value vocabulary. Matches every provider-triggering value in the
 * 40-/41-placeholder files ("placeholder", "not_real", "dummy",
 * localhost/127.0.0.1, `*.local` hosts, `preview`/`changeme`/`your_*`
 * prefixes) while leaving real-looking values alone — a genuine Stripe
 * test key (`sk_test_51H…`) or a filled-in URL passes as real.
 */
const STUB_VALUE_PATTERNS: RegExp[] = [
  /placeholder/i,
  /not[_-]?a?[_-]?real/i,
  /\bdummy\b|[_-]dummy[_-]|[_-]dummy$|^dummy[_-]/i,
  /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i,
  /^https?:\/\/[^\s/]+\.local(?:$|[/:])/i,
  /^(?:preview|changeme|your[_-]|xxx+$|todo$|tbd$)/i,
];

/**
 * True when an env VALUE looks like an F2 boot stub (or is empty) rather
 * than a real, user-provided credential/URL.
 */
export function isLikelyStubEnvValue(value: string | null | undefined): boolean {
  const trimmed = typeof value === "string" ? value.trim().replace(/^["']|["']$/g, "") : "";
  if (!trimmed) return true;
  return STUB_VALUE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export interface StubEnvFilterResult {
  /** Content with stub/empty-value lines removed. */
  filtered: string;
  /** Env keys whose lines were removed (deduped, first-seen order). */
  removedKeys: string[];
}

const ENV_LINE_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

/**
 * Remove `KEY=value` lines whose value is a boot stub (or empty) from an
 * env artifact file's content. Comments, blank lines and non-assignment
 * lines are preserved; lines with real-looking values are preserved.
 */
export function filterStubEnvLines(content: string): StubEnvFilterResult {
  if (typeof content !== "string" || content.length === 0) {
    return { filtered: content ?? "", removedKeys: [] };
  }
  const removedKeys: string[] = [];
  const seenRemoved = new Set<string>();
  const keptLines: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = ENV_LINE_RE.exec(line);
    if (match && isLikelyStubEnvValue(match[2])) {
      const key = match[1];
      if (!seenRemoved.has(key)) {
        seenRemoved.add(key);
        removedKeys.push(key);
      }
      continue;
    }
    keptLines.push(line);
  }
  return { filtered: keptLines.join("\n"), removedKeys };
}

/**
 * Codex P2 (PR #383): comment lines in env artifacts (`# Stripe - secret
 * key…`, `# Email - Resend`) still name providers, and the detection
 * regexes match provider names ANYWHERE in the scanned text — so a
 * stub-only env file kept "detecting" Stripe via its comments after the
 * assignments were filtered. Detection call sites strip comments too;
 * prompt-context masking keeps them (human-readable and harmless there —
 * the context note already disclaims boilerplate).
 */
export function stripEnvCommentsForScan(content: string): string {
  if (typeof content !== "string" || content.length === 0) return content ?? "";
  return content
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

/**
 * Header line prepended to env artifacts in PROMPT context when stub lines
 * were removed, so the model knows the omission is deliberate and does not
 * treat remembered boilerplate as configured integrations.
 */
export const STUB_ENV_CONTEXT_NOTE =
  "# NOTE: F2 preview boot-stub placeholder entries omitted — placeholder env values are NOT evidence of configured or built integrations.";

/**
 * Prompt-context variant: filter stub lines and, when anything was
 * removed, prepend {@link STUB_ENV_CONTEXT_NOTE}. Used for the follow-up
 * `## Current Project Files` context only — merge/persist paths keep the
 * original file content untouched.
 */
export function maskStubEnvContentForContext(content: string): string {
  const { filtered, removedKeys } = filterStubEnvLines(content);
  if (removedKeys.length === 0) return content;
  return `${STUB_ENV_CONTEXT_NOTE}\n${filtered}`;
}
