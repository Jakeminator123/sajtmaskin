import type { GenerationInputPackage } from "../generation-input-package";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { parseResolvedDesignContract, type ResolvedDesignContract } from "../design-contract";
import type { VariantSelection, VariantSelectionSource } from "../scaffold-variants";
import { normalizeRequestAttachments, type RequestAttachment } from "../request-metadata";

export const PENDING_PLAN_AUTHORITY_SNAPSHOT_KEY = "pendingPlanAuthority";

export interface PlanDesignAuthority {
  schemaVersion: 2;
  /** Exact chat-scoped version whose files the planner inspected. */
  baseVersionId: string | null;
  /** Content identity paired with baseVersionId; null only for versionless init. */
  baseFilesRevision: string | null;
  /** Server-owned receipts for every user attachment the planner could inspect. */
  requestAttachments: RequestAttachment[];
  customInstructions: string | null;
  imageGenerations: boolean;
  scaffoldId: string | null;
  buildIntent: BuildIntent;
  variantId: string | null;
  variantSelection: VariantSelection;
  resolvedDesign: ResolvedDesignContract;
  variantTemplateId: string | null;
  /** Runtime Deep Brief used for the same finalized plan prompt. */
  brief: Record<string, unknown> | null;
  lineageHash: string;
}

const VARIANT_SELECTION_SOURCES = new Set<VariantSelectionSource>([
  "style-choice",
  "follow-up-lock",
  "brief-embedding",
  "embedding",
  "brief-keyword",
  "keyword",
  "hash-fallback",
  "hint-fallback",
  "approved-plan",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableFiniteNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseVariantSelection(value: unknown): VariantSelection | null {
  const raw = record(value);
  if (!raw || !VARIANT_SELECTION_SOURCES.has(raw.source as VariantSelectionSource)) return null;
  const score = nullableFiniteNumber(raw.score);
  const runnerUpScore = nullableFiniteNumber(raw.runnerUpScore);
  const margin = nullableFiniteNumber(raw.margin);
  if (score === undefined || runnerUpScore === undefined || margin === undefined) return null;
  if (raw.hintId !== null && typeof raw.hintId !== "string") return null;
  if (raw.finalId !== null && typeof raw.finalId !== "string") return null;
  if (typeof raw.changedFromHint !== "boolean") return null;
  return {
    source: raw.source as VariantSelectionSource,
    score,
    runnerUpScore,
    margin,
    hintId: raw.hintId as string | null,
    finalId: raw.finalId as string | null,
    changedFromHint: raw.changedFromHint,
  };
}

export function buildPlanDesignAuthority(
  pkg: GenerationInputPackage,
  context: {
    baseVersionId: string | null;
    baseFilesRevision: string | null;
    requestAttachments: RequestAttachment[];
    customInstructions: string | null;
    imageGenerations: boolean;
  },
): PlanDesignAuthority {
  return {
    schemaVersion: 2,
    baseVersionId: context.baseVersionId,
    baseFilesRevision: context.baseFilesRevision,
    requestAttachments: context.requestAttachments.map((attachment) => ({ ...attachment })),
    customInstructions: nonEmptyString(context.customInstructions),
    imageGenerations: context.imageGenerations,
    scaffoldId: pkg.resolvedScaffold?.id ?? pkg.buildSpec.scaffoldId ?? null,
    buildIntent: pkg.buildSpec.buildIntent,
    variantId: pkg.variantId,
    variantSelection: { ...pkg.variantSelection },
    resolvedDesign: pkg.resolvedDesign,
    variantTemplateId: pkg.variantTemplateId,
    brief: pkg.brief ? { ...pkg.brief } : null,
    lineageHash: pkg.lineageHash,
  };
}

export function parsePlanDesignAuthority(value: unknown): PlanDesignAuthority | null {
  const raw = record(value);
  if (!raw || raw.schemaVersion !== 2) return null;
  if (raw.baseVersionId !== null && typeof raw.baseVersionId !== "string") return null;
  if (raw.baseFilesRevision !== null && typeof raw.baseFilesRevision !== "string") return null;
  const baseVersionId = nonEmptyString(raw.baseVersionId);
  const baseFilesRevision = nonEmptyString(raw.baseFilesRevision);
  if ((baseVersionId === null) !== (baseFilesRevision === null)) return null;
  if (!Array.isArray(raw.requestAttachments) || raw.requestAttachments.length > 24) return null;
  const requestAttachments = normalizeRequestAttachments(raw.requestAttachments);
  if (requestAttachments.length !== raw.requestAttachments.length) return null;
  if (raw.customInstructions !== null && typeof raw.customInstructions !== "string") return null;
  if (typeof raw.imageGenerations !== "boolean") return null;
  if (raw.scaffoldId !== null && typeof raw.scaffoldId !== "string") return null;
  if (
    raw.buildIntent !== "website" &&
    raw.buildIntent !== "app" &&
    raw.buildIntent !== "template"
  ) {
    return null;
  }
  if (raw.variantId !== null && typeof raw.variantId !== "string") return null;
  if (typeof raw.lineageHash !== "string" || !raw.lineageHash.trim()) return null;
  if (raw.variantTemplateId !== null && typeof raw.variantTemplateId !== "string") return null;
  if (raw.brief !== null && !record(raw.brief)) return null;
  const variantSelection = parseVariantSelection(raw.variantSelection);
  const resolvedDesign = parseResolvedDesignContract(raw.resolvedDesign);
  if (!variantSelection || !resolvedDesign) return null;
  if (variantSelection.finalId !== raw.variantId || resolvedDesign.variantId !== raw.variantId) {
    return null;
  }
  return {
    schemaVersion: 2,
    baseVersionId,
    baseFilesRevision,
    requestAttachments,
    customInstructions: nonEmptyString(raw.customInstructions),
    imageGenerations: raw.imageGenerations,
    scaffoldId: raw.scaffoldId as string | null,
    buildIntent: raw.buildIntent,
    variantId: raw.variantId as string | null,
    variantSelection,
    resolvedDesign,
    variantTemplateId: raw.variantTemplateId as string | null,
    brief: raw.brief === null ? null : { ...(raw.brief as Record<string, unknown>) },
    lineageHash: raw.lineageHash.trim(),
  };
}

export function readPendingPlanDesignAuthority(
  snapshot: Record<string, unknown> | null | undefined,
): PlanDesignAuthority | null {
  return parsePlanDesignAuthority(snapshot?.[PENDING_PLAN_AUTHORITY_SNAPSHOT_KEY]);
}

export type ApprovedPlanAuthorityResolution =
  | { ok: true; authority: PlanDesignAuthority | null }
  | {
      ok: false;
      error:
        | "plan_design_authority_missing"
        | "plan_design_authority_stale"
        | "plan_design_authority_base_stale";
    };

/**
 * Bind an approved-plan execution to the exact server-owned design authority
 * that produced the plan. This applies to both versionless first builds and
 * plans made for an existing site; the browser-provided plan body is never an
 * authority source.
 */
export function resolveApprovedPlanDesignAuthority(input: {
  promptSourceKind: string | null | undefined;
  requestedLineageHash: string | null | undefined;
  currentBaseVersionId: string | null | undefined;
  currentBaseFilesRevision: string | null | undefined;
  snapshot: Record<string, unknown> | null | undefined;
}): ApprovedPlanAuthorityResolution {
  if (input.promptSourceKind !== "approved-plan") {
    return { ok: true, authority: null };
  }

  const authority = readPendingPlanDesignAuthority(input.snapshot);
  if (!authority) {
    return { ok: false, error: "plan_design_authority_missing" };
  }
  if (input.requestedLineageHash?.trim() !== authority.lineageHash) {
    return { ok: false, error: "plan_design_authority_stale" };
  }
  const currentBaseVersionId = nonEmptyString(input.currentBaseVersionId);
  const currentBaseFilesRevision = nonEmptyString(input.currentBaseFilesRevision);
  if (
    currentBaseVersionId !== authority.baseVersionId ||
    currentBaseFilesRevision !== authority.baseFilesRevision
  ) {
    return { ok: false, error: "plan_design_authority_base_stale" };
  }
  return { ok: true, authority };
}
