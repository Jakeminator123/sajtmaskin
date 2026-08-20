/**
 * Read-only: genererings-historik för backoffice-panelen `Generation History`.
 *
 * Slår ihop de tabeller som pipelinen redan skriver per generering:
 *   - `generation_telemetry`        (utfall per version: scaffold, model, retry,
 *                                     autofix, preflight, quality gate, preview)
 *   - latest `product_postcheck.summary` → `product_blocked` +
 *     `reported_quality_gate` (SM-017: visad grind, inte stored enum)
 *   - `engine_versions`             (version-rader: F2/F3 lifecycle, release/verify-state)
 *   - `engine_chats` + `app_projects` (chatt/projekt-kontext för läsbara etiketter)
 *   - `engine_version_error_logs`   (per-version fel/warnings, t.ex. merge:cross-file-stub)
 *   - `engine_generation_logs`      (model/tokens/duration/success per generering)
 *
 * Lägen:
 *   node scripts/db/generation-history.mjs --json [--limit=100]   # senaste genereringar (lista)
 *   node scripts/db/generation-history.mjs --json --chat=<chatId> # drilldown för en chatt
 *
 * Körs read-only mot DB:n som `.env.local` pekar på. Mönster speglar
 * `scripts/db/scaffold-scores.mjs` (ingen Python-DB-driver i backoffice).
 */
import { config } from "dotenv";
import pg from "pg";
import { normalizeEnvUrl, warnIfProdLikeReadTarget } from "./db-target-guard.mjs";

config({ path: ".env.local" });
warnIfProdLikeReadTarget({ commandName: "generation-history" });

const argv = process.argv.slice(2);
const wantJson = argv.includes("--json");
const allowInsecureSsl = argv.includes("--allow-insecure-ssl");

function argValue(name) {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < argv.length && !argv[idx + 1].startsWith("--")) {
    return argv[idx + 1];
  }
  return null;
}

const chatId = argValue("chat");
const limitRaw = Number.parseInt(argValue("limit") ?? "100", 10);
const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;

function emitError(message) {
  if (wantJson) {
    process.stdout.write(JSON.stringify({ error: message }));
  } else {
    console.error(message);
  }
}

const cs = normalizeEnvUrl(
  process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.STORAGE_POSTGRES_URL ||
    process.env.STORAGE_POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL,
);
if (!cs) {
  emitError("Database URL missing (.env.local / pulled env).");
  process.exit(1);
}

const url = new URL(cs);
url.searchParams.delete("sslmode");
url.searchParams.delete("supa");

function resolveSsl() {
  const raw = process.env.DB_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase();
  if (raw === "false" || allowInsecureSsl) {
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}

const client = new pg.Client({ connectionString: url.toString(), ssl: resolveSsl() });

/**
 * Project verifier/autofix outcome fields from telemetry `meta` onto each row.
 * Older rows lack these keys — keep null rather than inventing defaults.
 */
function projectTelemetryMetaFields(row) {
  const meta = row?.meta && typeof row.meta === "object" && !Array.isArray(row.meta) ? row.meta : null;
  const verifier =
    meta?.postStreamSteps &&
    typeof meta.postStreamSteps === "object" &&
    !Array.isArray(meta.postStreamSteps)
      ? meta.postStreamSteps.verifier
      : null;
  const autofix = meta?.autofix && typeof meta.autofix === "object" && !Array.isArray(meta.autofix)
    ? meta.autofix
    : null;
  const verifierObj =
    verifier && typeof verifier === "object" && !Array.isArray(verifier) ? verifier : null;
  return {
    ...row,
    verifier_findings_before:
      typeof verifierObj?.findingsBefore === "number" ? verifierObj.findingsBefore : null,
    verifier_findings_after:
      typeof verifierObj?.findingsAfter === "number" ? verifierObj.findingsAfter : null,
    verifier_fixer_used:
      typeof verifierObj?.fixerUsed === "boolean" ? verifierObj.fixerUsed : null,
    verifier_fixer_improved:
      typeof verifierObj?.fixerImproved === "boolean" ? verifierObj.fixerImproved : null,
    autofix_risky_count:
      typeof autofix?.riskyFixCount === "number" ? autofix.riskyFixCount : null,
  };
}

/**
 * Keep in sync with `resolveReportedQualityGateResult` in
 * `src/lib/db/services/reported-quality-gate.ts`. The Node script cannot
 * import that TS module; the rule is four lines and the vitest lock lives
 * next to the TypeScript owner.
 */
function resolveReportedQualityGateResult(qualityGateResult, productBlocked) {
  if (qualityGateResult === "preflight_passed" && productBlocked === true) {
    return "product_blocked";
  }
  return qualityGateResult ?? null;
}

function projectHistoryRow(row) {
  const projected = projectTelemetryMetaFields(row);
  projected.reported_quality_gate = resolveReportedQualityGateResult(
    projected.quality_gate_result,
    projected.product_blocked === true,
  );
  return projected;
}

const LATEST_PRODUCT_POSTCHECK_JOIN = `
  LEFT JOIN LATERAL (
    SELECT (e.meta @> '{"productBlocked": true}'::jsonb) AS product_blocked
    FROM engine_version_error_logs e
    WHERE e.version_id = gt.version_id
      AND e.category = 'product_postcheck.summary'
    ORDER BY e.created_at DESC
    LIMIT 1
  ) pps ON true
`;

const RECENT_QUERY = `
  SELECT
    gt.created_at,
    gt.chat_id,
    gt.version_id,
    gt.scaffold_id,
    gt.model,
    gt.model_tier,
    gt.build_intent,
    gt.build_method,
    gt.prompt_classification,
    gt.retry_count,
    gt.autofix_applied,
    gt.syntax_fixer_used,
    gt.preflight_error_count,
    gt.preflight_warning_count,
    gt.quality_gate_result,
    pps.product_blocked,
    gt.preview_success,
    gt.preview_blocking_reason,
    gt.deploy_result,
    gt.duration_ms,
    gt.file_count,
    gt.meta,
    v.version_number,
    v.lifecycle_stage,
    v.release_state,
    v.verification_state,
    c.title        AS chat_title,
    c.project_id,
    p.name         AS project_name
  FROM generation_telemetry gt
  ${LATEST_PRODUCT_POSTCHECK_JOIN.trim()}
  LEFT JOIN engine_versions v ON v.id = gt.version_id
  LEFT JOIN engine_chats   c ON c.id = gt.chat_id
  LEFT JOIN app_projects   p ON p.id = c.project_id
  ORDER BY gt.created_at DESC
  LIMIT $1
`;

const CHAT_META_QUERY = `
  SELECT c.id, c.title, c.project_id, c.scaffold_id, c.created_at, p.name AS project_name
  FROM engine_chats c
  LEFT JOIN app_projects p ON p.id = c.project_id
  WHERE c.id = $1
`;

const CHAT_VERSIONS_QUERY = `
  SELECT id, version_number, lifecycle_stage, release_state, verification_state,
         verification_summary, preview_url, parent_version_id, created_at
  FROM engine_versions
  WHERE chat_id = $1
  ORDER BY version_number ASC
`;

const CHAT_TELEMETRY_QUERY = `
  SELECT gt.version_id, gt.scaffold_id, gt.model, gt.model_tier, gt.build_intent, gt.build_method,
         gt.prompt_classification, gt.retry_count, gt.autofix_applied, gt.syntax_fixer_used,
         gt.preflight_error_count, gt.preflight_warning_count, gt.quality_gate_result,
         pps.product_blocked,
         gt.preview_success, gt.preview_blocking_reason, gt.deploy_result, gt.duration_ms,
         gt.file_count, gt.meta, gt.created_at
  FROM generation_telemetry gt
  ${LATEST_PRODUCT_POSTCHECK_JOIN.trim()}
  WHERE gt.chat_id = $1
  ORDER BY gt.created_at ASC
`;

const CHAT_ERROR_LOGS_QUERY = `
  SELECT version_id, level, category, message, created_at
  FROM engine_version_error_logs
  WHERE chat_id = $1
  ORDER BY created_at ASC
  LIMIT 500
`;

const CHAT_GEN_LOGS_QUERY = `
  SELECT model, prompt_tokens, completion_tokens, duration_ms, success, error_message, created_at
  FROM engine_generation_logs
  WHERE chat_id = $1
  ORDER BY created_at ASC
  LIMIT 200
`;

try {
  await client.connect();

  if (chatId) {
    const [meta, versions, telemetry, errorLogs, genLogs] = await Promise.all([
      client.query(CHAT_META_QUERY, [chatId]),
      client.query(CHAT_VERSIONS_QUERY, [chatId]),
      client.query(CHAT_TELEMETRY_QUERY, [chatId]),
      client.query(CHAT_ERROR_LOGS_QUERY, [chatId]),
      client.query(CHAT_GEN_LOGS_QUERY, [chatId]),
    ]);
    const payload = {
      mode: "chat",
      generatedAt: new Date().toISOString(),
      chat: meta.rows[0] ?? { id: chatId, missing: true },
      versions: versions.rows,
      telemetry: telemetry.rows.map(projectHistoryRow),
      errorLogs: errorLogs.rows,
      generationLogs: genLogs.rows,
    };
    if (wantJson) {
      process.stdout.write(JSON.stringify(payload));
    } else {
      console.log(`Chat ${chatId}: ${versions.rows.length} versioner, ${errorLogs.rows.length} fel-rader.`);
    }
    process.exit(0);
  }

  const result = await client.query(RECENT_QUERY, [limit]);
  const rows = result.rows.map(projectHistoryRow);
  let success = 0;
  let failed = 0;
  let pending = 0;
  for (const r of rows) {
    if (r.preview_success === true) success += 1;
    else if (r.preview_success === false) failed += 1;
    else pending += 1;
  }
  const payload = {
    mode: "recent",
    limit,
    generatedAt: new Date().toISOString(),
    summary: { total: rows.length, success, failed, pending },
    rows,
  };
  if (wantJson) {
    process.stdout.write(JSON.stringify(payload));
  } else {
    console.log(`Senaste ${rows.length} genereringar (success=${success}, failed=${failed}, pending=${pending}).`);
    for (const r of rows.slice(0, 30)) {
      console.log(
        [
          (r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at)).slice(0, 19),
          r.project_name || "—",
          r.scaffold_id || "—",
          r.model || "—",
          r.preview_success === true ? "ok" : r.preview_success === false ? "FAIL" : "pending",
        ].join("\t"),
      );
    }
  }
  process.exit(0);
} catch (err) {
  emitError(err instanceof Error ? err.message : String(err));
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
