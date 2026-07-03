/**
 * Read-only kontroll-statistik over genererade sajter ("kvantitativ /logg").
 *
 * Aggregerar prod- (eller dev-) DB:ns loggtabeller for att visa VAR felen
 * kommer ifran: vilken kontroll (quality gate, autofix, LLM-fix, preflight,
 * server-verify, post-repair) som star for flest fel/varningar, plus
 * telemetri-nyckeltal per scaffold och quality-gate-utfall.
 *
 * Usage:
 *   node scripts/db/control-stats.mjs --json --env=.env.vercel.production.pulled --days=14 --allow-insecure-ssl
 *
 * SELECT only; skriver aldrig. Speglar dump-logs.mjs env-hantering.
 */
import { config } from "dotenv";
import pg from "pg";
import { normalizeEnvUrl, inspectDbTarget, summarizeTarget } from "./db-target-guard.mjs";
import { mergeEnvFileOverProcess } from "./env-merge.mjs";

const argv = process.argv.slice(2);
const wantJson = argv.includes("--json");
const allowInsecureSsl = argv.includes("--allow-insecure-ssl");

function argValue(name, fallback = null) {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  return fallback;
}

const envPath = argValue("env", ".env.local");
const daysRaw = Number.parseInt(argValue("days", "14"), 10);
const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 365) : 14;

const parsedEnvFile = config({ path: envPath, quiet: true }).parsed ?? {};
const effectiveEnv = mergeEnvFileOverProcess(parsedEnvFile, process.env);

const cs = normalizeEnvUrl(
  effectiveEnv.POSTGRES_URL ||
    effectiveEnv.POSTGRES_URL_NON_POOLING ||
    effectiveEnv.STORAGE_POSTGRES_URL ||
    effectiveEnv.STORAGE_POSTGRES_URL_NON_POOLING ||
    effectiveEnv.DATABASE_URL,
);
if (!cs) {
  console.error(`Databas-URL saknas i ${envPath}.`);
  process.exit(1);
}

const inspection = inspectDbTarget(effectiveEnv);
const url = new URL(cs);
url.searchParams.delete("sslmode");
url.searchParams.delete("supa");

function resolveSsl() {
  const raw = effectiveEnv.DB_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase();
  if (raw === "false" || allowInsecureSsl) return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

const client = new pg.Client({ connectionString: url.toString(), ssl: resolveSsl() });

/** Best-effort: en query som failar (saknad tabell/kolumn) ger { error } i stallet for abort. */
async function safe(label, sql, params = []) {
  try {
    const r = await client.query(sql, params);
    return r.rows;
  } catch (err) {
    return [{ _error: `${label}: ${err instanceof Error ? err.message : String(err)}` }];
  }
}

const W = `now() - interval '${days} days'`;

try {
  await client.connect();

  const out = {
    ok: true,
    generatedAt: new Date().toISOString(),
    envPath,
    target: summarizeTarget(inspection.current),
    isProdLike: inspection.isProdLike,
    windowDays: days,
  };

  // Volym: hur manga chattar/versioner/genereringar i fonstret.
  out.volume = await safe(
    "volume",
    `SELECT
       (SELECT COUNT(*)::int FROM engine_chats    WHERE created_at > ${W}) AS chats,
       (SELECT COUNT(*)::int FROM engine_versions WHERE created_at > ${W}) AS versions,
       (SELECT COUNT(*)::int FROM engine_generation_logs WHERE created_at > ${W}) AS generations,
       (SELECT COUNT(*)::int FROM generation_telemetry   WHERE created_at > ${W}) AS telemetry_rows,
       (SELECT COUNT(*)::int FROM engine_version_error_logs WHERE created_at > ${W}) AS error_log_rows`,
  );

  // 1) Fel/varningar per kontroll-kategori (karnfragan).
  out.errorsByCategory = await safe(
    "errorsByCategory",
    `SELECT COALESCE(category,'(null)') AS category, level,
            COUNT(*)::int AS n, COUNT(DISTINCT version_id)::int AS versions
     FROM engine_version_error_logs
     WHERE created_at > ${W}
     GROUP BY 1,2 ORDER BY n DESC`,
  );

  // 2) Quality gate: vilken check faller forst (firstFailureCheck ur meta).
  out.qualityGateFirstFailure = await safe(
    "qualityGateFirstFailure",
    `SELECT COALESCE(meta->>'firstFailureCheck','(passed/none)') AS first_failure,
            level, COUNT(*)::int AS n
     FROM engine_version_error_logs
     WHERE category = 'preflight:quality-gate' AND created_at > ${W}
     GROUP BY 1,2 ORDER BY n DESC`,
  );

  // 3) Quality gate: pass/fail per delcheck (install/typecheck/lint/...).
  out.qualityGateChecks = await safe(
    "qualityGateChecks",
    `SELECT c->>'check' AS check_name,
            SUM(CASE WHEN (c->>'passed')::boolean THEN 0 ELSE 1 END)::int AS failed,
            COUNT(*)::int AS total,
            AVG((c->>'durationMs')::numeric)::int AS avg_ms
     FROM engine_version_error_logs e,
          jsonb_array_elements(e.meta->'checks') c
     WHERE e.category = 'preflight:quality-gate' AND e.created_at > ${W}
     GROUP BY 1 ORDER BY failed DESC, total DESC`,
  );

  // 4) Deterministisk autofix: riskprofil. Nya writers använder
  // `autofix_risk`; historiska `autofix_heavy_load`-rader räknas som legacy.
  out.autofixRisk = await safe(
    "autofixRisk",
    `SELECT COUNT(*) FILTER (WHERE meta->>'event' = 'autofix_risk')::int AS risk_events,
            COUNT(*) FILTER (WHERE meta->>'event' = 'autofix_heavy_load')::int AS legacy_heavy_events,
            SUM(COALESCE((meta->>'safeFixCount')::int, 0))::int AS safe_fix_count,
            SUM(COALESCE((meta->>'riskyFixCount')::int, 0))::int AS risky_fix_count,
            COUNT(DISTINCT version_id) FILTER (WHERE COALESCE((meta->>'riskyFixCount')::int, 0) > 0)::int AS versions_with_risky_fixes,
            AVG(COALESCE((meta->>'fixCount')::numeric, (meta->>'safeFixCount')::numeric + (meta->>'riskyFixCount')::numeric))::numeric(10,1) AS avg_fix_count,
            MAX(COALESCE((meta->>'fixCount')::int, (meta->>'safeFixCount')::int + (meta->>'riskyFixCount')::int)) AS max_fix_count,
            percentile_cont(0.5) WITHIN GROUP (
              ORDER BY COALESCE((meta->>'fixCount')::numeric, (meta->>'safeFixCount')::numeric + (meta->>'riskyFixCount')::numeric)
            ) AS median_fix_count
     FROM engine_version_error_logs
     WHERE category = 'autofix'
       AND created_at > ${W}
       AND (
         meta->>'event' IN ('autofix_risk', 'autofix_heavy_load')
         OR meta ? 'fixCount'
       )`,
  );

  // 5) Preflight-issues per kategori (vilken typ av kodfel preflighten hittar).
  out.preflightIssueCategories = await safe(
    "preflightIssueCategories",
    `SELECT i->>'category' AS issue_category, i->>'severity' AS severity, COUNT(*)::int AS n
     FROM engine_version_error_logs e,
          jsonb_array_elements(e.meta->'issues') i
     WHERE e.category IN ('preflight:issues','preflight:summary') AND e.created_at > ${W}
     GROUP BY 1,2 ORDER BY n DESC LIMIT 30`,
  );

  // 6) Telemetri-nyckeltal: hur ofta varje kontroll ingriper.
  out.telemetryTotals = await safe(
    "telemetryTotals",
    `SELECT COUNT(*)::int AS runs,
            SUM(CASE WHEN autofix_applied THEN 1 ELSE 0 END)::int AS autofix_runs,
            SUM(CASE WHEN syntax_fixer_used THEN 1 ELSE 0 END)::int AS llm_fix_runs,
            SUM(CASE WHEN retry_count > 0 THEN 1 ELSE 0 END)::int AS retried_runs,
            -- M#pv1 honest preview_success tri-state:
            --   TRUE  = runtime confirmed ready (runtime-ready receipt),
            --   FALSE = confirmed no working preview (blocked or start failed),
            --   NULL  = pending/unconfirmed (fresh boot queued, or no preview attempt).
            -- Do NOT fold NULL into "not ok" — that would count pending boots as
            -- failures. Rows before the 2026-07 semantic cutoff used the old
            -- "preflight did not block" meaning (over-optimistic TRUE); compare
            -- across the cutoff with care.
            SUM(CASE WHEN preview_success IS TRUE THEN 1 ELSE 0 END)::int AS preview_ready,
            SUM(CASE WHEN preview_success IS FALSE THEN 1 ELSE 0 END)::int AS preview_failed,
            SUM(CASE WHEN preview_success IS NULL THEN 1 ELSE 0 END)::int AS preview_pending,
            SUM(preflight_error_count)::int AS preflight_errors_total,
            SUM(preflight_warning_count)::int AS preflight_warnings_total,
            AVG(duration_ms)::int AS avg_duration_ms
     FROM generation_telemetry WHERE created_at > ${W}`,
  );

  // 7) Quality gate-utfall (telemetri-vyn).
  out.qualityGateResults = await safe(
    "qualityGateResults",
    `SELECT COALESCE(quality_gate_result,'(null)') AS result, COUNT(*)::int AS n
     FROM generation_telemetry WHERE created_at > ${W}
     GROUP BY 1 ORDER BY n DESC`,
  );

  // 8) Per scaffold: volym, preview-utfall, autofix/LLM-fix-frekvens.
  // M#pv1: preview_ready = runtime confirmed ready (preview_success IS TRUE);
  // pending/failed are visible in telemetryTotals, not folded in here.
  out.byScaffold = await safe(
    "byScaffold",
    `SELECT COALESCE(scaffold_id,'(null)') AS scaffold, COUNT(*)::int AS runs,
            SUM(CASE WHEN preview_success IS TRUE THEN 1 ELSE 0 END)::int AS preview_ready,
            SUM(CASE WHEN autofix_applied THEN 1 ELSE 0 END)::int AS autofix_runs,
            SUM(CASE WHEN syntax_fixer_used THEN 1 ELSE 0 END)::int AS llm_fix_runs,
            SUM(preflight_error_count)::int AS preflight_errors
     FROM generation_telemetry WHERE created_at > ${W}
     GROUP BY 1 ORDER BY runs DESC`,
  );

  // 9) Versions-slutlagen: hur manga fastnar i repairing/pending vs passed.
  out.versionStates = await safe(
    "versionStates",
    `SELECT COALESCE(verification_state,'(null)') AS verification_state,
            COALESCE(release_state,'(null)') AS release_state, COUNT(*)::int AS n
     FROM engine_versions WHERE created_at > ${W}
     GROUP BY 1,2 ORDER BY n DESC`,
  );

  // 10) Rena genererings-fel (LLM-strommen sjalv).
  out.generationOutcomes = await safe(
    "generationOutcomes",
    `SELECT success, COUNT(*)::int AS n, AVG(duration_ms)::int AS avg_ms
     FROM engine_generation_logs WHERE created_at > ${W} GROUP BY 1`,
  );

  // 11) Dossier-faktor: telemetry.meta samplas for att se vilka nycklar som finns.
  out.telemetryMetaSample = await safe(
    "telemetryMetaSample",
    `SELECT meta FROM generation_telemetry
     WHERE created_at > ${W} AND meta IS NOT NULL
     ORDER BY created_at DESC LIMIT 3`,
  );

  // 12) Verifier-fasen: kors den eller skippas den (och varfor)?
  out.verifierPhase = await safe(
    "verifierPhase",
    `SELECT COALESCE(meta->'postStreamSteps'->'verifier'->>'status','(saknas)') AS status,
            COALESCE(meta->'postStreamSteps'->'verifier'->>'reason','') AS reason,
            COUNT(*)::int AS n
     FROM generation_telemetry WHERE created_at > ${W}
     GROUP BY 1,2 ORDER BY n DESC`,
  );

  // 13) Autofix fixCount-fordelning over ALLA runs (inte bara heavy-events).
  out.fixCountDistribution = await safe(
    "fixCountDistribution",
    `SELECT width_bucket(COALESCE((meta->'autofix'->>'fixCount')::int, 0), 0, 50, 10) AS bucket,
            MIN(COALESCE((meta->'autofix'->>'fixCount')::int, 0)) AS min_fix,
            MAX(COALESCE((meta->'autofix'->>'fixCount')::int, 0)) AS max_fix,
            COUNT(*)::int AS n
     FROM generation_telemetry WHERE created_at > ${W}
     GROUP BY 1 ORDER BY 1`,
  );

  // 14) Quality gate-utfall per generationMode (init vs followUp).
  out.byGenerationMode = await safe(
    "byGenerationMode",
    `SELECT COALESCE(meta->'buildSpec'->>'generationMode','(saknas)') AS mode,
            COALESCE(quality_gate_result,'(null)') AS result, COUNT(*)::int AS n
     FROM generation_telemetry WHERE created_at > ${W}
     GROUP BY 1,2 ORDER BY 1, n DESC`,
  );

  // 15) Quality gate-utfall per generator-modell (phaseRouting).
  out.byGeneratorModel = await safe(
    "byGeneratorModel",
    `SELECT COALESCE(meta->'phaseRouting'->>'generator','(saknas)') AS generator,
            COALESCE(quality_gate_result,'(null)') AS result, COUNT(*)::int AS n,
            AVG(COALESCE((meta->'autofix'->>'fixCount')::int,0))::numeric(10,1) AS avg_fix_count
     FROM generation_telemetry WHERE created_at > ${W}
     GROUP BY 1,2 ORDER BY 1, n DESC`,
  );

  // 16) Meta-nycklar som finns (for att hitta t.ex. dossier-sparning).
  out.telemetryMetaKeys = await safe(
    "telemetryMetaKeys",
    `SELECT k AS key, COUNT(*)::int AS n
     FROM generation_telemetry, jsonb_object_keys(meta) k
     WHERE created_at > ${W} AND meta IS NOT NULL
     GROUP BY 1 ORDER BY n DESC LIMIT 30`,
  );

  // 17) Server-repair-utfall per kanonisk outcome-taxonomi (Fas 0). Historiska
  //     rader utan meta.outcome faller i bucketen "(historisk/utan-outcome)".
  out.serverRepairOutcomes = await safe(
    "serverRepairOutcomes",
    `SELECT COALESCE(meta->>'outcome','(historisk/utan-outcome)') AS outcome,
            level, COUNT(*)::int AS n, COUNT(DISTINCT version_id)::int AS versions
     FROM engine_version_error_logs
     WHERE category = 'server-repair' AND created_at > ${W}
     GROUP BY 1,2 ORDER BY n DESC`,
  );

  // 18) Deploy-utfall (Fas 0). deploy_result skrivs fran deploy-flodet;
  //     rader utan deploy faller i "(ingen deploy)".
  out.deployOutcomes = await safe(
    "deployOutcomes",
    `SELECT COALESCE(deploy_result,'(ingen deploy)') AS deploy_result, COUNT(*)::int AS n
     FROM generation_telemetry WHERE created_at > ${W}
     GROUP BY 1 ORDER BY n DESC`,
  );

  // 19) Dossier-anvandning (Fas 0). meta.selectedDossierIds ar en array; en rad
  //     per dossier-id via jsonb_array_elements_text.
  out.dossierUsage = await safe(
    "dossierUsage",
    `SELECT d AS dossier_id, COUNT(*)::int AS n
     FROM generation_telemetry, jsonb_array_elements_text(meta->'selectedDossierIds') d
     WHERE created_at > ${W} AND meta ? 'selectedDossierIds'
     GROUP BY 1 ORDER BY n DESC LIMIT 40`,
  );

  // 20) Import-relaterad andel av typecheck-felen (Fas 6-KPI). Samma metod som
  //     baslinjen 2026-07-02: TS-koder regexas ur meta.output pa typecheck-rader
  //     (bade harda och advisory), numerator = importklassen TS2304+TS2300+TS2440,
  //     denominator = alla TSxxxx-traffar. `stats:compare` laser
  //     derivedKpis.importRelatedTypecheckErrorsPct explicit.
  const typecheckOutputs = await safe(
    "typecheckOutputs",
    `SELECT meta->>'output' AS output
     FROM engine_version_error_logs
     WHERE created_at > ${W}
       AND category IN ('quality-gate:typecheck','quality-gate:typecheck-advisory')
       AND meta->>'output' IS NOT NULL
     LIMIT 500`,
  );
  const IMPORT_RELATED_TS_CODES = ["TS2304", "TS2300", "TS2440"];
  const tsCodeCounts = {};
  if (Array.isArray(typecheckOutputs)) {
    for (const row of typecheckOutputs) {
      for (const m of String(row.output ?? "").matchAll(/\bTS(\d{4})\b/g)) {
        const code = `TS${m[1]}`;
        tsCodeCounts[code] = (tsCodeCounts[code] ?? 0) + 1;
      }
    }
  }
  const totalTsCodeHits = Object.values(tsCodeCounts).reduce((a, b) => a + b, 0);
  const importRelatedTsHits = IMPORT_RELATED_TS_CODES.reduce(
    (a, code) => a + (tsCodeCounts[code] ?? 0),
    0,
  );
  out.typecheckTsCodes = tsCodeCounts;
  out.derivedKpis = {
    importRelatedTypecheckErrorsPct:
      totalTsCodeHits > 0
        ? Math.round((importRelatedTsHits / totalTsCodeHits) * 1000) / 10
        : null,
    importRelatedTsHits,
    totalTsCodeHits,
  };

  if (wantJson) process.stdout.write(JSON.stringify(out));
  else console.log(JSON.stringify(out, null, 2));
  process.exit(0);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
