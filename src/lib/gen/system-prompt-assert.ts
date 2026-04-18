/**
 * Pre-LLM assertion on the fully-composed system prompt.
 *
 * Runs after `composeEngineSystemPrompt(...)` and before `streamText(...)`.
 * Catches the kinds of corruption the user has historically been bitten by
 * BEFORE we burn tokens on a generation that was poisoned at the source:
 *
 *   - Empty or near-empty static core (loader edge cases).
 *   - Missing `SYSTEM_PROMPT_SEPARATOR` between static core and dynamic
 *     context (means `composeEngineSystemPrompt` was bypassed).
 *   - Long literal `\n` runs (4+) in the prompt body — strong signal that
 *     a JSON-double-encoded string was concatenated in somewhere.
 *   - Unbalanced triple-backtick code fences (the prompt itself uses
 *     fenced examples; an odd count means the LLM will see a half-open
 *     block and almost certainly produce malformed CodeProject output).
 *
 * By default this is a SOFT assertion: it logs warnings but does not
 * throw. Set `SAJTMASKIN_STRICT_SYSTEM_PROMPT_ASSERT=1` to make it throw,
 * for use in CI / eval where we'd rather fail loudly than ship a
 * silently-broken prompt.
 */
import { SYSTEM_PROMPT_SEPARATOR } from "@/lib/gen/system-prompt";

export type SystemPromptAssertSeverity = "warn" | "error";

export interface SystemPromptAssertIssue {
  code:
    | "empty"
    | "missing-separator"
    | "literal-newline-runs"
    | "unbalanced-code-fences"
    | "suspicious-double-backslash";
  severity: SystemPromptAssertSeverity;
  message: string;
  /** Optional offset where the issue was detected. */
  offset?: number;
}

export interface SystemPromptAssertResult {
  ok: boolean;
  issues: SystemPromptAssertIssue[];
  /** True if any issue is severity="error". */
  hasBlocker: boolean;
}

/** Minimum static-core length we consider sane. Empirically the smallest
 *  meaningful core (one tiny rule) is well above this floor; anything
 *  shorter means the loader broke. */
const MIN_STATIC_CORE_LENGTH = 200;

/** A literal `\n` (backslash + n) IS expected inside the prompt — e.g.
 *  in regex examples and code samples. But four or more in a row almost
 *  always means a JSON-encoded string was inlined verbatim. */
const SUSPICIOUS_LITERAL_NEWLINE_RUN_RE = /(?:\\n){4,}/g;

/** Same idea for `\\` runs of 4+ — that's `\\\\` minimum, which is
 *  vanishingly rare in legit prompt text. */
const SUSPICIOUS_DOUBLE_BACKSLASH_RUN_RE = /\\{4,}/g;

const TRIPLE_BACKTICK_RE = /```/g;

function countMatches(text: string, re: RegExp): number {
  let n = 0;
  for (const _m of text.matchAll(re)) n++;
  return n;
}

/**
 * Run the pre-LLM assertion. Pure / no I/O — safe to call from any
 * context (engine codegen, eval harness, fixer, planner LLM).
 */
export function assertSystemPromptShape(prompt: string): SystemPromptAssertResult {
  const issues: SystemPromptAssertIssue[] = [];

  if (!prompt || prompt.length < MIN_STATIC_CORE_LENGTH) {
    issues.push({
      code: "empty",
      severity: "error",
      message: `System prompt is suspiciously short (${prompt?.length ?? 0} chars). Static core loader likely failed.`,
    });
  }

  const sepIdx = prompt.indexOf(SYSTEM_PROMPT_SEPARATOR);
  if (sepIdx === -1) {
    issues.push({
      code: "missing-separator",
      severity: "error",
      message:
        "System prompt is missing SYSTEM_PROMPT_SEPARATOR. composeEngineSystemPrompt() was bypassed or the static core was emitted without the separator.",
    });
  }

  for (const match of prompt.matchAll(SUSPICIOUS_LITERAL_NEWLINE_RUN_RE)) {
    issues.push({
      code: "literal-newline-runs",
      severity: "warn",
      message: `Found ${match[0].length / 2} consecutive literal "\\n" sequences — likely JSON-double-encoded content was concatenated into the prompt.`,
      offset: match.index ?? 0,
    });
    // First hit is enough to flag; don't spam telemetry.
    break;
  }

  for (const match of prompt.matchAll(SUSPICIOUS_DOUBLE_BACKSLASH_RUN_RE)) {
    issues.push({
      code: "suspicious-double-backslash",
      severity: "warn",
      message: `Found ${match[0].length} consecutive backslashes — likely escape inflation from a previous JSON round-trip.`,
      offset: match.index ?? 0,
    });
    break;
  }

  const fences = countMatches(prompt, TRIPLE_BACKTICK_RE);
  if (fences % 2 !== 0) {
    issues.push({
      code: "unbalanced-code-fences",
      severity: "warn",
      message: `Odd number of triple-backtick fences (${fences}). LLM will see a half-open fenced block and may emit malformed CodeProject output.`,
    });
  }

  const hasBlocker = issues.some((i) => i.severity === "error");
  return { ok: issues.length === 0, issues, hasBlocker };
}

/**
 * Convenience wrapper: log all issues to the console with a stable prefix.
 * Always logs blockers as `console.error`, warnings as `console.warn`.
 *
 * If `SAJTMASKIN_STRICT_SYSTEM_PROMPT_ASSERT=1` is set, throws on any
 * blocker so eval/CI fails loud.
 */
export function logAndMaybeThrowOnSystemPromptAssert(
  result: SystemPromptAssertResult,
  context: { chatId?: string; phase?: string } = {},
): void {
  if (result.ok) return;
  const tag = `[system-prompt-assert${context.phase ? `:${context.phase}` : ""}]`;
  for (const issue of result.issues) {
    const fn = issue.severity === "error" ? console.error : console.warn;
    fn(
      `${tag} ${issue.code}: ${issue.message}${context.chatId ? ` (chat=${context.chatId})` : ""}`,
    );
  }
  if (
    result.hasBlocker &&
    process.env.SAJTMASKIN_STRICT_SYSTEM_PROMPT_ASSERT === "1"
  ) {
    const blockers = result.issues
      .filter((i) => i.severity === "error")
      .map((i) => `${i.code}: ${i.message}`)
      .join("; ");
    throw new Error(`${tag} blocking issues: ${blockers}`);
  }
}
