/**
 * Read-only cost estimate over logged LLM token usage.
 *
 * Default source is `llm_usage` (alla faser). `--source=logs` / `--source=telemetry`
 * är äldre codegen-tabeller för jämförelse. SELECT only; never writes.
 *
 * Usage:
 *   node scripts/db/generation-cost.mjs --json
 *   node scripts/db/generation-cost.mjs --json --env=.env.vercel.production.pulled --days=30 --allow-insecure-ssl
 *   node scripts/db/generation-cost.mjs --json --source=logs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "dotenv";
import pg from "pg";
import { normalizeEnvUrl, inspectDbTarget, summarizeTarget } from "./db-target-guard.mjs";
import { mergeEnvFileOverProcess } from "./env-merge.mjs";
import {
  groupCostUsd,
  resolveCostBasis,
  priceUsageRow,
  resolveCostSource,
  sourceTableName,
  usd,
} from "./generation-cost-price.mjs";

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
const source = resolveCostSource(argValue("source", "usage"));
const tier = argValue("tier", "standard");
const TABLE = sourceTableName(source);

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

async function safe(label, sql, params = []) {
  try {
    const r = await client.query(sql, params);
    return r.rows;
  } catch (err) {
    return { _error: `${label}: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function toUsageRow(row) {
  if (source === "usage") {
    return {
      model: row.model,
      phase: row.phase || "unknown",
      rows: row.rows,
      inputTokens: row.input_tokens,
      cachedInputTokens: row.cached_input_tokens,
      cacheWriteTokens: row.cache_write_tokens,
      outputTokens: row.output_tokens,
      reasoningTokens: row.reasoning_tokens,
      ledgerMicroUsd: row.cost_microusd,
      ledgerRows: row.ledger_rows,
      unledgeredBillableRows: row.unledgered_billable_rows,
    };
  }
  return {
    model: row.model,
    phase: "codegen",
    rows: row.rows,
    inputTokens: row.prompt_tokens,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: row.completion_tokens,
    reasoningTokens: 0,
    ledgerMicroUsd: 0,
    ledgerRows: 0,
    unledgeredBillableRows: 0,
  };
}

function attachLedger(priced, raw) {
  const ledgerUsd = usd((Number(raw.ledgerMicroUsd) || 0) / 1e6);
  return {
    ...priced,
    // Token-priced estimate. The input/cache/output parts add up to this.
    // `totalUsd` sätts senare, när periodens kostnadsgrund är känd.
    pricedUsd: priced.totalUsd,
    ledgerUsd,
    ledgerRows: Math.min(Number(raw.rows) || 0, Number(raw.ledgerRows) || 0),
    unledgeredBillableRows: Math.min(
      Number(raw.rows) || 0,
      Number(raw.unledgeredBillableRows) || 0,
    ),
  };
}

try {
  await client.connect();

  const usdToSek = Number(pricing.fx?.usdToSek) || null;
  const usageSelect = `COALESCE(NULLIF(BTRIM(model), ''), 'unknown') AS model,
            COALESCE(NULLIF(BTRIM(phase), ''), 'unknown') AS phase,
            COUNT(*)::int AS rows,
            COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
            COALESCE(SUM(cached_input_tokens), 0)::bigint AS cached_input_tokens,
            COALESCE(SUM(cache_write_tokens), 0)::bigint AS cache_write_tokens,
            COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
            COALESCE(SUM(reasoning_tokens), 0)::bigint AS reasoning_tokens,
            COALESCE(SUM(cost_microusd) FILTER (WHERE cost_microusd IS NOT NULL), 0)::bigint AS cost_microusd,
            COUNT(*) FILTER (WHERE cost_microusd IS NOT NULL)::int AS ledger_rows,
            COUNT(*) FILTER (
              WHERE cost_microusd IS NULL
                AND COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) > 0
            )::int AS unledgered_billable_rows`;
  const legacySelect = `model,
            COUNT(*)::int AS rows,
            COALESCE(SUM(prompt_tokens), 0)::bigint AS prompt_tokens,
            COALESCE(SUM(completion_tokens), 0)::bigint AS completion_tokens`;

  const byModelRaw = await safe(
    "byModel",
    source === "usage"
      ? `SELECT ${usageSelect}
         FROM ${TABLE}
         WHERE created_at > ${W}
         GROUP BY 1, 2
         ORDER BY COALESCE(SUM(input_tokens), 0) + COALESCE(SUM(output_tokens), 0) DESC`
      : `SELECT ${legacySelect}
         FROM ${TABLE}
         WHERE created_at > ${W}
         GROUP BY model
         ORDER BY prompt_tokens DESC`,
  );

  const byDayRaw = await safe(
    "byDay",
    source === "usage"
      ? `SELECT date_trunc('day', created_at)::date AS day,
                ${usageSelect}
         FROM ${TABLE}
         WHERE created_at > ${W}
         GROUP BY 1, 2, 3
         ORDER BY 1 DESC, COALESCE(SUM(input_tokens), 0) + COALESCE(SUM(output_tokens), 0) DESC`
      : `SELECT date_trunc('day', created_at)::date AS day,
                model,
                COALESCE(SUM(prompt_tokens), 0)::bigint AS prompt_tokens,
                COALESCE(SUM(completion_tokens), 0)::bigint AS completion_tokens
         FROM ${TABLE}
         WHERE created_at > ${W}
         GROUP BY 1, 2
         ORDER BY 1 DESC, prompt_tokens DESC`,
  );

  if (byModelRaw._error) fail(byModelRaw._error);

  const byModelPriced = byModelRaw.map((row) => {
    const usage = toUsageRow(row);
    return attachLedger(priceUsageRow(pricing, usage, tier, { applyLongContext: false }), usage);
  });

  // Basen bestäms en gång för hela perioden. Därefter är varje tabell en ren
  // summa av samma sorts tal, så modell-, fas- och dagsvyerna kan inte gå isär
  // från rubriken.
  const costBasis = resolveCostBasis(byModelPriced);
  const byModel = byModelPriced.map((row) => ({
    ...row,
    totalUsd: groupCostUsd(row, costBasis.basis),
  }));

  // Full ledgertäckning gör totalen exakt, men den gör inte modellen prissatt.
  // En modell som saknas i pricing.json är fortfarande ett hål i prisfilen —
  // delposterna och uppskattningen blir fel för den. Listan är därför
  // oberoende av basen; det är formuleringen i vyn som skiljer på "kostnaden
  // saknas" och "priset saknas".
  const unpriced = byModel.filter((m) => !m.priced && (m.promptTokens || m.completionTokens));
  const anyEstimated = byModel.some((m) => m.estimated && m.totalUsd > 0);

  const byPhaseMap = new Map();
  for (const row of byModel) {
    const key = row.phase || "unknown";
    const acc = byPhaseMap.get(key) ?? {
      phase: key,
      rows: 0,
      promptTokens: 0,
      cachedInputTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      pricedUsd: 0,
      totalUsd: 0,
      ledgerUsd: 0,
      ledgerRows: 0,
    };
    acc.rows += row.rows;
    acc.promptTokens += row.promptTokens;
    acc.cachedInputTokens += row.cachedInputTokens;
    acc.completionTokens += row.completionTokens;
    acc.reasoningTokens += row.reasoningTokens;
    acc.pricedUsd = usd(acc.pricedUsd + row.pricedUsd);
    acc.ledgerUsd = usd(acc.ledgerUsd + (row.ledgerUsd || 0));
    acc.ledgerRows += row.ledgerRows || 0;
    acc.totalUsd = usd(acc.totalUsd + row.totalUsd);
    byPhaseMap.set(key, acc);
  }
  const byPhase = [...byPhaseMap.values()].sort((a, b) => b.totalUsd - a.totalUsd);

  const byDay = Array.isArray(byDayRaw)
    ? byDayRaw.map((row) => {
        const usage = toUsageRow(row);
        const priced = attachLedger(
          priceUsageRow(pricing, usage, tier, { applyLongContext: false }),
          usage,
        );
        return {
          day: row.day,
          model: row.model,
          phase: usage.phase,
          promptTokens: priced.promptTokens,
          cachedInputTokens: priced.cachedInputTokens,
          completionTokens: priced.completionTokens,
          // Samma bas som rubriken. Dagsraderna är en finare partition av
          // exakt samma anrop, så summan blir densamma.
          totalUsd: groupCostUsd(priced, costBasis.basis),
        };
      })
    : [];

  const totals = byModel.reduce(
    (acc, m) => {
      acc.promptTokens += m.promptTokens;
      acc.uncachedInputTokens += m.uncachedInputTokens;
      acc.cachedInputTokens += m.cachedInputTokens;
      acc.cacheWriteTokens += m.cacheWriteTokens;
      acc.completionTokens += m.completionTokens;
      acc.reasoningTokens += m.reasoningTokens;
      acc.inputUsd = usd(acc.inputUsd + m.inputUsd);
      acc.cachedUsd = usd(acc.cachedUsd + m.cachedUsd);
      acc.cacheWriteUsd = usd(acc.cacheWriteUsd + m.cacheWriteUsd);
      acc.outputUsd = usd(acc.outputUsd + m.outputUsd);
      acc.ledgerUsd = usd(acc.ledgerUsd + (m.ledgerUsd || 0));
      acc.rows += m.rows;
      return acc;
    },
    {
      promptTokens: 0,
      uncachedInputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      inputUsd: 0,
      cachedUsd: 0,
      cacheWriteUsd: 0,
      outputUsd: 0,
      ledgerUsd: 0,
      rows: 0,
    },
  );

  // Basen är redan bestämd ovan. Delposterna (input/cache/output) är alltid
  // token-uppskattning och summerar till `estimateUsd` — i ledger-läget är det
  // avsiktligt en annan siffra än `totalUsd`, och skillnaden är long-context.
  totals.totalUsd = costBasis.totalUsd;
  totals.estimateUsd = costBasis.estimateUsd;
  totals.costBasis = costBasis.basis;
  totals.ledgerRows = costBasis.ledgerRows;
  totals.rowsWithoutLedger = costBasis.rowsWithoutLedger;
  totals.unledgeredBillableRows = costBasis.unledgeredBillableRows;

  const caveats = [];
  if (source === "usage") {
    caveats.push(
      "Källa: llm_usage (alla faser). Cache-träffar prissätts med cachedInput; reasoning ingår i output och räknas inte två gånger. Long-context-påslag sitter i ledgern per anrop — inte på summerade tokens.",
    );
    if (totals.costBasis === "ledger") {
      caveats.push(
        `Totalen kommer ur ledgern (cost_microusd) — varje anrop med tokens är täckt. Delposterna är token-uppskattning mot dagens pricing.json och summerar till $${totals.estimateUsd}; skillnaden är long-context-påslaget plus eventuell prisdrift sedan anropen gjordes.`,
      );
    } else if (totals.costBasis === "partial") {
      caveats.push(
        `UPPSKATTNING: ${totals.unledgeredBillableRows} av ${totals.rows} anrop med tokens saknar cost_microusd, så totalen räknas från tokens och saknar long-context-påslag. Ledgern för de täckta anropen är $${totals.ledgerUsd}. Totalen blir exakt när varje anrop med tokens bär ledgervärde.`,
      );
    } else {
      caveats.push(
        "UPPSKATTNING: inget anrop i perioden har cost_microusd, så totalen räknas från tokens och saknar long-context-påslag.",
      );
    }
  } else if (source === "telemetry") {
    caveats.push("source=telemetry kan dubbelräkna repair-pass (en ny rad per pass).");
    caveats.push("Äldre codegen-tabell — missar brief/verifier/fixer/planner. Använd source=usage för hela notan.");
  } else {
    caveats.push(
      "engine_generation_logs är bara codegen-strömmen. Cache prissätts som ocachad här. Använd source=usage för hela notan.",
    );
  }
  if (anyEstimated) {
    caveats.push("Vissa modeller är ESTIMERADE (t.ex. gpt-5.3-codex) — se pricing.json.");
  }

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
    byPhase,
    byDay,
    unpricedModels: unpriced.map((m) => m.model),
    caveats,
  };

  await client.end();

  if (wantJson) {
    process.stdout.write(JSON.stringify(out, null, 2));
  } else {
    const basisLabel =
      totals.costBasis === "ledger"
        ? "ledger"
        : totals.costBasis === "partial"
          ? `uppskattning — ledger saknas på ${totals.rowsWithoutLedger} av ${totals.rows} anrop`
          : "uppskattning";
    console.log(
      `Kostnad (${source}, ${days}d, ${basisLabel}): $${totals.totalUsd} USD` +
        (usdToSek ? ` (~${usd(totals.totalUsd * usdToSek)} SEK)` : ""),
    );
    for (const m of byModel) {
      const phase = m.phase ? ` [${m.phase}]` : "";
      console.log(
        `  ${m.model}${phase}${m.estimated ? " (est)" : ""}: $${m.totalUsd} — in ${m.promptTokens} / out ${m.completionTokens} tok`,
      );
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
