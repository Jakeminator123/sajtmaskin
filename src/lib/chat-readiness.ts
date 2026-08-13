export type ChatReadinessSeverity = "blocker" | "warning" | "info";

export type ChatReadinessStatus = "blocked" | "warning" | "ready";

export type ChatReadinessAction = "env" | "versions" | "preview" | "deploy" | "seo";

export type ChatReadinessCategory = "blocker" | "advisory";

export type ChatReadinessItem = {
  id: string;
  title: string;
  detail?: string | null;
  severity: ChatReadinessSeverity;
  category?: ChatReadinessCategory;
  action?: ChatReadinessAction;
  /** Env keys this item is about. Lets the UI open the env panel on the exact relevant keys. */
  envKeys?: string[];
};

export function resolveReadinessCategoryFromSeverity(
  severity: ChatReadinessSeverity,
): ChatReadinessCategory {
  return severity === "blocker" ? "blocker" : "advisory";
}

export type ChatReadinessInfo = {
  versionId: string | null;
  lifecycleStatus?: string | null;
  /**
   * F2 vs F3 stage of the active version (`design` | `integrations`).
   * Used by the builder UI to hide the env panel in F2 and show the
   * "Bygg integrationer" trigger in its place. See
   * `.cursor/rules/env-flow-f2-mute.mdc`.
   */
  lifecycleStage?: "design" | "integrations" | null;
  verificationSummary?: string | null;
  appProjectId?: string | null;
  requiredEnvKeys: string[];
  configuredEnvKeys: string[];
  missingEnvKeys: string[];
  /** Keys not configured by user but covered by preview placeholders — deferred to publish. */
  placeholderCoveredKeys?: string[];
  /**
   * Phase-4 narrowing: subset of `missingEnvKeys` whose dossier marks them
   * `enforcement: "build"` (truly blocking F3). When dossier metadata is
   * unavailable the resolver defaults all keys to `build`, so this list is
   * a superset of the strictly-build subset only on legacy runs.
   */
  buildBlockingKeys?: string[];
  /**
   * Phase-4: keys whose dossier marks them `enforcement: "feature-runtime"`
   * — UI shows a configuration banner / popup at runtime when missing.
   * Surfaced as informational warnings, never blockers.
   */
  featureRuntimeKeys?: string[];
  /**
   * Phase-4: keys whose dossier marks them `enforcement: "warn-only"`.
   * Components self-disable when missing; surfaced for diagnostics, not as a blocker.
   */
  warnOnlyKeys?: string[];
  /**
   * True when "Bygg integrationer" (`/finalize-design`) would take the
   * `llm_ready` path — i.e. at least one planned dossier is still absent from
   * the version or a detected integration has a required real build key, so the click spends a
   * `prompt.refine` LLM round (~4–6 diamonds): either a planned dossier still
   * needs installation or existing code has a real build requirement. False
   * means the deterministic
   * exact-file ReleaseGate fork (0 diamonds). Owned HERE (Ö4a): the UI must not
   * re-derive the branch from `buildBlockingKeys` — that subset of
   * `missingEnvKeys` goes empty once the user configures a build key, which
   * would wrongly predict the free path even though the canonical LLM-branch
   * signal stays true. Undefined = readiness could not resolve it (no version, or the
   * build spec could not be derived — the same `null` that makes the shared
   * gate answer `version_files_unavailable`, i.e. a 409 rather than a free
   * build) → UI shows an honest conditional-cost tooltip instead of a promise.
   */
  hasRealBuildIntegrations?: boolean;
  /**
   * Newest `product_postcheck.summary` has `productBlocked: true`.
   * Does **not** affect `canDeploy` or promotion — only the F3 gate reads the
   * same summary row. Surfaced so readiness never says "ready" while that
   * gate is closed.
   */
  productPostcheckBlocksF3?: boolean;
  /** Plain-language why Bygg integrationer is gated, when `productPostcheckBlocksF3`. */
  productPostcheckBlockedReason?: string | null;
};

export type ChatReadiness = {
  status: ChatReadinessStatus;
  canDeploy: boolean;
  blockers: ChatReadinessItem[];
  warnings: ChatReadinessItem[];
  info: ChatReadinessInfo;
};

export function buildChatReadiness(params: {
  blockers?: ChatReadinessItem[];
  warnings?: ChatReadinessItem[];
  info: ChatReadinessInfo;
}): ChatReadiness {
  const blockers = params.blockers ?? [];
  const warnings = params.warnings ?? [];

  return {
    status: blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready",
    canDeploy: blockers.length === 0,
    blockers,
    warnings,
    info: params.info,
  };
}

const PRODUCT_POSTCHECK_PREFIX = "product_postcheck.";
const PRODUCT_POSTCHECK_SUMMARY = "product_postcheck.summary";
const PRODUCT_POSTCHECK_SKIPPED = "product_postcheck.skipped";

/** Error-log shape the projector needs. Matches `engine_version_error_logs`. */
export type ProductPostcheckReadinessLog = {
  category?: string | null;
  message?: string | null;
  meta?: unknown;
  created_at?: Date | string | null;
};

export type ProductPostcheckReadinessProjection = {
  warnings: ChatReadinessItem[];
  blocksF3: boolean;
  blockedReason: string | null;
};

function createdAtMs(log: ProductPostcheckReadinessLog): number | null {
  if (!log.created_at) return null;
  const ms = new Date(log.created_at).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function readMeta(meta: unknown): Record<string, unknown> | null {
  return meta && typeof meta === "object" && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : null;
}

function isProductPostcheckFindingCategory(category: string): boolean {
  return (
    category.startsWith(PRODUCT_POSTCHECK_PREFIX) &&
    category !== PRODUCT_POSTCHECK_SUMMARY &&
    category !== PRODUCT_POSTCHECK_SKIPPED
  );
}

function findingCode(category: string, meta: Record<string, unknown> | null): string {
  if (meta && typeof meta.code === "string" && meta.code.trim()) return meta.code.trim();
  const rest = category.slice(PRODUCT_POSTCHECK_PREFIX.length);
  return rest || "warning";
}

function findingDetail(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  const parts: string[] = [];
  for (const key of ["href", "text", "src", "route", "formId"] as const) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function pickNewestSummary(
  logs: readonly ProductPostcheckReadinessLog[],
): ProductPostcheckReadinessLog | null {
  const summaries = logs.filter((log) => log.category === PRODUCT_POSTCHECK_SUMMARY);
  if (summaries.length === 0) return null;
  let newest = summaries[0]!;
  let newestMs = createdAtMs(newest);
  for (const summary of summaries) {
    const ms = createdAtMs(summary);
    if (ms != null && (newestMs == null || ms > newestMs)) {
      newest = summary;
      newestMs = ms;
    }
  }
  return newest;
}

function blockedReasonFromFindings(findings: ChatReadinessItem[]): string {
  const titles = findings.map((item) => item.title).filter((title) => title.trim().length > 0);
  if (titles.length === 0) {
    return "Produktkontrollen hittade fel som stoppar Bygg integrationer.";
  }
  if (titles.length === 1) return titles[0]!;
  return titles.join(" ");
}

/**
 * Project the newest Product Postcheck run into readiness warnings.
 *
 * Same "newest summary wins" rule as the F3 gate. Findings are always
 * advisory — never blockers — so `canDeploy` / promotion stay unchanged.
 * `product_postcheck.skipped` is not a finding.
 */
export function projectProductPostcheckReadiness(
  logs: readonly ProductPostcheckReadinessLog[],
): ProductPostcheckReadinessProjection {
  const newestSummary = pickNewestSummary(logs);
  if (!newestSummary) {
    return { warnings: [], blocksF3: false, blockedReason: null };
  }

  const newestMs = createdAtMs(newestSummary);
  const findings: ChatReadinessItem[] = [];
  const seenIds = new Map<string, number>();

  for (const log of logs) {
    const category = typeof log.category === "string" ? log.category : "";
    if (!isProductPostcheckFindingCategory(category)) continue;
    const ms = createdAtMs(log);
    if (newestMs != null && ms != null && ms < newestMs) continue;

    const meta = readMeta(log.meta);
    const code = findingCode(category, meta);
    const n = seenIds.get(code) ?? 0;
    seenIds.set(code, n + 1);
    const title =
      typeof log.message === "string" && log.message.trim()
        ? log.message.trim()
        : "Produktkontrollen hittade ett problem.";
    findings.push({
      id: n === 0 ? `product-postcheck-${code}` : `product-postcheck-${code}-${n}`,
      title,
      detail: findingDetail(meta),
      severity: "warning",
      category: "advisory",
      action: "preview",
    });
  }

  const newestMeta = readMeta(newestSummary.meta);
  const blocksF3 = newestMeta?.productBlocked === true;
  const warnings = [...findings];
  let blockedReason: string | null = null;
  if (blocksF3) {
    blockedReason = blockedReasonFromFindings(findings);
    warnings.unshift({
      id: "product-postcheck-blocks-f3",
      title: "Bygg integrationer är spärrat.",
      detail: blockedReason,
      severity: "warning",
      category: "advisory",
      action: "preview",
    });
  }

  return { warnings, blocksF3, blockedReason };
}
