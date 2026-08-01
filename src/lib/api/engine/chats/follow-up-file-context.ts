import { FOLLOW_UP_TUNING } from "@/lib/config";
import { FOCUS_POINT_MARKER } from "@/lib/builder/focus-point-prompt";
import { deriveFollowUpContextPolicy } from "@/lib/gen/build-spec";
import { hasHeavyCapabilities, inferCapabilities } from "@/lib/gen/capability-inference";
import {
  isEnvArtifactPath,
  maskStubEnvContentForContext,
} from "@/lib/integrations/stub-env-filter";
import {
  buildFileContext,
  isNonTextContentFile,
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

/** Explicit `Källfil: path` / `Source file: path` lines from focus-point prompts. */
const FOCUS_SOURCE_PATH_RE = new RegExp(
  `(?:Källfil|Source file)\\s*:\\s*((?:${PATH_CHAR_CLASS}+\\/)+${PATH_CHAR_CLASS}+\\.${PATH_EXTENSION})(?::\\d+)?`,
  "gi",
);

/** Arrow hints embedded in point summaries: `→ components/header.tsx:12`. */
const FOCUS_ARROW_PATH_RE = new RegExp(
  `→\\s*((?:${PATH_CHAR_CLASS}+\\/)+${PATH_CHAR_CLASS}+\\.${PATH_EXTENSION})(?::\\d+)?`,
  "gi",
);

const FOCUS_TRAFF_TEXT_RE = /Träff-text:\s*(.+)$/gim;
const FOCUS_HREF_RE = /href:\s*(\S+)/gim;

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

function collectRegexPaths(message: string, pattern: RegExp): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of message.matchAll(pattern)) {
    const normalized = normalizePath(match[1] ?? "");
    if (!normalized || !normalized.includes("/") || /^https?:/i.test(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

/**
 * Last-resort pin: when the focus block has Träff-text / href but no Källfil,
 * find the unique previousFiles entry that contains that literal string.
 * Does NOT guess from CSS selectors (e.g. the word "header").
 */
export function resolveFocusSourcePinsByLiteralSearch(
  message: string,
  previousFiles: CodeFile[],
): string[] {
  if (!message.includes(FOCUS_POINT_MARKER)) return [];
  const focusBlock = message.slice(message.indexOf(FOCUS_POINT_MARKER));
  const needles: string[] = [];
  for (const match of focusBlock.matchAll(FOCUS_TRAFF_TEXT_RE)) {
    const text = (match[1] ?? "").trim();
    if (text.length >= 2 && text.length <= 80) needles.push(text);
  }
  for (const match of focusBlock.matchAll(FOCUS_HREF_RE)) {
    const href = (match[1] ?? "").trim().replace(/[)"',\]]+$/g, "");
    if (href.length >= 2 && href.length <= 120) needles.push(href);
  }
  if (needles.length === 0) return [];

  const searchable = previousFiles.filter((file) => !isNonTextContentFile(file));
  const pinned: string[] = [];
  const seen = new Set<string>();

  for (const needle of needles) {
    const hits = searchable.filter((file) => (file.content ?? "").includes(needle));
    if (hits.length !== 1) continue;
    const path = hits[0]!.path;
    if (seen.has(path)) continue;
    seen.add(path);
    pinned.push(path);
  }
  return pinned;
}

/**
 * Source paths declared in the focus-point appendix (Källfil / → path),
 * plus literal-search fallback when the capture lacked a registry match.
 */
export function extractFocusPinnedPathsFromMessage(
  message: string,
  previousFiles: CodeFile[],
): string[] {
  if (!message || !message.includes(FOCUS_POINT_MARKER)) return [];
  // Only the focus appendix — free-form prose may contain `→ path.tsx` or
  // `Källfil:` from pasted diagnostics and must not override literal fallback.
  const focusBlock = message.slice(message.indexOf(FOCUS_POINT_MARKER));
  const previousPaths = new Set(previousFiles.map((file) => file.path));
  const fromFocus = [
    ...collectRegexPaths(focusBlock, FOCUS_SOURCE_PATH_RE),
    ...collectRegexPaths(focusBlock, FOCUS_ARROW_PATH_RE),
  ].filter((path) => previousPaths.has(path));
  // Always merge literal fallback too: a multi-point appendix can mix points
  // with Källfil and points that only have Träff-text/href.
  const fromLiteral = resolveFocusSourcePinsByLiteralSearch(message, previousFiles).filter(
    (path) => previousPaths.has(path),
  );

  return Array.from(new Set([...fromFocus, ...fromLiteral]));
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
  const focusPinnedPaths = extractFocusPinnedPathsFromMessage(
    params.message,
    params.previousFiles,
  );
  const pinnedFiles = Array.from(
    new Set([...errorReferencedPaths, ...focusPinnedPaths, ...designPinnedPaths]),
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
