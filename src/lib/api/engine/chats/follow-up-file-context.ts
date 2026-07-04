import { FOLLOW_UP_TUNING } from "@/lib/config";
import { deriveFollowUpContextPolicy } from "@/lib/gen/build-spec";
import { hasHeavyCapabilities, inferCapabilities } from "@/lib/gen/capability-inference";
import {
  isEnvArtifactPath,
  maskStubEnvContentForContext,
} from "@/lib/integrations/stub-env-filter";
import {
  buildFileContext,
  type FileContext,
} from "@/lib/gen/context/file-context-builder";
import type { FollowUpIntentMode } from "@/lib/gen/follow-up-intent-types";
import type { CodeFile } from "@/lib/gen/parser";
import { hasDesignFollowUpSignal } from "@/lib/providers/own-engine/follow-up-clarification";

/**
 * File-path patterns emitted by typecheck/preflight/eslint/build error text
 * that auto-repair follow-ups inline in the user-turn prompt.
 *
 * Matched shapes (from real repair prompts):
 *   components/three-canvas-shell.tsx(11,23): error TS2304 ...
 *   ./app/page.tsx:12:5  or  app/page.tsx:12
 *   src/lib/foo.ts — Cannot find name 'dynamic'
 *
 * The extraction is intentionally narrow: only file-looking tokens with a
 * recognised source extension (.ts/.tsx/.js/.jsx/.css/.md) and a plausible
 * directory prefix survive. Anything that can't be reconciled against the
 * previous-files list is dropped by `buildFollowUpFileContextDecision`.
 */
const PATH_EXTENSION = "(?:ts|tsx|js|jsx|mjs|cjs|css|scss|json|md)";
const PATH_CHAR_CLASS = "[A-Za-z0-9_.\\-/@]";
const PATH_EXTRACT_RE = new RegExp(
  `(?:^|[\\s\`'"(\\[])(?:\\.\\/)?((?:${PATH_CHAR_CLASS}+\\/)+${PATH_CHAR_CLASS}+\\.${PATH_EXTENSION})(?=$|[\\s:,;)\\]'"\`(])`,
  "gi",
);

function normalizePath(raw: string): string {
  return raw
    .replace(/^\.\//, "")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .trim();
}

/**
 * Extract file paths referenced in an error/preflight/typecheck-style prompt
 * message. Returns paths in first-seen order, deduplicated. Paths are
 * normalized (leading `./` stripped, backslashes to forward slashes) so they
 * can be matched against `previousFiles` entries.
 */
export function extractReferencedFilePathsFromMessage(message: string): string[] {
  if (!message) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of message.matchAll(PATH_EXTRACT_RE)) {
    const normalized = normalizePath(match[1] ?? "");
    if (!normalized) continue;
    // Skip URLs (https://foo.com/...) that accidentally match the file regex.
    if (/^https?:/i.test(normalized)) continue;
    // Must have at least one slash (a directory component) — bare filenames
    // like "package.json" emitted in prose aren't actionable targets here.
    if (!normalized.includes("/")) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export interface FollowUpFileContextDecision {
  fileContext: FileContext;
  contextPolicy: "light" | "normal" | "heavy";
  useLightContext: boolean;
  maxChars: number;
  maxFilesWithContent: number;
  pinnedFiles: string[];
}

export function buildFollowUpFileContextDecision(params: {
  message: string;
  previousFiles: CodeFile[];
  followUpIntent: FollowUpIntentMode;
  skipIntentClassification?: boolean;
}): FollowUpFileContextDecision {
  const inferredCapabilities = inferCapabilities(params.message);
  const capabilityHeavy = hasHeavyCapabilities(inferredCapabilities);
  const contextPolicy = deriveFollowUpContextPolicy({
    prompt: params.message,
    skipIntentClassification: params.skipIntentClassification ?? false,
    followUpIntent: params.followUpIntent,
    capabilityHeavy,
  });
  const useLightContext = contextPolicy === "light";
  const manyFiles = params.previousFiles.length > 14;
  const previousPaths = new Set(params.previousFiles.map((file) => file.path));
  // Repair/auto-fix prompts cite the failing file path inline (e.g.
  // `components/three-canvas-shell.tsx(11,23): error TS2304 ...`). Pin those
  // so the LLM sees the full target file content, not just app/page.tsx.
  // We only pin paths that actually exist in the previous-files list so
  // typos or stale references don't crowd out real files.
  const errorReferencedPaths = extractReferencedFilePathsFromMessage(params.message)
    .filter((path) => previousPaths.has(path));
  const designPinnedPaths = hasDesignFollowUpSignal(params.message)
    ? ["app/globals.css", "app/layout.tsx"].filter((path) => previousPaths.has(path))
    : [];
  const pinnedFiles = Array.from(
    new Set([...errorReferencedPaths, ...designPinnedPaths]),
  );
  const maxChars = useLightContext
    ? FOLLOW_UP_TUNING.lightContextMaxChars
    : FOLLOW_UP_TUNING.normalContextMaxChars;
  const maxFilesWithContent = useLightContext
    ? manyFiles
      ? FOLLOW_UP_TUNING.lightContextMaxFilesManyFiles
      : FOLLOW_UP_TUNING.lightContextMaxFilesFewFiles
    : FOLLOW_UP_TUNING.normalContextMaxFiles;

  // P2 F3-loop (åtgärd 2): mask tier-3 boot-stub placeholder lines in env
  // artifacts (.env.local / env.example) for the PROMPT context only — the
  // model used to read `STRIPE_SECRET_KEY=sk_test_placeholder…` as evidence
  // of an existing Stripe integration and re-proposed it in F3 (prod chat
  // fa6515bc). The real `previousFiles` (merge base / persisted output) are
  // untouched; only what the LLM sees in `## Current Project Files` changes.
  const contextFiles = params.previousFiles.map((file) =>
    isEnvArtifactPath(file.path)
      ? { ...file, content: maskStubEnvContentForContext(file.content ?? "") }
      : file,
  );

  return {
    fileContext: buildFileContext({
      files: contextFiles,
      maxChars,
      includeContents: true,
      maxFilesWithContent,
      pinnedFiles,
      includeStructuralInventory: true,
    }),
    contextPolicy,
    useLightContext,
    maxChars,
    maxFilesWithContent,
    pinnedFiles,
  };
}
