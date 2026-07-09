/**
 * Read-only cost estimate over logged LLM token usage.
 *
 * Turns the token volumes in `engine_generation_logs` (default) or
 * `generation_telemetry` into USD/SEK by pricing them with
 * `config/ai_models/pricing.json`. SELECT only; never writes. Mirrors the env
 * handling of control-stats.mjs / dump-logs.mjs.
 *
 * Usage:
 *   node scripts/db/generation-cost.mjs --json
 *   node scripts/db/generation-cost.mjs --json --env=.env.vercel.production.pulled --days=30 --allow-insecure-ssl
 *   node scripts/db/generation-cost.mjs --json --source=telemetry
 *
 * Honesty caveats (surfaced in the payload as `caveats`):
 *  - Input is priced as fully UNCACHED (cached_tokens is not logged today), so
 *    input cost is an UPPER BOUND.
 *  - `engine_generation_logs` carries the finalize/codegen stream call; brief /
 *    verifier / repair sub-LLM calls are not all logged there, so total spend is
 *    a LOWER BOUND on the whole pipeline.
 *  - `--source=telemetry` can double-count repair passes (each creates a new row).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
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
const daysRaw = Number.parseInt(argValue("days", "30"), 10);
const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 365) : 30;
const source = argValue("source", "logs") === "telemetry" ? "telemetry" : "logs";
const tier = argValue("tier", "standard");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRICING_PATH = path.resolve(__dirname, "../../config/ai_models/pricing.json");

function loadPricing() {
  try {
    return JSON.parse(readFileSync(PRICING_PATH, "utf8"));
  } catch (err) {
    return { _error: `pricing.json: ${err instanceof Error ? err.message : String(err)}` };
  }
}

const pricing = loadPricing();

/** Strip provider prefixes + lowercase so DB model strings match pricing keys. */
function normalizeModelId(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^openai\//, "")
    .replace(/^anthropic-direct\//, "")
    .replace(/^anthropic\//, "");
}

/**
 * Longest-substring match so "gpt-5" never shadows "gpt-5.5". Returns the
 * pricing entry + resolved tier rates, or null when unknown.
 */
function priceForModel(rawModel) {
  const models = pricing.models ?? {};
  const norm = normalizeModelId(rawModel);
  if (!norm) return null;
  let best = null;
  let bestLen = 0;
  for (const [key, entry] of Object.entries(models)) {
    const candidates = Array.isArray(entry.match) && entry.match.length ? entry.match : [key];
    for (const c of candidates) {
      const needle = String(c).toLowerCase();
      if (norm.includes(needle) && needle.length > bestLen) {
        best = { key, entry };
        bestLen = needle.length;
      }
    }
  }
  if (!best) return null;
  const tiers = best.entry.tiers ?? {};
  const rates = tiers[tier] ?? tiers.standard ?? null;
  return { key: best.key, entry: best.entry, rates };
}

function usd(n) {
  return Math.round((Number(n) || 0) * 1e6) / 1e6;
}

const parsedEnvFile = config({ path: envPath, quiet: true }).parsed ?? {};
const effectiveEnv = mergeEnvFileOverProcess(parsedEnvFile, process.env);

const cs = normalizeEnvUrl(
  effectiveEnv.POSTGRES_URL ||
    effectiveEnv.POSTGRES_URL_NON_POOLING ||
    effectiveEnv.STORAGE_POSTGRES_URL ||
    effectiveEnv.STORAGE_POSTGRES_URL_NON_POOLING ||
    effectiveEnv.DATABASE_URL,
);

function fail(message) {
  const payload = { ok: false, error: message, envPath, source };
  if (wantJson) {
    process.stdout.write(JSON.stringify(payload, null, 2));
  } else {
    console.error(message);
  }
  process.exit(1);
}

if (pricing._error) fail(pricing._error);
if (!cs) fail(`Databas-URL saknas i ${envPath}.`);

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
const W = `now() - interval '${days} days'`;
const TABLE = source === "telemetry" ? "generation_telemetry" : "engine_generation_logs";

async function safe(label, sql, params = []) {
  try {
    const r = await client.query(sql, params);
    return r.rows;
  } catch (err) {
    return { _error: `${label}: ${err instanceof Error ? err.message : String(err)}` };
  }
}

try {
  await client.connect();

  const usdToSek = Number(pricing.fx?.usdToSek) || null;

  const byModelRaw = await safe(
    "byModel",
    `SELECT model,
            COUNT(*)::int AS rows,
            COALESCE(SUM(prompt_tokens), 0)::bigint AS prompt_tokens,
            COALESCE(SUM(completion_tokens), 0)::bigint AS completion_tokens
     FROM ${TABLE}
     WHERE created_at > ${W}
     GROUP BY model
     ORDER BY prompt_tokens DESC`,
  );

  const byDayRaw = await safe(
    "byDay",
    `SELECT date_trunc('day', created_at)::date AS day,
            model,
            COALESCE(SUM(prompt_tokens), 0)::bigint AS prompt_tokens,
            COALESCE(SUM(completion_tokens), 0)::bigint AS completion_tokens
     FROM ${TABLE}
     WHERE created_at > ${W}
     GROUP BY 1, 2
     ORDER BY 1 DESC, prompt_tokens DESC`,
  );

  if (byModelRaw._error) fail(byModelRaw._error);

  const priceRow = (row) => {
    const p = priceForModel(row.model);
    const promptTokens = Number(row.prompt_tokens) || 0;
    const completionTokens = Number(row.completion_tokens) || 0;
    if (!p || !p.rates) {
      return {
        model: row.model,
        matched: null,
        priced: false,
        rows: Number(row.rows) || 0,
        promptTokens,
        completionTokens,
        inputUsd: 0,
        outputUsd: 0,
        totalUsd: 0,
      };
    }
    const inputUsd = usd((promptTokens / 1e6) * (Number(p.rates.input) || 0));
    const outputUsd = usd((completionTokens / 1e6) * (Number(p.rates.output) || 0));
    return {
      model: row.model,
      matched: p.key,
      label: p.entry.label ?? p.key,
      estimated: Boolean(p.entry.estimated),
      priced: true,
      rows: Number(row.rows) || 0,
      promptTokens,
      completionTokens,
      inputUsd,
      outputUsd,
      totalUsd: usd(inputUsd + outputUsd),
    };
  };

  const byModel = byModelRaw.map(priceRow);
  const unpriced = byModel.filter((m) => !m.priced && (m.promptTokens || m.completionTokens));
  const anyEstimated = byModel.some((m) => m.estimated && m.totalUsd > 0);

  const byDay = Array.isArray(byDayRaw)
    ? byDayRaw.map((row) => {
        const priced = priceRow({ ...row, rows: 0 });
        return {
          day: row.day,
          model: row.model,
          promptTokens: priced.promptTokens,
          completionTokens: priced.completionTokens,
          totalUsd: priced.totalUsd,
        };
      })
    : [];

  const totals = byModel.reduce(
    (acc, m) => {
      acc.promptTokens += m.promptTokens;
      acc.completionTokens += m.completionTokens;
      acc.inputUsd = usd(acc.inputUsd + m.inputUsd);
      acc.outputUsd = usd(acc.outputUsd + m.outputUsd);
      acc.totalUsd = usd(acc.totalUsd + m.totalUsd);
      acc.rows += m.rows;
      return acc;
    },
    { promptTokens: 0, completionTokens: 0, inputUsd: 0, outputUsd: 0, totalUsd: 0, rows: 0 },
  );

  const out = {
    ok: true,
    generatedAt: new Date().toISOString(),
    envPath,
    target: summarizeTarget(inspection.current),
    isProdLike: inspection.isProdLike,
    windowDays: days,
    source,
    sourceTable: TABLE,
    tier,
    pricingVerifiedAt: pricing.verifiedAt ?? null,
    fx: { usdToSek, note: pricing.fx?.note ?? null },
    totals: {
      ...totals,
      totalSek: usdToSek ? usd(totals.totalUsd * usdToSek) : null,
    },
    byModel,
    byDay,
    unpricedModels: unpriced.map((m) => m.model),
    caveats: [
      "Input prissätts som helt OCACHAD (cached_tokens loggas inte) => input-kostnad är en ÖVRE gräns.",
      source === "telemetry"
        ? "source=telemetry kan dubbelräkna repair-pass (en ny rad per pass)."
        : "engine_generation_logs = finalize/codegen-strömmen; brief/verifier/repair-LLM loggas inte alla här => total är en UNDRE gräns för hela pipelinen.",
      anyEstimated ? "Vissa modeller är ESTIMERADE (t.ex. gpt-5.3-codex) — se pricing.json." : null,
    ].filter(Boolean),
  };

  await client.end();

  if (wantJson) {
    process.stdout.write(JSON.stringify(out, null, 2));
  } else {
    console.log(`Kostnad (${source}, ${days}d): $${totals.totalUsd} USD` + (usdToSek ? ` (~${usd(totals.totalUsd * usdToSek)} SEK)` : ""));
    for (const m of byModel) {
      console.log(`  ${m.model}${m.estimated ? " (est)" : ""}: $${m.totalUsd} — in ${m.promptTokens} / out ${m.completionTokens} tok`);
    }
    if (unpriced.length) console.log(`  Oprissatta modeller: ${unpriced.map((m) => m.model).join(", ")}`);
  }
} catch (err) {
  try {
    await client.end();
  } catch {
    // ignore
  }
  fail(err instanceof Error ? err.message : String(err));
}
