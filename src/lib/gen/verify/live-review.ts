/**
 * Live review (etapp 1) — critic only.
 *
 * After Product Postcheck has a live preview (no blocking runtime crash),
 * assemble a ReviewBundle and ask a multimodal model for a structured verdict.
 * Nothing here writes the user's site, sets productBlocked, or starts a generation.
 */
import { generateObject } from "ai";
import { createDirectModel } from "@/lib/builder/direct-model";
import { getServerEnv } from "@/lib/env";
import {
  getWorkloadDefaultModelFromManifest,
  getWorkloadFallbackModelsFromManifest,
} from "@/lib/ai-models/load-manifest";
import { recordLlmUsage } from "@/lib/observability/llm-usage";
import { uploadBlob } from "@/lib/vercel/blob-service";
import { extractBriefSummaryFromSnapshot } from "@/lib/gen/orchestration-snapshot";
import { parseResolvedDesignContract } from "@/lib/gen/design-contract";
import { isAutoRepairPromptMessage, isF3KickPromptMessage } from "@/lib/builder/types";
import {
  ReviewDecisionSchema,
  tryParseReviewDecision,
  type LiveReviewResult,
  type LiveReviewScreenshotSet,
  type ProductDomSummary,
  type ReviewBundle,
  type ReviewFinding,
  type LiveReviewSkipReason,
} from "./live-review-types";

export const LIVE_REVIEW_WORKLOAD_ID = "live_review";

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
} from "./live-review-types";

const BLOCKING_RUNTIME_CODES = new Set(["runtime_crash", "preview_boot_page"]);
const UNREADABLE_CODES = new Set(["preview_probe_unreadable"]);
const SENSOR_CODES = new Set([
  "console_error",
  "request_failed",
  "http_error",
  "hydration_mismatch",
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
// Fourteen resolved theme tokens plus field provenance, typography and variant
// routinely exceed the old 1,200-char cap. Keep the complete acceptance target
// in the multimodal critic bundle while remaining safely bounded.
const MAX_BRIEF_CHARS = 2400;

const SYSTEM_PROMPT = [
  "You are a critic of a generated website. You do not write or change code.",
  "Judge ONLY against: (1) the user's prompt/brief, (2) the variant's stated design direction,",
  "(3) the previous version when screenshots of it are provided, (4) concrete defects in the evidence.",
  "Never judge against what you personally think looks stylish. That is an art-director opinion and is forbidden.",
  "On a follow-up (parentVersionId is set) answer: was the request carried out, did something disappear, is there visual regression?",
  "On an init, answer: does the live page keep the user's explicit promises (light/dark, colors, requested sections) and is the page broken (stacked sections, invisible text, empty hero)?",
  "Resolved values marked explicit or locked are acceptance targets. A clearly mismatching primary, secondary, accent, surface, mode, or font may not receive pass.",
  "Do not treat Next.js overlay raw text as a user prompt.",
  "verdict: pass = keeps the promise and is not broken; micro_fix = tiny local fix; targeted_repair = specific known defect; advisory = suggestion only.",
  "In this stage every non-pass verdict is a clickable suggestion — nothing is applied automatically.",
  "Write rationale and reasoning in Swedish. Keep rationale to 1-2 sentences.",
].join(" ");

export function isLiveReviewEnabled(): boolean {
  const v = getServerEnv().SAJTMASKIN_LIVE_REVIEW?.trim().toLowerCase();
  return v === "1" || v === "true";
}

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

export function hasCurrentScreenshots(
  screenshots: LiveReviewScreenshotSet | null | undefined,
): boolean {
  return (
    isAttachableScreenshotUrl(screenshots?.desktopUrl) ||
    isAttachableScreenshotUrl(screenshots?.mobileUrl)
  );
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
  const parsedResolvedDesign = parseResolvedDesignContract(snapshot?.resolvedDesign);
  const resolvedDesign = parsedResolvedDesign
    ? (parsedResolvedDesign as unknown as Record<string, unknown>)
    : null;
  if (!brief && !resolvedDesign) return "";
  const record = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const resolvedValue = (value: unknown): unknown => record(value)?.value;
  const resolvedMeta = (value: unknown): string => {
    const entry = record(value);
    const source = typeof entry?.source === "string" ? entry.source : null;
    const locked = entry?.locked === true;
    return [source, locked ? "locked" : null].filter(Boolean).join("/");
  };
  const stringArray = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          .map((entry) => entry.trim())
      : [];
  const resolvedTokens = record(resolvedDesign?.themeTokens);
  const tokenValue = (key: string): string | null => {
    const value = resolvedValue(resolvedTokens?.[key]);
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const unresolvedAxes = new Set(stringArray(resolvedDesign?.unresolvedAxes));
  const unresolvedFields = new Set(stringArray(resolvedDesign?.unresolvedFields));
  const parts: string[] = [];
  if (brief?.projectTitle) parts.push(brief.projectTitle);
  if (brief?.brandName && brief.brandName !== brief.projectTitle) {
    parts.push(`varumärke: ${brief.brandName}`);
  }
  const resolvedStyleKeywords = stringArray(resolvedValue(resolvedDesign?.styleKeywords));
  const styleKeywords = resolvedDesign ? resolvedStyleKeywords : (brief?.styleKeywords ?? []);
  if (!unresolvedAxes.has("style") && styleKeywords.length) {
    parts.push(`stil: ${styleKeywords.slice(0, 6).join(", ")}`);
  }
  const resolvedToneKeywords = stringArray(resolvedValue(resolvedDesign?.toneAndVoice));
  const toneKeywords = resolvedDesign ? resolvedToneKeywords : (brief?.toneKeywords ?? []);
  if (!unresolvedAxes.has("tone") && toneKeywords.length) {
    parts.push(`ton: ${toneKeywords.slice(0, 4).join(", ")}`);
  }
  const explicitAxes = stringArray(resolvedDesign?.explicitAxes);
  const explicitFields = stringArray(resolvedDesign?.explicitFields);
  if (explicitAxes.length) parts.push(`explicit axes: ${explicitAxes.join(", ")}`);
  if (explicitFields.length) parts.push(`explicit fields: ${explicitFields.join(", ")}`);
  if (unresolvedAxes.size) {
    parts.push(`current request owns: ${[...unresolvedAxes].join(", ")}; ignore cached values`);
  }
  if (unresolvedFields.size) {
    parts.push(
      `current request owns fields: ${[...unresolvedFields].join(", ")}; ignore cached values and derived companions`,
    );
  }
  if (!unresolvedAxes.has("palette")) {
    const tokenLabels: Array<[string, string]> = [
      ["background", "bakgrund"],
      ["foreground", "text"],
      ["card", "kort"],
      ["cardForeground", "korttext"],
      ["primary", "primär"],
      ["primaryForeground", "primärtext"],
      ["secondary", "sekundär"],
      ["secondaryForeground", "sekundärtext"],
      ["accent", "accent"],
      ["accentForeground", "accenttext"],
      ["muted", "dämpad"],
      ["mutedForeground", "dämpad text"],
      ["border", "kant"],
      ["ring", "fokusring"],
    ];
    const tokenDelegated = (key: string): boolean => {
      if (
        unresolvedFields.has("palette.primary") &&
        ["primary", "primaryForeground", "ring"].includes(key)
      )
        return true;
      if (
        unresolvedFields.has("palette.secondary") &&
        ["secondary", "secondaryForeground"].includes(key)
      )
        return true;
      if (unresolvedFields.has("palette.accent") && ["accent", "accentForeground"].includes(key))
        return true;
      if (
        unresolvedFields.has("palette.background") &&
        ["background", "card", "cardForeground", "muted", "mutedForeground", "border"].includes(key)
      )
        return true;
      if (
        unresolvedFields.has("palette.text") &&
        [
          "foreground",
          "card",
          "cardForeground",
          "muted",
          "mutedForeground",
          "border",
          "primaryForeground",
          "secondaryForeground",
          "accentForeground",
        ].includes(key)
      )
        return true;
      return false;
    };
    const palette = resolvedDesign
      ? tokenLabels
          .map(([key, label]) => {
            if (tokenDelegated(key)) return null;
            const value = tokenValue(key);
            if (!value) return null;
            const meta = resolvedMeta(resolvedTokens?.[key]);
            return `${label} ${value}${meta ? ` [${meta}]` : ""}`;
          })
          .filter(Boolean)
      : [
          brief?.colorPalette?.background ? `bakgrund ${brief.colorPalette.background}` : null,
          brief?.colorPalette?.text ? `text ${brief.colorPalette.text}` : null,
          brief?.colorPalette?.primary ? `primär ${brief.colorPalette.primary}` : null,
          brief?.colorPalette?.secondary ? `sekundär ${brief.colorPalette.secondary}` : null,
          brief?.colorPalette?.accent ? `accent ${brief.colorPalette.accent}` : null,
        ].filter(Boolean);
    if (palette.length) parts.push(`design tokens: ${palette.join(", ")}`);
  }
  const colorMode = resolvedValue(resolvedDesign?.colorMode);
  if (!unresolvedAxes.has("color-mode") && typeof colorMode === "string" && colorMode.trim()) {
    const meta = resolvedMeta(resolvedDesign?.colorMode);
    parts.push(`färgläge: ${colorMode.trim()}${meta ? ` [${meta}]` : ""}`);
  }
  const typography = record(resolvedDesign?.typography);
  const heading = resolvedValue(typography?.heading);
  const body = resolvedValue(typography?.body);
  if (
    !unresolvedAxes.has("typography") &&
    ((!unresolvedFields.has("typography.headings") && typeof heading === "string") ||
      (!unresolvedFields.has("typography.body") && typeof body === "string"))
  ) {
    const headingMeta = resolvedMeta(typography?.heading);
    const bodyMeta = resolvedMeta(typography?.body);
    const fontParts = [
      !unresolvedFields.has("typography.headings") && typeof heading === "string"
        ? `rubrik ${heading}${headingMeta ? ` [${headingMeta}]` : ""}`
        : null,
      !unresolvedFields.has("typography.body") && typeof body === "string"
        ? `brödtext ${body}${bodyMeta ? ` [${bodyMeta}]` : ""}`
        : null,
    ].filter(Boolean);
    parts.push(`typografi: ${fontParts.join(" / ")}`);
  }
  if (brief?.requestedCapabilities?.length) {
    parts.push(`capabilities: ${brief.requestedCapabilities.slice(0, 8).join(", ")}`);
  }
  const resolvedVariantId = resolvedDesign?.variantId;
  const variantId = resolvedDesign
    ? typeof resolvedVariantId === "string" && resolvedVariantId.trim()
      ? resolvedVariantId.trim()
      : null
    : typeof snapshot?.variantId === "string" && snapshot.variantId.trim()
      ? snapshot.variantId.trim()
      : null;
  if (variantId) {
    parts.push(`variant: ${variantId}`);
  }
  return parts.join(" — ").slice(0, MAX_BRIEF_CHARS);
}

export function pickUserRequest(
  messages: ReadonlyArray<{
    role: string;
    content: string;
    ui_parts?: unknown;
    uiParts?: unknown;
  }>,
): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "user") continue;
    const uiParts = (
      Array.isArray(message.uiParts)
        ? message.uiParts
        : Array.isArray(message.ui_parts)
          ? message.ui_parts
          : []
    ) as Array<Record<string, unknown>>;
    const shaped = { role: "user" as const, content: message.content, uiParts };
    if (isAutoRepairPromptMessage(shaped) || isF3KickPromptMessage(shaped)) continue;
    const text = message.content.trim();
    if (!text) continue;
    return text.slice(0, MAX_USER_REQUEST_CHARS);
  }
  return "";
}

/**
 * Resolve the request that produced one exact version. A delayed/manual review
 * must never borrow a later tab's user turn merely because it is newest.
 */
export function pickUserRequestForVersion(
  messages: ReadonlyArray<{
    id?: string;
    role: string;
    content: string;
    ui_parts?: unknown;
    uiParts?: unknown;
  }>,
  assistantMessageId: string | null | undefined,
): string {
  const targetId = assistantMessageId?.trim();
  if (!targetId) return "";
  const assistantIndex = messages.findIndex(
    (message) => message.id === targetId && message.role === "assistant",
  );
  if (assistantIndex < 0) return "";
  return pickUserRequest(messages.slice(0, assistantIndex));
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
    parent.filter((file) => typeof file.path === "string").map((file) => [file.path, file.content]),
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
    if (finding.code === "console_error" || finding.code === "hydration_mismatch") {
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
  return uniqueModelIds([
    getWorkloadDefaultModelFromManifest(LIVE_REVIEW_WORKLOAD_ID),
    ...getWorkloadFallbackModelsFromManifest(LIVE_REVIEW_WORKLOAD_ID),
  ]);
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
>(
  versions: readonly T[],
  current: { id: string; version_number?: number | null; versionNumber?: number | null },
): T | null {
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
): Promise<{ id: string; files_json: string | null; files_revision: string | null } | null> {
  try {
    const { getVersionsByChat } = await import("@/lib/db/chat-repository-pg");
    const previous = pickPreviousVersionInChat(await getVersionsByChat(chatId), current);
    if (!previous) return null;
    return {
      id: previous.id,
      files_json: previous.files_json ?? null,
      files_revision: previous.files_revision ?? null,
    };
  } catch {
    return null;
  }
}

export async function loadChatVersionById(
  chatId: string,
  versionId: string,
): Promise<{ id: string; files_json: string | null; files_revision: string | null } | null> {
  try {
    const { getVersionById } = await import("@/lib/db/chat-repository-pg");
    const version = await getVersionById(versionId);
    if (!version || version.chat_id !== chatId) return null;
    return {
      id: version.id,
      files_json: version.files_json ?? null,
      files_revision: version.files_revision ?? null,
    };
  } catch {
    return null;
  }
}

function bundleAsPrompt(bundle: ReviewBundle): string {
  return [
    `versionId: ${bundle.versionId}`,
    `parentVersionId: ${bundle.parentVersionId ?? "(init)"}`,
    `userRequest:\n${bundle.userRequest || "(saknas)"}`,
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
    "Screenshots are attached as images when present (desktop, mobile, then previous version if any).",
  ].join("\n\n");
}

type ImagePart = { type: "image"; image: URL };

function screenshotParts(screenshots: LiveReviewScreenshotSet): ImagePart[] {
  const urls = [
    screenshots.desktopUrl,
    screenshots.mobileUrl,
    screenshots.previousDesktopUrl,
    screenshots.previousMobileUrl,
  ];
  const parts: ImagePart[] = [];
  for (const url of urls) {
    if (!isAttachableScreenshotUrl(url)) continue;
    try {
      parts.push({ type: "image", image: new URL(url as string) });
    } catch {
      // Skip a malformed URL rather than fail the review.
    }
  }
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
  const images = screenshotParts(bundle.screenshots);
  if (images.length === 0) {
    return { status: "skipped", reason: "no_screenshots" };
  }

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
    return {
      status: "skipped",
      reason: "model_unavailable",
      detail: "manifest saknar live_review-modell",
    };
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
    const { getLatestEngineVersionErrorLogForCategory } =
      await import("@/lib/db/services/version-errors");
    const row = await getLatestEngineVersionErrorLogForCategory(
      parentVersionId,
      "product_postcheck.live_review",
    );
    const meta =
      row?.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : null;
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
  /** Build-time revision paired with previousVersionId. */
  previousFilesRevision?: string | null;
  userRequest: string;
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
  if (!hasCurrentScreenshots(params.screenshots)) {
    return { status: "skipped", reason: "no_screenshots" };
  }

  let previousVersionId = params.previousVersionId ?? null;
  let parentFilesJson = params.parentFilesJson ?? null;
  let previousFilesRevision = params.previousFilesRevision?.trim() || null;
  let parentBaselineValid = true;
  if (isFollowUp && params.chatId) {
    if (previousVersionId) {
      const exactParent = await loadChatVersionById(params.chatId, previousVersionId);
      if (
        !exactParent ||
        (previousFilesRevision !== null && exactParent.files_revision !== previousFilesRevision)
      ) {
        // The parent was repaired in-place after this generation selected its
        // base (or is no longer chat-scoped). Neither its current files nor an
        // older JPEG may be used as this child's comparison baseline.
        parentFilesJson = null;
        parentBaselineValid = false;
      } else {
        parentFilesJson ??= exactParent.files_json;
        previousFilesRevision ??= exactParent.files_revision;
      }
    } else {
      const loaded = await loadPreviousChatVersion(params.chatId, {
        id: params.versionId,
        version_number: params.versionNumber ?? null,
      });
      previousVersionId = loaded?.id ?? null;
      parentFilesJson = loaded?.files_json ?? null;
      previousFilesRevision = loaded?.files_revision ?? null;
    }
  }

  const previousFromRuns =
    parentBaselineValid && params.chatId && params.versionId
      ? await import("@/lib/db/services/live-review-runs")
          .then((mod) =>
            mod.getPreviousLiveReviewScreenshots({
              chatId: params.chatId as string,
              versionId: params.versionId,
              filesRevision: params.filesRevision ?? "",
              previousVersionId,
              previousFilesRevision,
            }),
          )
          .catch(() => null)
      : parentBaselineValid
        ? null
        : { desktopUrl: null, mobileUrl: null, hasStoredRun: true };
  const previousFromLogs = previousFromRuns?.hasStoredRun
    ? {}
    : await loadPreviousLiveReviewScreenshots(previousVersionId);
  const previous = {
    previousDesktopUrl: previousFromRuns?.desktopUrl ?? previousFromLogs.previousDesktopUrl ?? null,
    previousMobileUrl: previousFromRuns?.mobileUrl ?? previousFromLogs.previousMobileUrl ?? null,
  };
  const bundle = assembleReviewBundle({
    versionId: params.versionId,
    parentVersionId: previousVersionId,
    userRequest: params.userRequest,
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
