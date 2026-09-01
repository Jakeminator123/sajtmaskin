import { resolveProductPostcheckReportState } from "@/lib/db/services/reported-quality-gate";

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
   * Newest `product_postcheck.summary` has `productBlocked: true` from a
   * finding that actually gates (B1). Paints readiness `status: "blocked"`.
   * Does **not** affect `canDeploy` or promotion — those gates still ignore
   * `productBlocked` by a separate owner decision.
   */
  productPostcheckBlocksF3?: boolean;
  /**
   * Plain-language why readiness is red / Bygg integrationer is gated, when
   * `productPostcheckBlocksF3`. Titles of findings that actually set
   * `productBlocked` only — not advisory codes such as `preview_probe_unreadable`.
   */
  productPostcheckBlockedReason?: string | null;
};

export type ChatReadiness = {
  status: ChatReadinessStatus;
  canDeploy: boolean;
  blockers: ChatReadinessItem[];
  warnings: ChatReadinessItem[];
  info: ChatReadinessInfo;
};

/**
 * Product-postcheck items paint readiness red (B1) but must not flip
 * `canDeploy`. Deploy/promote still ignore `productBlocked`.
 */
function isProductPostcheckReadinessItem(item: ChatReadinessItem): boolean {
  return item.id.startsWith("product-postcheck-");
}

export function buildChatReadiness(params: {
  blockers?: ChatReadinessItem[];
  warnings?: ChatReadinessItem[];
  info: ChatReadinessInfo;
}): ChatReadiness {
  const blockers = params.blockers ?? [];
  const warnings = params.warnings ?? [];
  const deployBlockers = blockers.filter((item) => !isProductPostcheckReadinessItem(item));

  return {
    status: blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready",
    canDeploy: deployBlockers.length === 0,
    blockers,
    warnings,
    info: params.info,
  };
}

const PRODUCT_POSTCHECK_PREFIX = "product_postcheck.";
const PRODUCT_POSTCHECK_SUMMARY = "product_postcheck.summary";
const PRODUCT_POSTCHECK_SKIPPED = "product_postcheck.skipped";
const PRODUCT_POSTCHECK_LIVE_REVIEW = "product_postcheck.live_review";

/** Error-log shape the projector needs. Matches `engine_version_error_logs`. */
export type ProductPostcheckReadinessLog = {
  category?: string | null;
  message?: string | null;
  meta?: unknown;
  created_at?: Date | string | null;
};

export type ProductPostcheckReadinessProjection = {
  warnings: ChatReadinessItem[];
  /** Gating findings when the newest summary is `productBlocked` (B1). */
  blockers: ChatReadinessItem[];
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
    category !== PRODUCT_POSTCHECK_SKIPPED &&
    category !== PRODUCT_POSTCHECK_LIVE_REVIEW
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

type ProjectedFinding = {
  code: string;
  item: ChatReadinessItem;
};

/**
 * Codes that set `productBlocked` in `product-postcheck.ts` (DOM eval,
 * runtime eval, or leftover preview-host boot page). Duplicated here on
 * purpose: that module pulls Playwright and must not enter the client bundle
 * that imports this file. One broken_anchor is advisory; two or more gate F3.
 * `preview_probe_unreadable` is intentionally absent — an empty/failed probe
 * does not prove the host is still on its start page and must not paint
 * readiness red (B1) or gate F3.
 */
const F3_ALWAYS_BLOCKING_CODES = new Set([
  "mobile_menu_failed",
  "runtime_crash",
  "preview_boot_page",
]);
const PREVIEW_PROBE_UNREADABLE_CODE = "preview_probe_unreadable";

const EMPTY_PRODUCT_POSTCHECK_PROJECTION: ProductPostcheckReadinessProjection = {
  warnings: [],
  blockers: [],
  blocksF3: false,
  blockedReason: null,
};

function skippedPostcheckWarning(
  log: ProductPostcheckReadinessLog | null,
): ChatReadinessItem {
  const meta = readMeta(log?.meta);
  const reason =
    meta && typeof meta.skippedReason === "string" && meta.skippedReason.trim()
      ? meta.skippedReason.trim()
      : "unknown";
  return {
    id: "product-postcheck-skipped",
    title: "Produktkontrollen kunde inte slutföras.",
    detail: `${reason} · ${PRODUCT_POSTCHECK_SKIPPED}`,
    severity: "warning",
    category: "advisory",
    action: "preview",
  };
}

function findingsThatGateF3(findings: readonly ProjectedFinding[]): ProjectedFinding[] {
  const brokenAnchorCount = findings.filter((row) => row.code === "broken_anchor").length;
  return findings.filter((row) => {
    if (F3_ALWAYS_BLOCKING_CODES.has(row.code)) return true;
    return row.code === "broken_anchor" && brokenAnchorCount >= 2;
  });
}

function blockedReasonFromFindings(findings: readonly ProjectedFinding[]): string {
  const titles = findings
    .map((row) => row.item.title)
    .filter((title) => title.trim().length > 0);
  if (titles.length === 0) {
    return "Produktkontrollen hittade fel som stoppar Bygg integrationer.";
  }
  if (titles.length === 1) return titles[0]!;
  return titles.join(" ");
}

function toBlockerItem(row: ProjectedFinding): ChatReadinessItem {
  const codeDetail = `${PRODUCT_POSTCHECK_PREFIX}${row.code}`;
  return {
    ...row.item,
    severity: "blocker",
    category: "blocker",
    detail: row.item.detail ? `${row.item.detail} · ${codeDetail}` : codeDetail,
  };
}

/**
 * Project the newest Product Postcheck run into the readiness surface (B1).
 *
 * Same "newest summary wins" rule as the F3 gate. Gating findings
 * (`preview_boot_page`, `runtime_crash`, `mobile_menu_failed`, ≥2
 * `broken_anchor`) become blockers so status is red and the causing
 * `product_postcheck.*` code is in the item. Advisory codes stay warnings.
 * `preview_probe_unreadable` never becomes a blocker — an empty probe is
 * "we could not see", not "the host is still on its start page".
 * `canDeploy` / promotion still ignore these items (`buildChatReadiness`).
 * `product_postcheck.skipped` is not a finding.
 */
export function projectProductPostcheckReadiness(
  logs: readonly ProductPostcheckReadinessLog[],
): ProductPostcheckReadinessProjection {
  const report = resolveProductPostcheckReportState(logs);
  const newestSummary = pickNewestSummary(logs);
  if (!newestSummary) {
    // `advisory` räknas med: den betyder fortfarande att ingen produktdom
    // finns, bara att orsaken låg i kontrollkedjan. Utan den här grenen tystnar
    // readiness-kortet helt när Chromium dog — användaren skulle då tro att
    // sajten var fullt kontrollerad.
    if (report.kind === "degraded" || report.kind === "advisory") {
      return {
        warnings: [skippedPostcheckWarning(report.skipped)],
        blockers: [],
        blocksF3: false,
        blockedReason: null,
      };
    }
    return EMPTY_PRODUCT_POSTCHECK_PROJECTION;
  }

  const newestMs = createdAtMs(newestSummary);
  const findings: ProjectedFinding[] = [];
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
      code,
      item: {
        id: n === 0 ? `product-postcheck-${code}` : `product-postcheck-${code}-${n}`,
        title,
        detail: findingDetail(meta),
        severity: "warning",
        category: "advisory",
        action: "preview",
      },
    });
  }

  const productBlocked = report.kind === "blocked";
  const gating = findingsThatGateF3(findings);
  const unreadableOnly =
    findings.length > 0 &&
    findings.every((row) => row.code === PREVIEW_PROBE_UNREADABLE_CODE);
  // Defense for a buggy summary that marks unreadable as productBlocked:
  // that code must not paint readiness red (#1002 / B1).
  const blocksF3 = productBlocked && !unreadableOnly;
  if (!blocksF3) {
    return {
      warnings: [
        ...findings.map((row) => row.item),
        ...(report.kind === "degraded"
          ? [skippedPostcheckWarning(report.skipped)]
          : []),
      ],
      blockers: [],
      blocksF3: false,
      blockedReason: null,
    };
  }

  const blockedReason = blockedReasonFromFindings(gating);
  const gatingIds = new Set(gating.map((row) => row.item.id));
  const blockers =
    gating.length > 0
      ? gating.map(toBlockerItem)
      : [
          {
            id: "product-postcheck-blocks-f3",
            title: blockedReason,
            detail: PRODUCT_POSTCHECK_SUMMARY,
            severity: "blocker" as const,
            category: "blocker" as const,
            action: "preview" as const,
          },
        ];
  const warnings = findings
    .filter((row) => !gatingIds.has(row.item.id))
    .map((row) => row.item);

  return { warnings, blockers, blocksF3, blockedReason };
}

/**
 * Same category as `PREVIEW_CLIENT_ERROR_CATEGORY` in
 * `preview-client-error-report.ts`. Duplicated on purpose: that module is a
 * client reporter with `fetch` and must not enter the bundle that imports
 * this file.
 */
const PREVIEW_CLIENT_ERROR_LOG_CATEGORY = "preview:client-error";

/** Error-log shape the late-client-error projector needs. */
export type LateClientErrorReadinessLog = {
  category?: string | null;
  message?: string | null;
  meta?: unknown;
  created_at?: Date | string | null;
};

function parseClockMs(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Project post-promotion `preview:client-error` rows as advisory warnings.
 *
 * The log table does not mark before vs after promotion. "Late" is therefore
 * `created_at` strictly after `engine_versions.promoted_at` — both clocks are
 * server-written (insert time vs promote time). Missing/invalid `promoted_at`
 * or `created_at` means we cannot prove lateness, so the row stays diagnostic.
 * Pre-promotion rows and equal timestamps are ignored: a warning for every
 * historical client-error is worse than no warning.
 *
 * Findings are always advisory — never blockers — so `canDeploy` / promotion
 * stay unchanged.
 */
export function projectLateClientErrorReadiness(
  logs: readonly LateClientErrorReadinessLog[],
  promotedAt: Date | string | null | undefined,
): ChatReadinessItem[] {
  const promotedMs = parseClockMs(promotedAt);
  if (promotedMs == null) return [];

  const late: Array<{ message: string; href: string | null; ms: number }> = [];
  const seen = new Set<string>();

  for (const log of logs) {
    if (log.category !== PREVIEW_CLIENT_ERROR_LOG_CATEGORY) continue;
    const ms = createdAtMs(log);
    if (ms == null || ms <= promotedMs) continue;

    const message =
      typeof log.message === "string" && log.message.trim()
        ? log.message.trim()
        : "Ett okänt fel rapporterades i förhandsvisningen.";
    if (seen.has(message)) continue;
    seen.add(message);

    const meta = readMeta(log.meta);
    const href =
      meta && typeof meta.href === "string" && meta.href.trim()
        ? meta.href.trim()
        : null;
    late.push({ message, href, ms });
  }

  if (late.length === 0) return [];

  late.sort((a, b) => b.ms - a.ms);
  const newest = late[0]!;
  const newestText = newest.href ? `${newest.message} · ${newest.href}` : newest.message;
  const detail =
    late.length === 1 ? newestText : `${late.length} fel, senast: ${newestText}`;

  return [
    {
      id: "late-client-error",
      title: "Förhandsvisningen rapporterade ett fel efter att versionen godkändes.",
      detail,
      severity: "warning",
      category: "advisory",
      action: "preview",
    },
  ];
}
