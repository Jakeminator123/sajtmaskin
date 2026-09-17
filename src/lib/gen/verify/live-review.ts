/**
 * Live review (etapp 1) — critic only.
 *
 * After Product Postcheck has a live preview (no blocking runtime crash),
 * assemble a ReviewBundle and ask a multimodal model for a structured verdict.
 * Nothing here writes the user's site, sets productBlocked, or starts a generation.
 */
import { generateObject } from "ai";
import { createDirectModel } from "@/lib/builder/direct-model";
import {
  getAiModelsManifest,
  getWorkloadDefaultModelFromManifest,
  getWorkloadFallbackModelsFromManifest,
} from "@/lib/ai-models/load-manifest";
import { recordLlmUsage } from "@/lib/observability/llm-usage";
import { uploadBlob } from "@/lib/vercel/blob-service";
import { extractBriefSummaryFromSnapshot } from "@/lib/gen/orchestration-snapshot";
import { isAutoRepairPromptMessage, isF3KickPromptMessage } from "@/lib/builder/types";
import { isLiveReviewEnabled } from "@/lib/openclaw/live-review-access";
import {
  ReviewDecisionSchema,
  tryParseReviewDecision,
  type LiveReviewResult,
  type LiveReviewScreenshotSet,
  type ProductDomSummary,
  type ReviewBundle,
  type ReviewFinding,
  type LiveReviewSkipReason,
  type UserRequestPinSource,
} from "./live-review-types";

export const LIVE_REVIEW_WORKLOAD_ID = "live_review";

export { isLiveReviewEnabled } from "@/lib/openclaw/live-review-access";

export {
  ReviewVerdictSchema,
  ReviewIssueSchema,
  ReviewDecisionSchema,
  parseReviewDecision,
  SAFE_FALLBACK_DECISION,
} from "./live-review-types";
export type {
  ReviewVerdict,
  ReviewIssue,
  ReviewDecision,
  LiveReviewScreenshotSet,
  ProductDomSummary,
  ReviewFinding,
  ReviewBundle,
  LiveReviewSkipReason,
  LiveReviewResult,
  UserRequestPinSource,
} from "./live-review-types";

const BLOCKING_RUNTIME_CODES = new Set(["runtime_crash", "preview_boot_page"]);
const UNREADABLE_CODES = new Set(["preview_probe_unreadable"]);
const SENSOR_CODES = new Set([
  "console_error",
  "request_failed",
  "http_error",
  "hydration_mismatch",
  "hydration_dom_loss",
  "broken_anchor",
  "broken_image",
  "cta_no_handler",
  "mobile_menu_failed",
  "fake_form",
  "runtime_crash",
]);

/**
 * Per model attempt. `generateObject` uses `maxRetries: 0` so this budget is
 * not split with an SDK retry. The default+fallback chain shares
 * `LIVE_REVIEW_TOTAL_TIMEOUT_MS` — remaining wall time caps each attempt.
 */
export const LIVE_REVIEW_ATTEMPT_TIMEOUT_MS = 45_000;
/** Wall-clock cap for the whole default + fallback chain. */
export const LIVE_REVIEW_TOTAL_TIMEOUT_MS = 90_000;
const MAX_OUTPUT_TOKENS = 1200;
const MAX_USER_REQUEST_CHARS = 4000;
const MAX_BRIEF_CHARS = 1200;

const SYSTEM_PROMPT = [
  "You are a critic of a generated website. You do not write or change code.",
  "Judge ONLY against: (1) the user's prompt/brief, (2) the variant's stated design direction,",
  "(3) the previous version when screenshots of it are provided, (4) concrete defects in the evidence.",
  "Never judge against what you personally think looks stylish. That is an art-director opinion and is forbidden.",
  "On a follow-up (parentVersionId is set) answer: was the request carried out, did something disappear, is there visual regression?",
  "On an init, answer: does the live page keep the user's explicit promises (light/dark, colors, requested sections) and is the page broken (stacked sections, invisible text, empty hero)?",
  "Do not treat Next.js overlay raw text as a user prompt.",
  "verdict: pass = keeps the promise and is not broken; micro_fix = tiny local fix; targeted_repair = specific known defect; advisory = suggestion only.",
  "In this stage every non-pass verdict is a clickable suggestion — nothing is applied automatically.",
  "Write rationale and reasoning in Swedish. Keep rationale to 1-2 sentences.",
  "Do not repeat the rationale inside reasoning. Leave reasoning empty when it would only restate the rationale; use it only for extra evidence.",
].join(" ");

export function hasBlockingRuntimeCrash(findings: readonly ReviewFinding[]): boolean {
  return findings.some((finding) => BLOCKING_RUNTIME_CODES.has(finding.code));
}

export function hasUnreadablePreview(findings: readonly ReviewFinding[]): boolean {
  return findings.some((finding) => UNREADABLE_CODES.has(finding.code));
}

export function sensorsAlarmed(findings: readonly ReviewFinding[]): boolean {
  return findings.some((finding) => SENSOR_CODES.has(finding.code));
}

/**
 * F2 follow-ups increment `engine_versions.version_number`.
 * `parent_version_id` is only set on F3 forks — do not use it as the
 * init-vs-follow-up signal.
 */
export function isChatFollowUpVersion(versionNumber: number | null | undefined): boolean {
  return typeof versionNumber === "number" && Number.isFinite(versionNumber) && versionNumber > 1;
}

/** Only http(s) URLs can become multimodal image parts. Relative fallbacks do not count. */
export function isAttachableScreenshotUrl(url: string | null | undefined): boolean {
  if (typeof url !== "string" || !url.trim()) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export type ScreenshotViewportCoverage = {
  hasDesktop: boolean;
  hasMobile: boolean;
  complete: boolean;
};

/** Per-viewport attachability. `complete` is both current viewports, not "any". */
export function screenshotViewportCoverage(
  screenshots: LiveReviewScreenshotSet | null | undefined,
): ScreenshotViewportCoverage {
  const hasDesktop = isAttachableScreenshotUrl(screenshots?.desktopUrl);
  const hasMobile = isAttachableScreenshotUrl(screenshots?.mobileUrl);
  return { hasDesktop, hasMobile, complete: hasDesktop && hasMobile };
}

export function describeScreenshotCoverage(
  screenshots: LiveReviewScreenshotSet | null | undefined,
): "desktop+mobile" | "desktop_only" | "mobile_only" | "none" {
  const { hasDesktop, hasMobile } = screenshotViewportCoverage(screenshots);
  if (hasDesktop && hasMobile) return "desktop+mobile";
  if (hasDesktop) return "desktop_only";
  if (hasMobile) return "mobile_only";
  return "none";
}

/** True when at least one current viewport can be attached. Not "both exist". */
export function hasCurrentScreenshots(
  screenshots: LiveReviewScreenshotSet | null | undefined,
): boolean {
  const coverage = screenshotViewportCoverage(screenshots);
  return coverage.hasDesktop || coverage.hasMobile;
}

export function shouldRunLiveReview(params: {
  enabled?: boolean;
  skipped: boolean;
  findings: readonly ReviewFinding[];
  isFollowUp: boolean;
}): { run: boolean; reason?: LiveReviewSkipReason } {
  if (!(params.enabled ?? isLiveReviewEnabled())) {
    return { run: false, reason: "flag_off" };
  }
  if (params.skipped) return { run: false, reason: "postcheck_skipped" };
  if (hasBlockingRuntimeCrash(params.findings)) {
    const boot = params.findings.some((finding) => finding.code === "preview_boot_page");
    return { run: false, reason: boot ? "preview_not_ready" : "runtime_crash" };
  }
  if (hasUnreadablePreview(params.findings)) {
    return { run: false, reason: "preview_unreadable" };
  }
  if (params.isFollowUp && !sensorsAlarmed(params.findings)) {
    return { run: false, reason: "followup_no_sensor" };
  }
  return { run: true };
}

function sanitizePathSegment(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .replace(/[\\/]+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  return sanitized || fallback;
}

export function liveReviewJpegFilename(params: {
  viewport: "desktop" | "mobile";
  versionId: string;
  filesRevision?: string | null;
}): string {
  const revision = sanitizePathSegment(params.filesRevision || params.versionId, "revision");
  return `live-review-${params.viewport}-${revision}.jpg`;
}

export async function persistLiveReviewJpeg(params: {
  buffer: Buffer;
  chatId: string;
  versionId: string;
  viewport: "desktop" | "mobile";
  userId?: string;
  filesRevision?: string | null;
}): Promise<string | null> {
  try {
    const uploaded = await uploadBlob({
      userId: sanitizePathSegment(params.userId || `user-${params.chatId}`, "user"),
      filename: liveReviewJpegFilename(params),
      buffer: params.buffer,
      contentType: "image/jpeg",
      projectId: sanitizePathSegment(params.chatId, "chat"),
      category: "media",
    });
    return uploaded?.url ?? null;
  } catch (error) {
    console.warn(
      "[live-review] screenshot persist failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export function summarizeBrief(snapshot: Record<string, unknown> | null | undefined): string {
  const brief = extractBriefSummaryFromSnapshot(snapshot);
  if (!brief) return "";
  const parts: string[] = [];
  if (brief.projectTitle) parts.push(brief.projectTitle);
  if (brief.brandName && brief.brandName !== brief.projectTitle) {
    parts.push(`varumärke: ${brief.brandName}`);
  }
  if (brief.styleKeywords?.length) {
    parts.push(`stil: ${brief.styleKeywords.slice(0, 6).join(", ")}`);
  }
  if (brief.toneKeywords?.length) {
    parts.push(`ton: ${brief.toneKeywords.slice(0, 4).join(", ")}`);
  }
  if (brief.colorPalette?.background || brief.colorPalette?.primary) {
    const palette = [
      brief.colorPalette.background ? `bakgrund ${brief.colorPalette.background}` : null,
      brief.colorPalette.primary ? `primär ${brief.colorPalette.primary}` : null,
      brief.colorPalette.text ? `text ${brief.colorPalette.text}` : null,
    ].filter(Boolean);
    if (palette.length) parts.push(palette.join(", "));
  }
  if (brief.requestedCapabilities?.length) {
    parts.push(`capabilities: ${brief.requestedCapabilities.slice(0, 8).join(", ")}`);
  }
  if (typeof snapshot?.variantId === "string" && snapshot.variantId.trim()) {
    parts.push(`variant: ${snapshot.variantId.trim()}`);
  }
  return parts.join(" — ").slice(0, MAX_BRIEF_CHARS);
}

export type LiveReviewUserMessage = {
  id?: string;
  role: string;
  content: string;
  created_at?: string | Date | null;
  createdAt?: string | Date | null;
  ui_parts?: unknown;
  uiParts?: unknown;
};

export type ResolvedUserRequest = {
  text: string;
  source: UserRequestPinSource;
  reason?: string;
};

function parseTimestampMs(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function extractRealUserRequest(message: LiveReviewUserMessage | undefined): string | null {
  if (!message || message.role !== "user") return null;
  const uiParts = (Array.isArray(message.uiParts)
    ? message.uiParts
    : Array.isArray(message.ui_parts)
      ? message.ui_parts
      : []) as Array<Record<string, unknown>>;
  const shaped = { role: "user" as const, content: message.content, uiParts };
  if (isAutoRepairPromptMessage(shaped) || isF3KickPromptMessage(shaped)) return null;
  const text = message.content.trim();
  if (!text) return null;
  return text.slice(0, MAX_USER_REQUEST_CHARS);
}

function findUserRequestPinnedToMessage(
  messages: readonly LiveReviewUserMessage[],
  messageId: string,
): string | null {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index < 0) return null;
  const atPin = extractRealUserRequest(messages[index]);
  if (atPin) return atPin;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const text = extractRealUserRequest(messages[cursor]);
    if (text) return text;
  }
  return null;
}

function findUserRequestAtOrBefore(
  messages: readonly LiveReviewUserMessage[],
  versionCreatedAt: string | Date | null | undefined,
): string | null {
  const versionMs = parseTimestampMs(versionCreatedAt);
  if (versionMs == null) return null;
  let pinned: string | null = null;
  for (const message of messages) {
    const text = extractRealUserRequest(message);
    if (!text) continue;
    const messageMs = parseTimestampMs(message.created_at ?? message.createdAt);
    if (messageMs == null || messageMs > versionMs) continue;
    pinned = text;
  }
  return pinned;
}

/** Latest real user prompt in the list. Unpinned — do not use for a versioned review. */
export function pickUserRequest(messages: readonly LiveReviewUserMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const text = extractRealUserRequest(messages[index]);
    if (text) return text;
  }
  return "";
}

/**
 * Pin `userRequest` to the user turn that produced `versionId`.
 * Prefer `version.message_id` (assistant row, or the user row itself), then
 * the last real user prompt at or before `version.created_at`. Latest-user is
 * only a last resort and is logged so the guess is never silent.
 */
export function resolveUserRequestForVersion(params: {
  messages: readonly LiveReviewUserMessage[];
  versionMessageId?: string | null;
  versionCreatedAt?: string | Date | null;
  versionId?: string | null;
}): ResolvedUserRequest {
  const messageId = params.versionMessageId?.trim() || "";
  if (messageId) {
    const pinned = findUserRequestPinnedToMessage(params.messages, messageId);
    if (pinned) return { text: pinned, source: "version_message_id" };
  }

  const byTime = findUserRequestAtOrBefore(params.messages, params.versionCreatedAt);
  if (byTime) return { text: byTime, source: "version_created_at" };

  const fallback = pickUserRequest(params.messages);
  if (!fallback) return { text: "", source: "empty", reason: "no_user_prompt" };

  const reason = messageId
    ? "version_message_id_unresolved"
    : params.versionCreatedAt
      ? "version_created_at_unresolved"
      : "missing_version_pin";
  console.warn("[live-review] userRequest fallback to latest user prompt", {
    versionId: params.versionId ?? null,
    reason,
  });
  return { text: fallback, source: "latest_user_fallback", reason };
}

function parseStoredCodeFiles(
  filesJson: string | null | undefined,
): Array<{ path?: string; content?: string }> {
  if (!filesJson) return [];
  try {
    const parsed = JSON.parse(filesJson) as unknown;
    return Array.isArray(parsed) ? (parsed as Array<{ path?: string; content?: string }>) : [];
  } catch {
    return [];
  }
}

export function listChangedFiles(
  filesJson: string | null | undefined,
  parentFilesJson?: string | null,
): string[] {
  const current = parseStoredCodeFiles(filesJson ?? "[]");
  const currentPaths = current
    .map((file) => file.path)
    .filter((path): path is string => typeof path === "string" && path.length > 0);
  if (!parentFilesJson) return currentPaths.slice(0, 80);
  const parent = parseStoredCodeFiles(parentFilesJson);
  const parentMap = new Map(
    parent
      .filter((file) => typeof file.path === "string")
      .map((file) => [file.path, file.content]),
  );
  const changed: string[] = [];
  for (const file of current) {
    if (typeof file.path !== "string") continue;
    const previous = parentMap.get(file.path);
    if (previous === undefined) changed.push(`+ ${file.path}`);
    else if (previous !== file.content) changed.push(`~ ${file.path}`);
    parentMap.delete(file.path);
  }
  for (const path of parentMap.keys()) changed.push(`- ${path}`);
  return changed.slice(0, 80);
}

function splitFindings(findings: readonly ReviewFinding[]): {
  consoleErrors: string[];
  nextOverlayErrors: string[];
  failedRequests: string[];
} {
  const consoleErrors: string[] = [];
  const nextOverlayErrors: string[] = [];
  const failedRequests: string[] = [];
  for (const finding of findings) {
    if (
      finding.code === "console_error" ||
      finding.code === "hydration_mismatch" ||
      finding.code === "hydration_dom_loss"
    ) {
      consoleErrors.push(finding.message);
    } else if (finding.code === "request_failed" || finding.code === "http_error") {
      failedRequests.push(finding.message);
    }
    if (/överlägg|overlay|script tag while rendering/i.test(finding.message)) {
      nextOverlayErrors.push(finding.message);
    }
  }
  return { consoleErrors, nextOverlayErrors, failedRequests };
}

export function assembleReviewBundle(params: {
  versionId: string;
  parentVersionId: string | null;
  userRequest: string;
  userRequestSource?: UserRequestPinSource;
  briefSummary: string;
  changedFiles: string[];
  screenshots: LiveReviewScreenshotSet;
  findings: readonly ReviewFinding[];
  domSummary: ProductDomSummary | null;
}): ReviewBundle {
  const split = splitFindings(params.findings);
  return {
    versionId: params.versionId,
    parentVersionId: params.parentVersionId,
    userRequest: params.userRequest,
    userRequestSource: params.userRequestSource,
    briefSummary: params.briefSummary,
    changedFiles: params.changedFiles,
    screenshots: params.screenshots,
    consoleErrors: split.consoleErrors,
    nextOverlayErrors: split.nextOverlayErrors,
    failedRequests: split.failedRequests,
    findings: [...params.findings],
    domSummary: params.domSummary,
  };
}

function uniqueModelIds(ids: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const trimmed = id?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function resolveLiveReviewModelIds(override?: string): string[] {
  if (override?.trim()) return [override.trim()];
  let defaultModel = getWorkloadDefaultModelFromManifest(LIVE_REVIEW_WORKLOAD_ID);
  let fallbacks = [...getWorkloadFallbackModelsFromManifest(LIVE_REVIEW_WORKLOAD_ID)];
  let visionModels: string[] = [];
  try {
    const workload = getAiModelsManifest().workloads.find(
      (entry) => entry.id === LIVE_REVIEW_WORKLOAD_ID,
    );
    if (workload) {
      defaultModel = workload.defaultModel ?? defaultModel;
      if (workload.fallbackModels?.length) fallbacks = [...workload.fallbackModels];
      visionModels = workload.visionModels ?? [];
    }
  } catch {
    // Test mocks may omit getAiModelsManifest; fall back to the two getters.
  }
  const ordered = uniqueModelIds([defaultModel, ...fallbacks]);
  if (visionModels.length === 0) return ordered;
  const allowed = new Set(visionModels);
  const visionOnly = ordered.filter((id) => allowed.has(id));
  return visionOnly.length > 0 ? visionOnly : ordered;
}

export function versionOrdinal(version: {
  version_number?: number | null;
  versionNumber?: number | null;
}): number | null {
  const value = version.version_number ?? version.versionNumber;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Latest earlier version in the same chat — not `parent_version_id` (F3-only). */
export function pickPreviousVersionInChat<
  T extends { id: string; version_number?: number | null; versionNumber?: number | null },
>(versions: readonly T[], current: { id: string; version_number?: number | null; versionNumber?: number | null }): T | null {
  const fromList = versions.find((row) => row.id === current.id);
  const currentNum = versionOrdinal(current) ?? (fromList ? versionOrdinal(fromList) : null);
  if (currentNum == null) return null;
  let best: T | null = null;
  let bestNum = Number.NEGATIVE_INFINITY;
  for (const row of versions) {
    if (row.id === current.id) continue;
    const num = versionOrdinal(row);
    if (num == null || num >= currentNum) continue;
    if (num > bestNum) {
      best = row;
      bestNum = num;
    }
  }
  return best;
}

export async function loadPreviousChatVersion(
  chatId: string,
  current: { id: string; version_number?: number | null; versionNumber?: number | null },
): Promise<{ id: string; files_json: string | null } | null> {
  try {
    const { getVersionsByChat } = await import("@/lib/db/chat-repository-pg");
    const previous = pickPreviousVersionInChat(await getVersionsByChat(chatId), current);
    if (!previous) return null;
    return { id: previous.id, files_json: previous.files_json ?? null };
  } catch {
    return null;
  }
}

function bundleAsPrompt(bundle: ReviewBundle): string {
  const coverage = describeScreenshotCoverage(bundle.screenshots);
  return [
    `versionId: ${bundle.versionId}`,
    `parentVersionId: ${bundle.parentVersionId ?? "(init)"}`,
    `userRequest:\n${bundle.userRequest || "(saknas)"}`,
    `userRequestSource: ${bundle.userRequestSource ?? "unspecified"}`,
    `briefSummary:\n${bundle.briefSummary || "(saknas)"}`,
    `changedFiles: ${bundle.changedFiles.join(", ") || "(inga)"}`,
    `consoleErrors: ${bundle.consoleErrors.join(" | ") || "(inga)"}`,
    `nextOverlayErrors: ${bundle.nextOverlayErrors.join(" | ") || "(inga)"}`,
    `failedRequests: ${bundle.failedRequests.join(" | ") || "(inga)"}`,
    `postcheckFindings: ${
      bundle.findings.map((finding) => `${finding.code}: ${finding.message}`).join(" | ") ||
      "(inga)"
    }`,
    `domSummary: ${bundle.domSummary ? JSON.stringify(bundle.domSummary) : "(saknas)"}`,
    `screenshotCoverage: ${coverage}${
      coverage === "desktop+mobile" ? "" : " — incomplete; do not treat this as both viewports"
    }`,
    "Each attached image is labeled in the following parts. A missing current viewport is stated in text — never infer it from another shot.",
  ].join("\n\n");
}

type ReviewContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: URL };

function pushLabeledImage(
  parts: ReviewContentPart[],
  label: string,
  url: string | null | undefined,
): boolean {
  if (!isAttachableScreenshotUrl(url)) return false;
  try {
    parts.push({ type: "text", text: label });
    parts.push({ type: "image", image: new URL(url as string) });
    return true;
  } catch {
    return false;
  }
}

/** Labeled image parts so a lone mobile shot is never presented as desktop. */
export function reviewScreenshotContentParts(
  screenshots: LiveReviewScreenshotSet,
): ReviewContentPart[] {
  const parts: ReviewContentPart[] = [];
  const coverage = screenshotViewportCoverage(screenshots);
  if (
    !pushLabeledImage(parts, "Current desktop screenshot:", screenshots.desktopUrl) &&
    !coverage.hasDesktop
  ) {
    parts.push({
      type: "text",
      text: "Current desktop screenshot: MISSING. Do not treat any other attached image as the desktop viewport.",
    });
  }
  if (
    !pushLabeledImage(parts, "Current mobile screenshot:", screenshots.mobileUrl) &&
    !coverage.hasMobile
  ) {
    parts.push({
      type: "text",
      text: "Current mobile screenshot: MISSING. Do not treat any other attached image as the mobile viewport.",
    });
  }
  pushLabeledImage(
    parts,
    "Previous version desktop screenshot:",
    screenshots.previousDesktopUrl,
  );
  pushLabeledImage(
    parts,
    "Previous version mobile screenshot:",
    screenshots.previousMobileUrl,
  );
  return parts;
}

function recordReviewUsage(params: {
  modelId: string;
  usage: unknown;
  durationMs: number;
  ok: boolean;
  errorCode?: string | null;
}): void {
  recordLlmUsage({
    phase: "qa",
    workload: LIVE_REVIEW_WORKLOAD_ID,
    model: params.modelId,
    usage: params.usage,
    durationMs: params.durationMs,
    ok: params.ok,
    errorCode: params.errorCode ?? null,
  });
}

async function reviewWithModel(
  bundle: ReviewBundle,
  modelId: string,
  timeoutMs: number,
): Promise<LiveReviewResult> {
  if (!hasCurrentScreenshots(bundle.screenshots)) {
    return { status: "skipped", reason: "no_screenshots" };
  }
  const images = reviewScreenshotContentParts(bundle.screenshots);

  let model;
  try {
    model = createDirectModel(modelId);
  } catch (error) {
    recordReviewUsage({
      modelId,
      usage: null,
      durationMs: 0,
      ok: false,
      errorCode: "model_unavailable",
    });
    return {
      status: "skipped",
      reason: "model_unavailable",
      detail: error instanceof Error ? error.message : "kunde inte skapa modell",
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    // Zod optional/default fields (target, suggestedOperation, reasoning, issues)
    // omit keys from JSON-schema `required`. OpenAI strict structured outputs
    // then 400 before the model runs — prod 2026-08-23 Missing 'target', same
    // class as SIMPLIFIED_SCHEMA_PROVIDER_OPTIONS in site-brief-generation
    // (prod 2026-07-27 Missing 'bullets'). Server still parses via
    // tryParseReviewDecision, so tolerant transport is the safe setting.
    const result = await generateObject({
      model,
      schema: ReviewDecisionSchema,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: bundleAsPrompt(bundle) }, ...images],
        },
      ],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      maxRetries: 0,
      abortSignal: controller.signal,
      providerOptions: { openai: { strictJsonSchema: false } },
    });
    const decision = tryParseReviewDecision(result.object);
    if (!decision) {
      recordReviewUsage({
        modelId,
        usage: result.usage,
        durationMs: Date.now() - startedAt,
        ok: false,
        errorCode: "invalid_model_output",
      });
      return { status: "skipped", reason: "invalid_model_output" };
    }
    recordReviewUsage({
      modelId,
      usage: result.usage,
      durationMs: Date.now() - startedAt,
      ok: true,
    });
    return {
      status: "completed",
      decision,
      durationMs: Date.now() - startedAt,
      modelId,
    };
  } catch (error) {
    const usage =
      error && typeof error === "object" && "usage" in error
        ? (error as { usage?: unknown }).usage
        : null;
    recordReviewUsage({
      modelId,
      usage: usage && typeof usage === "object" ? usage : null,
      durationMs: Date.now() - startedAt,
      ok: false,
      errorCode: "review_error",
    });
    return {
      status: "skipped",
      reason: "review_error",
      detail: error instanceof Error ? error.message : "live review failed",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function runLiveReview(
  bundle: ReviewBundle,
  opts: { timeoutMs?: number; totalTimeoutMs?: number; modelId?: string } = {},
): Promise<LiveReviewResult> {
  const modelIds = resolveLiveReviewModelIds(opts.modelId);
  if (modelIds.length === 0) {
    return { status: "skipped", reason: "model_unavailable", detail: "manifest saknar live_review-modell" };
  }

  const chainStartedAt = Date.now();
  const totalTimeoutMs = opts.totalTimeoutMs ?? LIVE_REVIEW_TOTAL_TIMEOUT_MS;
  const perAttemptMs = opts.timeoutMs ?? LIVE_REVIEW_ATTEMPT_TIMEOUT_MS;
  let last: LiveReviewResult = {
    status: "skipped",
    reason: "model_unavailable",
    detail: "manifest saknar live_review-modell",
  };

  for (const modelId of modelIds) {
    const remaining = totalTimeoutMs - (Date.now() - chainStartedAt);
    if (remaining <= 0) {
      return { status: "skipped", reason: "review_error", detail: "total review timeout" };
    }
    last = await reviewWithModel(bundle, modelId, Math.min(perAttemptMs, remaining));
    if (last.status === "completed") return last;
    if (
      last.status === "skipped" &&
      (last.reason === "invalid_model_output" || last.reason === "no_screenshots")
    ) {
      return last;
    }
  }
  return last;
}

export async function loadPreviousLiveReviewScreenshots(
  parentVersionId: string | null,
): Promise<Pick<LiveReviewScreenshotSet, "previousDesktopUrl" | "previousMobileUrl">> {
  if (!parentVersionId) return {};
  try {
    const { getLatestEngineVersionErrorLogForCategory } = await import(
      "@/lib/db/services/version-errors"
    );
    const row = await getLatestEngineVersionErrorLogForCategory(
      parentVersionId,
      "product_postcheck.live_review",
    );
    const meta = row?.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : null;
    const screenshots =
      meta?.screenshots && typeof meta.screenshots === "object"
        ? (meta.screenshots as Record<string, unknown>)
        : meta;
    const previousDesktopUrl =
      typeof screenshots?.desktopUrl === "string" ? screenshots.desktopUrl : null;
    const previousMobileUrl =
      typeof screenshots?.mobileUrl === "string" ? screenshots.mobileUrl : null;
    return { previousDesktopUrl, previousMobileUrl };
  } catch {
    return {};
  }
}

export async function maybeAttachLiveReview(params: {
  skipped: boolean;
  findings: readonly ReviewFinding[];
  screenshots: LiveReviewScreenshotSet | null | undefined;
  domSummary: ProductDomSummary | null | undefined;
  versionId: string;
  chatId?: string;
  versionNumber?: number | null;
  previousVersionId?: string | null;
  filesJson: string | null | undefined;
  parentFilesJson?: string | null;
  userRequest: string;
  userRequestSource?: UserRequestPinSource;
  briefSummary: string;
  enabled?: boolean;
  filesRevision?: string | null;
}): Promise<LiveReviewResult> {
  const isFollowUp =
    isChatFollowUpVersion(params.versionNumber) || Boolean(params.previousVersionId);
  const gate = shouldRunLiveReview({
    enabled: params.enabled,
    skipped: params.skipped,
    findings: params.findings,
    isFollowUp,
  });
  if (!gate.run) {
    return { status: "skipped", reason: gate.reason ?? "flag_off" };
  }
  const coverage = screenshotViewportCoverage(params.screenshots);
  if (!coverage.hasDesktop && !coverage.hasMobile) {
    return { status: "skipped", reason: "no_screenshots" };
  }
  if (!coverage.hasDesktop) {
    console.warn("[live-review] desktop screenshot missing; continuing as incomplete viewport set", {
      versionId: params.versionId,
      coverage: describeScreenshotCoverage(params.screenshots),
    });
  }

  let previousVersionId = params.previousVersionId ?? null;
  let parentFilesJson = params.parentFilesJson ?? null;
  if (isFollowUp && params.chatId && (!previousVersionId || parentFilesJson == null)) {
    const loaded = await loadPreviousChatVersion(params.chatId, {
      id: params.versionId,
      version_number: params.versionNumber ?? null,
    });
    previousVersionId = previousVersionId ?? loaded?.id ?? null;
    parentFilesJson = parentFilesJson ?? loaded?.files_json ?? null;
  }

  const previousFromRuns =
    params.chatId && params.versionId
      ? await import("@/lib/db/services/live-review-runs")
          .then((mod) =>
            mod.getPreviousLiveReviewScreenshots({
              chatId: params.chatId as string,
              versionId: params.versionId,
              filesRevision: params.filesRevision ?? "",
            }),
          )
          .catch(() => null)
      : null;
  const previousFromLogs = await loadPreviousLiveReviewScreenshots(previousVersionId);
  const previous = {
    previousDesktopUrl:
      previousFromRuns?.desktopUrl ?? previousFromLogs.previousDesktopUrl ?? null,
    previousMobileUrl:
      previousFromRuns?.mobileUrl ?? previousFromLogs.previousMobileUrl ?? null,
  };
  const bundle = assembleReviewBundle({
    versionId: params.versionId,
    parentVersionId: previousVersionId,
    userRequest: params.userRequest,
    userRequestSource: params.userRequestSource,
    briefSummary: params.briefSummary,
    changedFiles: listChangedFiles(params.filesJson, parentFilesJson),
    screenshots: {
      desktopUrl: params.screenshots?.desktopUrl ?? null,
      mobileUrl: params.screenshots?.mobileUrl ?? null,
      ...previous,
    },
    findings: params.findings,
    domSummary: params.domSummary ?? null,
  });

  try {
    return await runLiveReview(bundle);
  } catch (error) {
    return {
      status: "skipped",
      reason: "review_error",
      detail: error instanceof Error ? error.message : "live review failed",
    };
  }
}
