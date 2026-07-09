/**
 * Read-only: visa info om den/de senaste genererade användarsidorna.
 *
 * Slår ihop engine_versions + engine_chats och berikar med generation_telemetry,
 * engine_version_error_logs och error_log_events (RAG-snuttar) när de finns.
 *
 *   npm run db:latest                # senaste sidan (läser .env.local)
 *   npm run db:latest -- --limit 3   # tre senaste
 *   npm run db:latest -- --prod      # läs RIKTIGA prod-DB (.env.vercel.production.pulled)
 *
 * Ingen skrivning. Läser POSTGRES_URL (eller alias) från .env.local som standard.
 * --prod läser .env.vercel.production.pulled i stället och tillåter self-signed
 * cert automatiskt. Hämta filen först med:
 *   vercel env pull .env.vercel.production.pulled --environment=production --yes
 * Self-signed prod-cert utan --prod: sätt DB_SSL_REJECT_UNAUTHORIZED=false eller --allow-insecure-ssl.
 */
import fs from "node:fs";
import { config } from "dotenv";
import pg from "pg";
import { normalizeEnvUrl, warnIfProdLikeReadTarget } from "./db-target-guard.mjs";
import { formatLogTimestamp, LOG_TIMESTAMP_NOTE } from "./log-timestamp.mjs";

const useProd = process.argv.includes("--prod");
const PROD_ENV_FILE = ".env.vercel.production.pulled";
const envFile = useProd ? PROD_ENV_FILE : ".env.local";

if (useProd && !fs.existsSync(PROD_ENV_FILE)) {
  console.error(
    `--prod kraver ${PROD_ENV_FILE}. Hamta den forst:\n` +
      `  vercel env pull ${PROD_ENV_FILE} --environment=production --yes`,
  );
  process.exit(1);
}

// --prod overrider ev. redan satt POSTGRES_URL i shellet sa prod-filen alltid vinner.
config({ path: envFile, override: useProd });
warnIfProdLikeReadTarget({ commandName: "db:latest" });

// --prod implicerar insecure SSL (prod-Supabase pooler anvander self-signed cert).
const allowInsecureSsl = useProd || process.argv.includes("--allow-insecure-ssl");
const limitArgIdx = process.argv.indexOf("--limit");
const limit =
  limitArgIdx !== -1 ? Math.max(1, Math.min(Number(process.argv[limitArgIdx + 1]) || 1, 25)) : 1;

const cs = normalizeEnvUrl(
  process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.STORAGE_POSTGRES_URL ||
    process.env.STORAGE_POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL,
);
if (!cs) {
  console.error(`Databas-URL saknas (${envFile}).`);
  process.exit(1);
}

const url = new URL(cs);
url.searchParams.delete("sslmode");
url.searchParams.delete("supa");

function resolveSsl() {
  const raw = process.env.DB_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase();
  if (raw === "false" || allowInsecureSsl) return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

const pool = new pg.Pool({ connectionString: url.toString(), ssl: resolveSsl() });

async function tableExists(name) {
  const r = await pool.query(
    `select 1 from information_schema.tables where table_schema = 'public' and table_name = $1 limit 1`,
    [name],
  );
  return r.rowCount === 1;
}

/** Best-effort query: returns [] when the table is missing or the query fails. */
async function safeRows(sql, params) {
  try {
    const r = await pool.query(sql, params);
    return r.rows;
  } catch {
    return [];
  }
}

function line(label, value) {
  if (value === null || value === undefined || value === "") return;
  console.log(`  ${label}: ${value}`);
}

try {
  console.log(`db:latest -> ${url.hostname}/${url.pathname.replace(/^\//, "") || "postgres"}`);
  console.log(LOG_TIMESTAMP_NOTE);

  if (!(await tableExists("engine_versions"))) {
    console.log("Tabellen engine_versions saknas i denna databas.");
    await pool.end();
    process.exit(0);
  }

  const versions = await safeRows(
    `select v.id, v.chat_id, v.version_number, v.release_state, v.verification_state,
            v.lifecycle_stage, v.preview_url, v.created_at,
            c.title, c.project_id, c.model, c.scaffold_id
     from engine_versions v
     left join engine_chats c on c.id = v.chat_id
     order by v.created_at desc
     limit $1`,
    [limit],
  );

  if (versions.length === 0) {
    console.log("engine_versions är tom (inga persisterade sajter) — visar prompt_logs i stället.");
  }

  const hasTelemetry = await tableExists("generation_telemetry");
  const hasVersionErrors = await tableExists("engine_version_error_logs");
  const hasErrorLogEvents = await tableExists("error_log_events");

  for (const v of versions) {
    console.log("\n" + "=".repeat(70));
    console.log(`SIDA: ${v.title || "(namnlös)"}  ·  ${formatLogTimestamp(v.created_at)}`);
    console.log("=".repeat(70));
    line("chatId", v.chat_id);
    line("projectId", v.project_id);
    line("versionId", v.id);
    line("versionNumber", v.version_number);
    line("model", v.model);
    line("scaffoldId", v.scaffold_id);
    line("releaseState", v.release_state);
    line("verificationState", v.verification_state);
    line("lifecycleStage", v.lifecycle_stage);
    line("previewUrl", v.preview_url);

    if (hasTelemetry) {
      const [t] = await safeRows(
        `select build_intent, build_method, prompt_classification, model_tier,
                retry_count, autofix_applied, syntax_fixer_used,
                preflight_error_count, preflight_warning_count, seo_issue_count,
                preview_success, preview_blocking_reason, quality_gate_result,
                deploy_result, duration_ms, prompt_tokens, completion_tokens,
                file_count, scaffold_selection_method, scaffold_selection_confidence,
                user_feedback
         from generation_telemetry
         where version_id = $1
         order by created_at desc
         limit 1`,
        [v.id],
      );
      if (t) {
        console.log("  -- telemetri --");
        line("buildIntent", t.build_intent);
        line("buildMethod", t.build_method);
        line("promptClassification", t.prompt_classification);
        line("modelTier", t.model_tier);
        line("retryCount", t.retry_count);
        line("autofixApplied", t.autofix_applied);
        line("syntaxFixerUsed", t.syntax_fixer_used);
        line("preflightErrors", t.preflight_error_count);
        line("preflightWarnings", t.preflight_warning_count);
        line("seoIssues", t.seo_issue_count);
        line("previewSuccess", t.preview_success);
        line("previewBlockingReason", t.preview_blocking_reason);
        line("qualityGateResult", t.quality_gate_result);
        line("deployResult", t.deploy_result);
        line("durationMs", t.duration_ms);
        line("promptTokens", t.prompt_tokens);
        line("completionTokens", t.completion_tokens);
        line("fileCount", t.file_count);
        line("scaffoldSelectionMethod", t.scaffold_selection_method);
        line("scaffoldSelectionConfidence", t.scaffold_selection_confidence);
        line("userFeedback", t.user_feedback);
      }
    }

    if (hasVersionErrors) {
      const errs = await safeRows(
        `select level, category, message, created_at
         from engine_version_error_logs
         where version_id = $1
         order by created_at desc
         limit 5`,
        [v.id],
      );
      if (errs.length > 0) {
        console.log(`  -- engine_version_error_logs (${errs.length}) --`);
        for (const e of errs) {
          console.log(
            `    [${formatLogTimestamp(e.created_at)}] [${e.level}${e.category ? "/" + e.category : ""}] ${String(e.message).slice(0, 160)}`,
          );
        }
      }
    }

    if (hasErrorLogEvents) {
      const rag = await safeRows(
        `select generation_mode, fault, fix_text, result, created_at
         from error_log_events
         where chat_id = $1
         order by created_at desc
         limit 5`,
        [v.chat_id],
      );
      if (rag.length > 0) {
        console.log(`  -- error_log_events / RAG (${rag.length}) --`);
        for (const r of rag) {
          const fix = r.fix_text ? ` -> fix: ${String(r.fix_text).slice(0, 80)}` : "";
          console.log(
            `    [${formatLogTimestamp(r.created_at)}] [${r.generation_mode ?? "?"}] ${r.fault} (${r.result ?? "-"})${fix}`,
          );
        }
      }
    }
  }

  // prompt_logs: den breda prod-loggen (en rad per användarprompt — init + follow-up).
  if (await tableExists("prompt_logs")) {
    const prompts = await safeRows(
      `select event, created_at, build_intent, build_method, model_tier,
              prompt_assist_mode, thinking, attachments_count, chat_id, app_project_id,
              user_id, prompt_original
       from prompt_logs
       order by created_at desc
       limit $1`,
      [limit],
    );
    if (prompts.length > 0) {
      console.log("\n" + "=".repeat(70));
      console.log(`SENASTE PROMPTS (prompt_logs, ${prompts.length})`);
      console.log("=".repeat(70));
      for (const p of prompts) {
        console.log(`\n[${formatLogTimestamp(p.created_at)}] event=${p.event}`);
        line("buildIntent", p.build_intent);
        line("buildMethod", p.build_method);
        line("modelTier", p.model_tier);
        line("promptAssistMode", p.prompt_assist_mode);
        line("thinking", p.thinking);
        line("attachments", p.attachments_count);
        line("chatId", p.chat_id);
        line("appProjectId", p.app_project_id);
        line("userId", p.user_id);
        if (p.prompt_original) console.log(`  prompt: ${String(p.prompt_original).slice(0, 200)}`);
      }
    }
  }

  console.log("");
  await pool.end();
} catch (e) {
  console.error("db_latest_error:", e instanceof Error ? e.message : String(e));
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
}
