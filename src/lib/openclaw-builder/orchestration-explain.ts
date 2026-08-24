/**
 * Read-only explanation of a frozen, already-selected orchestration snapshot.
 * The agent cannot re-pick scaffold, variant, or dossiers.
 */

const HEX_64 = /^[0-9a-f]{64}$/;
const SECRET_RE = /bearer|sk-|rk[_-]|whsec|BEGIN PRIVATE|api[_-]?key/i;
const MAX_LIST = 32;
const MAX_BUILD_INTENT = 64;
const MAX_LOCKED_CONTRACT = 80;

const FROZEN_NOTES = [
  "Owners are frozen; this is a read-only explanation of the selected package.",
  "The agent cannot change scaffold, variant, or dossier registers.",
] as const;

export type FrozenOrchestrationView = {
  generationInputPackageHash: string;
  lineageHash: string;
  sourceReceiptHash: string;
  buildIntent: string;
  lifecycleStage: "design" | "integrations";
  scaffoldId: string | null;
  variantId: string | null;
  dossierIds: string[];
  sourceIds: string[];
  importedRepoMode: boolean;
  lockedContracts: string[];
};

export type OrchestrationExplanation = {
  tool: "orchestration.explain";
  canRepickScaffold: false;
  canRepickVariant: false;
  canRepickDossiers: false;
  package: {
    generationInputPackageHash: string;
    lineageHash: string;
    sourceReceiptHash: string;
  };
  selection: {
    buildIntent: string;
    lifecycleStage: "design" | "integrations";
    scaffoldId: string | null;
    variantId: string | null;
    dossierIds: string[];
    sourceIds: string[];
    importedRepoMode: boolean;
  };
  lockedContracts: string[];
  notes: string[];
};

export type ExplainOrchestrationResult =
  | { ok: true; explanation: OrchestrationExplanation }
  | { ok: false; code: "invalid_view" };

function isHex64(value: unknown): value is string {
  return typeof value === "string" && HEX_64.test(value);
}

function isLifecycleStage(
  value: unknown,
): value is FrozenOrchestrationView["lifecycleStage"] {
  return value === "design" || value === "integrations";
}

function optionalId(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

function normalizeIdList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_LIST) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0) return null;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function normalizeLockedContracts(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_LIST) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (
      typeof item !== "string" ||
      item.length === 0 ||
      item.length > MAX_LOCKED_CONTRACT ||
      SECRET_RE.test(item)
    ) {
      return null;
    }
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function parseView(value: unknown): FrozenOrchestrationView | null {
  if (value == null || typeof value !== "object") return null;
  const view = value as Record<string, unknown>;

  if (
    !isHex64(view.generationInputPackageHash) ||
    !isHex64(view.lineageHash) ||
    !isHex64(view.sourceReceiptHash)
  ) {
    return null;
  }

  if (
    typeof view.buildIntent !== "string" ||
    view.buildIntent.length === 0 ||
    view.buildIntent.length > MAX_BUILD_INTENT
  ) {
    return null;
  }

  if (!isLifecycleStage(view.lifecycleStage)) return null;
  if (typeof view.importedRepoMode !== "boolean") return null;

  const scaffoldId = optionalId(view.scaffoldId);
  const variantId = optionalId(view.variantId);
  if (scaffoldId === undefined || variantId === undefined) return null;

  const dossierIds = normalizeIdList(view.dossierIds);
  const sourceIds = normalizeIdList(view.sourceIds);
  const lockedContracts = normalizeLockedContracts(view.lockedContracts);
  if (!dossierIds || !sourceIds || !lockedContracts) return null;

  return {
    generationInputPackageHash: view.generationInputPackageHash,
    lineageHash: view.lineageHash,
    sourceReceiptHash: view.sourceReceiptHash,
    buildIntent: view.buildIntent,
    lifecycleStage: view.lifecycleStage,
    scaffoldId,
    variantId,
    dossierIds,
    sourceIds,
    importedRepoMode: view.importedRepoMode,
    lockedContracts,
  };
}

export function explainOrchestration(input: {
  view: FrozenOrchestrationView;
}): ExplainOrchestrationResult {
  const view = parseView(input?.view);
  if (!view) return { ok: false, code: "invalid_view" };

  return {
    ok: true,
    explanation: {
      tool: "orchestration.explain",
      canRepickScaffold: false,
      canRepickVariant: false,
      canRepickDossiers: false,
      package: {
        generationInputPackageHash: view.generationInputPackageHash,
        lineageHash: view.lineageHash,
        sourceReceiptHash: view.sourceReceiptHash,
      },
      selection: {
        buildIntent: view.buildIntent,
        lifecycleStage: view.lifecycleStage,
        scaffoldId: view.scaffoldId,
        variantId: view.variantId,
        dossierIds: [...view.dossierIds],
        sourceIds: [...view.sourceIds],
        importedRepoMode: view.importedRepoMode,
      },
      lockedContracts: [...view.lockedContracts],
      notes: [...FROZEN_NOTES],
    },
  };
}
