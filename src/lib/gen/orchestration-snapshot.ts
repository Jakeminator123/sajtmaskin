/**
 * K-019: persist a small, sanitized orchestration record on the chat after each
 * successful version save so follow-up prompts can recover tier/contract/strategy
 * signals without duplicating the full optimized prompt.
 */
import { PROMPT_WRAPPER_HEADINGS, wrapWithSection } from "./prompt-wrapper-contract";

const SENSITIVE_KEY_SUBSTR = /pass|secret|token|auth|cookie|credential|apikey|api_key/i;
const MAX_STRING = 12_000;
const MAX_DEPTH = 8;
const MAX_KEYS = 80;

function truncateString(s: string): string {
  if (s.length <= MAX_STRING) return s;
  return `${s.slice(0, MAX_STRING)}…`;
}

export function sanitizeOrchestrationSnapshotForStorage(
  input: Record<string, unknown>,
  depth = 0,
  keyCount = { n: 0 },
): Record<string, unknown> {
  if (depth > MAX_DEPTH || keyCount.n > MAX_KEYS) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (keyCount.n > MAX_KEYS) break;
    if (SENSITIVE_KEY_SUBSTR.test(k)) continue;
    keyCount.n += 1;
    if (v === null || typeof v === "boolean" || typeof v === "number") {
      out[k] = v;
      continue;
    }
    if (typeof v === "string") {
      out[k] = truncateString(v);
      continue;
    }
    if (Array.isArray(v)) {
      const maxLen = 40;
      const slice = v.slice(0, maxLen).map((item) => {
        if (item === null || typeof item === "boolean" || typeof item === "number") return item;
        if (typeof item === "string") return truncateString(item);
        if (typeof item === "object" && item !== null && depth < MAX_DEPTH - 1) {
          return sanitizeOrchestrationSnapshotForStorage(
            item as Record<string, unknown>,
            depth + 1,
            keyCount,
          );
        }
        return "[omitted]";
      });
      out[k] = slice;
      continue;
    }
    if (typeof v === "object" && v !== null) {
      out[k] = sanitizeOrchestrationSnapshotForStorage(
        v as Record<string, unknown>,
        depth + 1,
        keyCount,
      );
    }
  }
  return out;
}

export function buildPersistedOrchestrationSnapshot(params: {
  streamMeta: Record<string, unknown>;
  versionId: string;
  chatId: string;
  buildIntent?: string | null;
}): Record<string, unknown> {
  const base = sanitizeOrchestrationSnapshotForStorage({
    ...params.streamMeta,
    lastVersionId: params.versionId,
    lastChatId: params.chatId,
    buildIntent: params.buildIntent ?? null,
    capturedAt: new Date().toISOString(),
  });
  return base;
}

function isPlainObjectRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Shallow merge: new finalize wins on key collision; keeps prior keys
 * omitted from latest stream (K-019).
 *
 * Guards against last-write-wins race: if `previous.capturedAt` is
 * newer than `next.capturedAt`, the merge is skipped and `previous`
 * is returned unchanged — a stale finalize must not overwrite a
 * newer snapshot (e.g. repair finishing after a new follow-up).
 */
export function mergePersistedOrchestrationSnapshots(
  previous: Record<string, unknown> | null | undefined,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    previous && typeof previous === "object" && !Array.isArray(previous) ? { ...previous } : {};

  const prevTime = typeof base.capturedAt === "string" ? Date.parse(base.capturedAt) : 0;
  const nextTime = typeof next.capturedAt === "string" ? Date.parse(next.capturedAt) : 0;
  if (prevTime && nextTime && prevTime > nextTime) {
    return base;
  }

  const merged = { ...base, ...next };
  const prevBuildSpec = base.buildSpec;
  const nextBuildSpec = next.buildSpec;
  if (isPlainObjectRecord(prevBuildSpec) && isPlainObjectRecord(nextBuildSpec)) {
    merged.buildSpec = { ...prevBuildSpec, ...nextBuildSpec };
  }
  return merged;
}

// ── Delta-brief helpers ───────────────────────────────────────────────────

export interface BriefSummarySnapshot {
  projectTitle?: string;
  brandName?: string;
  styleKeywords?: string[];
  toneKeywords?: string[];
  requestedCapabilities?: string[];
  domainProfile?: { domain?: string; industry?: string };
}

export function extractBriefSummaryFromSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
): BriefSummarySnapshot | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const bs = snapshot.briefSummary;
  if (!bs || typeof bs !== "object") return null;
  const s = bs as Record<string, unknown>;
  const has =
    typeof s.projectTitle === "string" ||
    typeof s.brandName === "string" ||
    (Array.isArray(s.styleKeywords) && s.styleKeywords.length > 0) ||
    (Array.isArray(s.toneKeywords) && s.toneKeywords.length > 0) ||
    (Array.isArray(s.requestedCapabilities) && s.requestedCapabilities.length > 0);
  if (!has) return null;
  const rawDomainProfile = s.domainProfile;
  const domainProfile =
    rawDomainProfile && typeof rawDomainProfile === "object"
      ? (() => {
          const d = rawDomainProfile as Record<string, unknown>;
          const domain = typeof d.domain === "string" ? d.domain : undefined;
          const industry = typeof d.industry === "string" ? d.industry : undefined;
          return domain || industry ? { domain, industry } : undefined;
        })()
      : undefined;
  return {
    projectTitle: typeof s.projectTitle === "string" ? s.projectTitle : undefined,
    brandName: typeof s.brandName === "string" ? s.brandName : undefined,
    styleKeywords: Array.isArray(s.styleKeywords) ? (s.styleKeywords as string[]) : undefined,
    toneKeywords: Array.isArray(s.toneKeywords) ? (s.toneKeywords as string[]) : undefined,
    requestedCapabilities: Array.isArray(s.requestedCapabilities)
      ? (s.requestedCapabilities as string[])
      : undefined,
    domainProfile,
  };
}

/**
 * Build a minimal brief object from snapshot for follow-ups so capability-
 * driven dossier selection (and any other consumer that reads
 * `brief.requestedCapabilities` / `brief.domainProfile`) keeps working
 * after the first generation.
 *
 * Returns `null` if the snapshot does not have a usable briefSummary.
 *
 * Bug A1+A2 (2026-04-21 LLM-flow audit): without this, every follow-up
 * gets `brief: null` → `selectDossiersForRequest` returns zero dossiers
 * → integrations the user asked for in the init prompt are silently
 * dropped on every follow-up.
 */
export function buildFollowUpBriefFromSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const summary = extractBriefSummaryFromSnapshot(snapshot);
  if (!summary) return null;
  const out: Record<string, unknown> = {};
  if (summary.requestedCapabilities && summary.requestedCapabilities.length > 0) {
    out.requestedCapabilities = summary.requestedCapabilities;
  }
  if (summary.domainProfile) out.domainProfile = summary.domainProfile;
  if (summary.projectTitle) out.projectTitle = summary.projectTitle;
  if (summary.brandName) out.brandName = summary.brandName;
  // Returning an empty object is worse than null — downstream guards
  // expect either a populated brief or no brief at all.
  if (Object.keys(out).length === 0) return null;
  return out;
}

export function formatPriorDesignContext(summary: BriefSummarySnapshot): string {
  const lines = [
    "Prior design context (preserve aspects not contradicted by the change request):",
  ];
  if (summary.projectTitle) lines.push(`- Project: ${summary.projectTitle}`);
  if (summary.brandName) lines.push(`- Brand: ${summary.brandName}`);
  if (summary.styleKeywords?.length) lines.push(`- Style: ${summary.styleKeywords.join(", ")}`);
  if (summary.toneKeywords?.length) lines.push(`- Tone: ${summary.toneKeywords.join(", ")}`);
  return lines.join("\n");
}

// ── Continuity ────────────────────────────────────────────────────────────

export function prependOrchestrationContinuityToFollowUp(
  message: string,
  snapshot: Record<string, unknown> | null | undefined,
): string {
  if (!snapshot || typeof snapshot !== "object") return message;
  const tier = typeof snapshot.modelTier === "string" ? snapshot.modelTier : null;
  const strat = typeof snapshot.promptStrategy === "string" ? snapshot.promptStrategy : null;
  const scid = typeof snapshot.scaffoldId === "string" ? snapshot.scaffoldId : null;
  const lastV = typeof snapshot.lastVersionId === "string" ? snapshot.lastVersionId : null;
  const buildIntent = typeof snapshot.buildIntent === "string" ? snapshot.buildIntent : null;
  const buildSpec =
    snapshot.buildSpec && typeof snapshot.buildSpec === "object"
      ? (snapshot.buildSpec as Record<string, unknown>)
      : null;
  const lines: string[] = [];
  if (tier) lines.push(`- Previous model tier: ${tier}`);
  if (strat) lines.push(`- Previous prompt strategy: ${strat}`);
  if (scid) lines.push(`- Previous scaffold id: ${scid}`);
  if (buildIntent) lines.push(`- Previous build intent: ${buildIntent}`);
  if (lastV) lines.push(`- Last saved version id: ${lastV}`);
  if (typeof buildSpec?.changeScope === "string") {
    lines.push(`- Previous change scope: ${buildSpec.changeScope}`);
  }
  if (typeof buildSpec?.contextPolicy === "string") {
    lines.push(`- Previous context policy: ${buildSpec.contextPolicy}`);
  }
  if (typeof buildSpec?.previewPolicy === "string") {
    lines.push(`- Previous preview policy: ${buildSpec.previewPolicy}`);
  }
  if (typeof buildSpec?.stylePack === "string") {
    lines.push(`- Previous style pack: ${buildSpec.stylePack}`);
  }
  const briefSummary =
    snapshot.briefSummary && typeof snapshot.briefSummary === "object"
      ? (snapshot.briefSummary as Record<string, unknown>)
      : null;
  if (briefSummary) {
    const parts: string[] = [];
    if (typeof briefSummary.projectTitle === "string") parts.push(briefSummary.projectTitle);
    if (typeof briefSummary.brandName === "string" && briefSummary.brandName !== briefSummary.projectTitle) {
      parts.push(`(${briefSummary.brandName})`);
    }
    if (Array.isArray(briefSummary.styleKeywords) && briefSummary.styleKeywords.length > 0) {
      parts.push(`style: ${(briefSummary.styleKeywords as string[]).slice(0, 4).join(", ")}`);
    }
    if (Array.isArray(briefSummary.toneKeywords) && briefSummary.toneKeywords.length > 0) {
      parts.push(`tone: ${(briefSummary.toneKeywords as string[]).slice(0, 3).join(", ")}`);
    }
    if (parts.length > 0) {
      lines.push(`- Original design intent: ${parts.join(" — ")}`);
    }
  }
  if (lines.length === 0) return message;
  return wrapWithSection({
    heading: PROMPT_WRAPPER_HEADINGS.continuity,
    introLines: [
      ...lines,
      "",
      "Apply the user's new request below. Do not discard previous work unless the user asks to.",
    ],
    divider: true,
    trailingBody: message,
  });
}
