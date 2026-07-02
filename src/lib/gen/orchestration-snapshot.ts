/**
 * K-019: persist a small, sanitized orchestration record on the chat after each
 * successful version save so follow-up prompts can recover tier/contract/strategy
 * signals without duplicating the full optimized prompt.
 */
import type { BuildSpecQualityTarget } from "./build-spec";
import { PROMPT_WRAPPER_HEADINGS, wrapWithSection } from "./prompt-wrapper-contract";

const SENSITIVE_KEY_SUBSTR = /pass|secret|token|auth|cookie|credential|apikey|api_key/i;
const MAX_STRING = 12_000;
const MAX_DEPTH = 8;
const MAX_KEYS = 80;
const PROTECTED_TOP_LEVEL_KEYS = [
  "variantId",
  "scaffoldId",
  "lineageHash",
  "versionId",
  "chatId",
] as const;
const PROTECTED_TOP_LEVEL_KEY_SET = new Set<string>(PROTECTED_TOP_LEVEL_KEYS as readonly string[]);

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
  // Keep stable top-level identity fields even when large nested payloads
  // (for example buildSpec/integrations) consume the key budget.
  if (depth === 0) {
    for (const key of PROTECTED_TOP_LEVEL_KEYS) {
      if (!(key in input)) continue;
      const value = input[key];
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        out[key] = value;
      }
    }
  }
  if (keyCount.n > MAX_KEYS) return out;
  for (const [k, v] of Object.entries(input)) {
    if (depth === 0 && PROTECTED_TOP_LEVEL_KEY_SET.has(k)) continue;
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
  // Protect stable identity fields from null-overwrites in later finalize
  // passes that lost these values during sanitization.
  if (typeof base.variantId === "string" && next.variantId === null) {
    merged.variantId = base.variantId;
  }
  if (typeof base.scaffoldId === "string" && next.scaffoldId === null) {
    merged.scaffoldId = base.scaffoldId;
  }
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
  qualityBar?: string;
  motionLevel?: string;
  /** Primary CTA from the init brief (M#818-1 — persisted since day one, but never rehydrated before). */
  primaryCTA?: string;
  /** Seasonal/campaign hints from the init brief (M#818-1). */
  seasonalHints?: string[];
  colorPalette?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    text?: string;
  };
  typography?: {
    headings?: string;
    body?: string;
  };
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
  const rawDomainProfile = s.domainProfile;
  const rawColorPalette = s.colorPalette;
  const rawTypography = s.typography;
  const domainProfile =
    rawDomainProfile && typeof rawDomainProfile === "object"
      ? (() => {
          const d = rawDomainProfile as Record<string, unknown>;
          const domain = typeof d.domain === "string" ? d.domain : undefined;
          const industry = typeof d.industry === "string" ? d.industry : undefined;
          return domain || industry ? { domain, industry } : undefined;
        })()
      : undefined;
  const colorPalette =
    rawColorPalette && typeof rawColorPalette === "object"
      ? (() => {
          const p = rawColorPalette as Record<string, unknown>;
          const primary = typeof p.primary === "string" ? p.primary : undefined;
          const secondary = typeof p.secondary === "string" ? p.secondary : undefined;
          const accent = typeof p.accent === "string" ? p.accent : undefined;
          const background = typeof p.background === "string" ? p.background : undefined;
          const text = typeof p.text === "string" ? p.text : undefined;
          return primary || secondary || accent || background || text
            ? { primary, secondary, accent, background, text }
            : undefined;
        })()
      : undefined;
  const typography =
    rawTypography && typeof rawTypography === "object"
      ? (() => {
          const t = rawTypography as Record<string, unknown>;
          const headings = typeof t.headings === "string" ? t.headings : undefined;
          const body = typeof t.body === "string" ? t.body : undefined;
          return headings || body ? { headings, body } : undefined;
        })()
      : undefined;
  const has =
    typeof s.projectTitle === "string" ||
    typeof s.brandName === "string" ||
    typeof s.qualityBar === "string" ||
    typeof s.motionLevel === "string" ||
    typeof s.primaryCTA === "string" ||
    (Array.isArray(s.styleKeywords) && s.styleKeywords.length > 0) ||
    (Array.isArray(s.toneKeywords) && s.toneKeywords.length > 0) ||
    (Array.isArray(s.seasonalHints) && s.seasonalHints.length > 0) ||
    Boolean(colorPalette) ||
    Boolean(typography) ||
    (Array.isArray(s.requestedCapabilities) && s.requestedCapabilities.length > 0) ||
    Boolean(domainProfile);
  if (!has) return null;
  return {
    projectTitle: typeof s.projectTitle === "string" ? s.projectTitle : undefined,
    brandName: typeof s.brandName === "string" ? s.brandName : undefined,
    styleKeywords: Array.isArray(s.styleKeywords) ? (s.styleKeywords as string[]) : undefined,
    toneKeywords: Array.isArray(s.toneKeywords) ? (s.toneKeywords as string[]) : undefined,
    qualityBar: typeof s.qualityBar === "string" ? s.qualityBar : undefined,
    motionLevel: typeof s.motionLevel === "string" ? s.motionLevel : undefined,
    primaryCTA: typeof s.primaryCTA === "string" ? s.primaryCTA : undefined,
    seasonalHints: Array.isArray(s.seasonalHints) ? (s.seasonalHints as string[]) : undefined,
    colorPalette,
    typography,
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
  // 2026-04-22 follow-up audit: snapshot sparar `domainProfile` som object
  // `{ domain, industry }` (se `extractBriefSummary` i
  // `own-engine-build-session.ts`), men `system-prompt/` deklarerar
  // `brief.domainProfile?: string` och kör `str(brief?.domainProfile)` —
  // vilket returnerade tom sträng för object-formen, så follow-up-LLM:n
  // tappade det domain-override från init som init-brief faktiskt bar.
  // `guidance-resolvers.resolveGuidanceBlocks` förväntar också ett string-
  // domänvärde (`briefDomainProfile as DomainProfile`). Rehydrera som
  // slug-sträng så samma domain-signal lever över init→follow-up.
  if (summary.domainProfile?.domain) {
    out.domainProfile = summary.domainProfile.domain;
  }
  if (summary.projectTitle) out.projectTitle = summary.projectTitle;
  if (summary.brandName) out.brandName = summary.brandName;
  // Bug 07#3 (2026-04-22 audit): snapshot bevarar style/tone i briefSummary
  // (flat shape: styleKeywords + toneKeywords), men utan rehydrering under
  // de nycklar consumers läser (`brief.visualDirection.styleKeywords`,
  // `brief.toneAndVoice`) tappade follow-ups hela art direction — init hade
  // starkare designkontext än follow-up fast snapshot bar kontinuiteten.
  if (summary.styleKeywords && summary.styleKeywords.length > 0) {
    out.visualDirection = { styleKeywords: summary.styleKeywords };
  }
  if (summary.colorPalette || summary.typography) {
    const currentVisual =
      out.visualDirection && typeof out.visualDirection === "object"
        ? (out.visualDirection as Record<string, unknown>)
        : {};
    out.visualDirection = {
      ...currentVisual,
      ...(summary.colorPalette ? { colorPalette: summary.colorPalette } : {}),
      ...(summary.typography ? { typography: summary.typography } : {}),
    };
  }
  if (summary.toneKeywords && summary.toneKeywords.length > 0) {
    out.toneAndVoice = summary.toneKeywords;
  }
  if (summary.qualityBar) out.qualityBar = summary.qualityBar;
  if (summary.motionLevel) out.motionLevel = summary.motionLevel;
  // M#818-1 (818-svärm 2026-07-02): the snapshot persisted `primaryCTA` from
  // day one but never rehydrated it, and `seasonalHints` was never persisted —
  // so follow-ups silently lost the init brief's primary CTA and seasonal/
  // campaign signals. Map back under the exact keys system-prompt consumers
  // read (`brief.primaryCallToAction`, `brief.seasonalHints`). Note: brief
  // `pages[]` is deliberately NOT snapshotted/rehydrated — follow-up IA comes
  // from the base version's files via the route freeze (fresher truth).
  if (summary.primaryCTA) out.primaryCallToAction = summary.primaryCTA;
  if (summary.seasonalHints && summary.seasonalHints.length > 0) {
    out.seasonalHints = summary.seasonalHints;
  }
  // Returning an empty object is worse than null — downstream guards
  // expect either a populated brief or no brief at all.
  if (Object.keys(out).length === 0) return null;
  return out;
}

// ── Follow-up contract (5-1) ───────────────────────────────────────────────

/**
 * Quality targets a follow-up may inherit. Kept in sync with
 * {@link BuildSpecQualityTarget} via `satisfies` so a future change to the
 * union fails to compile here instead of silently widening this allowlist.
 */
const FOLLOW_UP_QUALITY_TARGETS = [
  "standard",
  "premium",
  "release-candidate",
] as const satisfies readonly BuildSpecQualityTarget[];

/**
 * Område 5 / 5-1: the inherited and frozen signals a follow-up reuses are
 * today scattered across loose `OrchestrationInput` fields (snapshot brief,
 * persisted scaffold/variant ids, existing routes, prior quality target).
 * `FollowUpContract` collects them into one explicit, readable object so the
 * later activities (5-2..5-7) have a single thing to validate against.
 *
 * It adds **no new signal source** — every field is a consolidation of a value
 * that already flows into `buildFollowUpOrchestrationInput`. 5-1 was purely
 * additive (orchestrate did not read it); 5-3 makes `orchestrate` read it as
 * the active source to enforce the scaffold/variant/route freeze on neutral
 * follow-ups (clear-redesign exempt).
 */
export interface FollowUpContract {
  /** Base version the follow-up edits build on (snapshot `lastVersionId`). */
  baseVersionId: string | null;
  /**
   * Deterministic snapshot-derived brief (the rehydrated init design context),
   * or null when the snapshot has no usable `briefSummary`. This always
   * reflects the persisted base — even for a clear-redesign follow-up whose
   * active brief is a fresh delta — so the base lineage stays inspectable.
   */
  snapshotBrief: Record<string, unknown> | null;
  /** Frozen scaffold id carried across the follow-up (persisted id, else snapshot). */
  scaffoldId: string | null;
  /** Frozen scaffold variant id carried across the follow-up (persisted id, else snapshot). */
  variantId: string | null;
  /** Frozen routes from the base version (existing route + deferred-shell paths). */
  routePlan: {
    existingRoutePaths: string[];
    existingShellRoutePaths: string[];
  };
  /** Capability floor inherited from the base version: the snapshot's merged
   * top-level `requestedCapabilities` (brief + inferred-bridge + prior floor),
   * with the briefSummary subset as fallback for older snapshots. */
  capabilities: string[];
  /** Quality target inherited from the prior accepted version, or null. */
  qualityTarget: BuildSpecQualityTarget | null;
  /** Active preview session id carried on the snapshot, or null. */
  previewSessionId: string | null;
}

export interface BuildFollowUpContractInput {
  snapshot: Record<string, unknown> | null | undefined;
  persistedScaffoldId?: string | null;
  persistedVariantId?: string | null;
  existingRoutePaths?: string[];
  existingShellRoutePaths?: string[];
  priorQualityTarget?: BuildSpecQualityTarget | null;
}

function readSnapshotString(
  snapshot: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const value = snapshot[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nonEmptyString(value: string | null | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function resolveContractQualityTarget(
  priorQualityTarget: BuildSpecQualityTarget | null | undefined,
  snapshot: Record<string, unknown> | null | undefined,
): BuildSpecQualityTarget | null {
  if (priorQualityTarget) return priorQualityTarget;
  const buildSpec =
    snapshot && typeof snapshot.buildSpec === "object" && snapshot.buildSpec !== null
      ? (snapshot.buildSpec as Record<string, unknown>)
      : null;
  const raw = buildSpec?.qualityTarget;
  if (typeof raw === "string" && (FOLLOW_UP_QUALITY_TARGETS as readonly string[]).includes(raw)) {
    return raw as BuildSpecQualityTarget;
  }
  return null;
}

/**
 * Derive the {@link FollowUpContract} from values that already exist on the
 * follow-up path (persisted snapshot + persisted ids + existing routes +
 * prior quality target). Pure: no IO and no new inference. Returns a fully
 * populated contract with all-null / empty defaults for a missing or empty
 * snapshot, so callers never have to guard against a throw.
 */
export function buildFollowUpContract(input: BuildFollowUpContractInput): FollowUpContract {
  const { snapshot } = input;
  const snapshotBrief = buildFollowUpBriefFromSnapshot(snapshot);
  // Capability floor source (BUG-SWARM rank 4): prefer the snapshot's top-level
  // `requestedCapabilities` — the merged floor orchestrate persisted from
  // `dossierRequestedCapabilities` (brief + inferred-bridge + prior floor), i.e.
  // the exact capability set the base version actually used. `briefSummary`
  // only carries the raw brief subset, so flooring on it would let an init-
  // inferred capability (e.g. a bridge-derived `analytics`) be silently dropped
  // on a follow-up that doesn't re-infer it — the very drop the floor (5-5)
  // exists to prevent. Fall back to the briefSummary subset for older snapshots.
  const topLevelRaw = (snapshot as Record<string, unknown> | null)?.requestedCapabilities;
  const mergedCapabilities = Array.isArray(topLevelRaw)
    ? topLevelRaw.filter((capability): capability is string => typeof capability === "string")
    : [];
  const briefCapabilities =
    snapshotBrief && Array.isArray(snapshotBrief.requestedCapabilities)
      ? (snapshotBrief.requestedCapabilities as unknown[]).filter(
          (capability): capability is string => typeof capability === "string",
        )
      : [];
  const inheritedCapabilities =
    mergedCapabilities.length > 0 ? mergedCapabilities : briefCapabilities;
  return {
    baseVersionId: readSnapshotString(snapshot, "lastVersionId"),
    snapshotBrief,
    scaffoldId:
      nonEmptyString(input.persistedScaffoldId) ?? readSnapshotString(snapshot, "scaffoldId"),
    variantId:
      nonEmptyString(input.persistedVariantId) ?? readSnapshotString(snapshot, "variantId"),
    // Defensive copies: never hand out a shared array reference, so future
    // enforcement code (5-3..5-6) cannot mutate the same arrays orchestrate
    // reads. Same values/semantics, fresh instances.
    routePlan: {
      existingRoutePaths: [...(input.existingRoutePaths ?? [])],
      existingShellRoutePaths: [...(input.existingShellRoutePaths ?? [])],
    },
    capabilities: [...inheritedCapabilities],
    qualityTarget: resolveContractQualityTarget(input.priorQualityTarget, snapshot),
    previewSessionId: readSnapshotString(snapshot, "previewSessionId"),
  };
}

export function formatPriorDesignContext(
  summary: BriefSummarySnapshot,
  options: { intent?: "clear-redesign" } = {},
): string {
  const lines = [
    options.intent === "clear-redesign"
      ? "Prior site context for orientation only (clear-redesign may replace the visual style unless the user explicitly keeps parts):"
      : "Prior design context (preserve aspects not contradicted by the change request):",
  ];
  if (summary.projectTitle) lines.push(`- Project: ${summary.projectTitle}`);
  if (summary.brandName) lines.push(`- Brand: ${summary.brandName}`);
  if (summary.styleKeywords?.length) lines.push(`- Style: ${summary.styleKeywords.join(", ")}`);
  if (summary.toneKeywords?.length) lines.push(`- Tone: ${summary.toneKeywords.join(", ")}`);
  if (summary.qualityBar) lines.push(`- Quality: ${summary.qualityBar}`);
  if (summary.motionLevel) lines.push(`- Motion: ${summary.motionLevel}`);
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
