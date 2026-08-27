/**
 * Tooling-kopia av visad kvalitetsgrind (SM-017 / SM-068).
 *
 * Node-skript kan inte importera `src/lib/db/services/reported-quality-gate.ts`.
 * Den här modulen är den enda mjs-ägaren av samma regel: `preflight_passed` +
 * `productBlocked` → `product_blocked`. Ändra inte mappningen här — sprid den.
 *
 * `generation_telemetry.quality_gate_result` är finalize-only. Product
 * Postcheck skriver `product_postcheck.summary` senare och stämplar aldrig om
 * kolumnen. Promote-guarden läser kolumnen rått med avsikt.
 */

export const REPORTED_PRODUCT_BLOCKED = "product_blocked";
export const REPORTED_PRODUCT_POSTCHECK_DEGRADED = "product_postcheck_degraded";
export const FINALIZE_PREFLIGHT_PASSED = "preflight_passed";

/**
 * Shared predicate for raw error-log readers (`e` = engine_version_error_logs).
 * Generic and legacy rows remain visible; only attested Product Postcheck rows
 * are revision-scoped. Keep this beside the summary projections so `/logg`
 * drilldowns cannot disagree with the UI about an overwritten same-version row.
 */
export const CURRENT_VERSION_ERROR_LOG_PREDICATE_SQL = `
  (
    COALESCE(e.category, '') NOT LIKE 'product_postcheck.%'
    OR e.meta->>'attestedFilesRevision' IS NULL
    OR e.meta->>'attestedFilesRevision' = (
      SELECT ev.files_revision FROM engine_versions ev WHERE ev.id = e.version_id
    )
  )
`;

/**
 * Senaste `product_postcheck.summary` + `product_postcheck.skipped` per
 * `gt.version_id`.
 * Anroparen måste aliasa `generation_telemetry` som `gt`.
 */
export const LATEST_PRODUCT_POSTCHECK_JOIN = `
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(summary.product_blocked, false) AS product_blocked,
      CASE
        WHEN COALESCE(summary.product_blocked, false) THEN false
        WHEN skipped.created_at IS NOT NULL
          AND (summary.created_at IS NULL OR skipped.created_at >= summary.created_at)
          THEN true
        ELSE false
      END AS product_degraded
    FROM (
      SELECT
        e.created_at,
        (e.meta @> '{"productBlocked": true}'::jsonb) AS product_blocked
      FROM engine_version_error_logs e
      WHERE e.version_id = gt.version_id
        AND e.category = 'product_postcheck.summary'
        AND (
          e.meta->>'attestedFilesRevision' IS NULL
          OR e.meta->>'attestedFilesRevision' = (
            SELECT ev.files_revision FROM engine_versions ev WHERE ev.id = gt.version_id
          )
        )
      ORDER BY e.created_at DESC
      LIMIT 1
    ) summary
    FULL JOIN (
      SELECT e.created_at
      FROM engine_version_error_logs e
      WHERE e.version_id = gt.version_id
        AND e.category = 'product_postcheck.skipped'
        AND (
          e.meta->>'attestedFilesRevision' IS NULL
          OR e.meta->>'attestedFilesRevision' = (
            SELECT ev.files_revision FROM engine_versions ev WHERE ev.id = gt.version_id
          )
        )
      ORDER BY e.created_at DESC
      LIMIT 1
    ) skipped ON true
  ) pps ON true
`;

/** Senaste summary+skip-projektion för en given version (`$1` = version_id). */
export const LATEST_PRODUCT_BLOCKED_FOR_VERSION_SQL = `
  SELECT
    COALESCE(summary.product_blocked, false) AS product_blocked,
    CASE
      WHEN COALESCE(summary.product_blocked, false) THEN false
      WHEN skipped.created_at IS NOT NULL
        AND (summary.created_at IS NULL OR skipped.created_at >= summary.created_at)
        THEN true
      ELSE false
    END AS product_degraded
  FROM (
    SELECT
      e.created_at,
      (e.meta @> '{"productBlocked": true}'::jsonb) AS product_blocked
    FROM engine_version_error_logs e
    WHERE e.version_id = $1
      AND e.category = 'product_postcheck.summary'
      AND (
        e.meta->>'attestedFilesRevision' IS NULL
        OR e.meta->>'attestedFilesRevision' = (
          SELECT ev.files_revision FROM engine_versions ev WHERE ev.id = $1
        )
      )
    ORDER BY e.created_at DESC
    LIMIT 1
  ) summary
  FULL JOIN (
    SELECT e.created_at
    FROM engine_version_error_logs e
    WHERE e.version_id = $1
      AND e.category = 'product_postcheck.skipped'
      AND (
        e.meta->>'attestedFilesRevision' IS NULL
        OR e.meta->>'attestedFilesRevision' = (
          SELECT ev.files_revision FROM engine_versions ev WHERE ev.id = $1
        )
      )
    ORDER BY e.created_at DESC
    LIMIT 1
  ) skipped ON true
`;

export function isReportedQualityGateGreen(result) {
  return result === FINALIZE_PREFLIGHT_PASSED;
}

export function productBlockedFromSummaryMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  return meta.productBlocked === true;
}

/**
 * @param {string | null | undefined} qualityGateResult
 * @param {boolean | null | undefined} productBlocked
 * @param {boolean | null | undefined} productDegraded
 * @returns {string | null}
 */
export function resolveReportedQualityGateResult(
  qualityGateResult,
  productBlocked,
  productDegraded = false,
) {
  const finalize = qualityGateResult ?? null;
  if (finalize === FINALIZE_PREFLIGHT_PASSED && productBlocked === true) {
    return REPORTED_PRODUCT_BLOCKED;
  }
  if (finalize === FINALIZE_PREFLIGHT_PASSED && productDegraded === true) {
    return REPORTED_PRODUCT_POSTCHECK_DEGRADED;
  }
  return finalize;
}

/**
 * Stämpla en telemetri-rad så overlayen går att skilja från rå finalize.
 * `quality_gate_result` lämnas orörd.
 */
export function annotateReportedQualityGate(row) {
  const finalize = row?.quality_gate_result ?? null;
  const blocked = row?.product_blocked === true;
  const degraded = row?.product_degraded === true;
  const reported = resolveReportedQualityGateResult(finalize, blocked, degraded);
  return {
    ...row,
    reported_quality_gate: reported,
    quality_gate_overlaid: reported !== finalize,
  };
}

/**
 * KPI-pass: overlay-lagd `product_blocked` är aldrig pass.
 * Legacy-snapshots kan fortfarande bära `passed` / `pass` / `success` / `ok`.
 * Använd inte `includes("passed")` — det räknar `preflight_passed` som pass
 * även när raden egentligen ska overlayas.
 */
export function isQualityGatePassResult(result) {
  const text = String(result ?? "").toLowerCase();
  if (
    text === REPORTED_PRODUCT_BLOCKED ||
    text === REPORTED_PRODUCT_POSTCHECK_DEGRADED
  ) {
    return false;
  }
  if (isReportedQualityGateGreen(result) || text === FINALIZE_PREFLIGHT_PASSED) {
    return true;
  }
  return text === "passed" || text === "pass" || text === "success" || text === "ok";
}

function rowCount(row) {
  const n = Number(row?.n);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Slå ihop GROUP BY-rader (finalize + product_blocked) till visad grind.
 * Rader med `_error` (control-stats `safe()`) lämnas orörda.
 */
export function rollupReportedQualityGate(rows, extraKeys = []) {
  if (!Array.isArray(rows) || rows.some((row) => row && row._error)) {
    return {
      rows: Array.isArray(rows) ? rows : [],
      finalizeRows: Array.isArray(rows) ? rows : [],
      overlaidN: 0,
      blockedOverlaidN: 0,
      degradedOverlaidN: 0,
    };
  }

  const reported = new Map();
  const finalize = new Map();
  let overlaidN = 0;
  let blockedOverlaidN = 0;
  let degradedOverlaidN = 0;

  for (const row of rows) {
    const n = rowCount(row);
    const raw = row.result === "(null)" || row.result == null ? null : String(row.result);
    const blocked = row.product_blocked === true;
    const degraded = row.product_degraded === true;
    const shown = resolveReportedQualityGateResult(raw, blocked, degraded);
    const shownKey = shown ?? "(null)";
    const rawKey = raw ?? "(null)";
    const extra = {};
    for (const key of extraKeys) extra[key] = row[key];
    const extraId = extraKeys.map((key) => String(row[key] ?? "")).join("\0");

    const reportedId = `${extraId}\0${shownKey}`;
    const prevReported = reported.get(reportedId);
    if (!prevReported) {
      const next = { ...extra, result: shownKey, n };
      if (row.avg_fix_count != null) next.avg_fix_count = Number(row.avg_fix_count);
      if (
        (shown === REPORTED_PRODUCT_BLOCKED || shown === REPORTED_PRODUCT_POSTCHECK_DEGRADED) &&
        raw === FINALIZE_PREFLIGHT_PASSED
      ) {
        next.overlaid = n;
      }
      reported.set(reportedId, next);
    } else {
      if (row.avg_fix_count != null) {
        const prevAvg = Number(prevReported.avg_fix_count) || 0;
        const thisAvg = Number(row.avg_fix_count) || 0;
        prevReported.avg_fix_count =
          prevReported.n + n > 0
            ? Math.round(((prevAvg * prevReported.n + thisAvg * n) / (prevReported.n + n)) * 10) / 10
            : 0;
      }
      prevReported.n += n;
      if (
        (shown === REPORTED_PRODUCT_BLOCKED || shown === REPORTED_PRODUCT_POSTCHECK_DEGRADED) &&
        raw === FINALIZE_PREFLIGHT_PASSED
      ) {
        prevReported.overlaid = (prevReported.overlaid ?? 0) + n;
      }
    }

    const finalizeId = `${extraId}\0${rawKey}`;
    const prevFinalize = finalize.get(finalizeId);
    if (!prevFinalize) {
      finalize.set(finalizeId, { ...extra, result: rawKey, n });
    } else {
      prevFinalize.n += n;
    }

    if (
      (shown === REPORTED_PRODUCT_BLOCKED || shown === REPORTED_PRODUCT_POSTCHECK_DEGRADED) &&
      raw === FINALIZE_PREFLIGHT_PASSED
    ) {
      overlaidN += n;
      if (shown === REPORTED_PRODUCT_BLOCKED) blockedOverlaidN += n;
      if (shown === REPORTED_PRODUCT_POSTCHECK_DEGRADED) degradedOverlaidN += n;
    }
  }

  const byN = (a, b) => b.n - a.n;
  return {
    rows: [...reported.values()].sort(byN),
    finalizeRows: [...finalize.values()].sort(byN),
    overlaidN,
    blockedOverlaidN,
    degradedOverlaidN,
  };
}
