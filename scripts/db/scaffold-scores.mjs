/**
 * Read-only: per-scaffold telemetri-aggregering för backoffice-panelen
 * `Scaffold Performance`. Speglar samma rad-set som `computeScaffoldScores`
 * i `src/lib/gen/scaffolds/scaffold-scoring.ts` MEN exponerar bara råa
 * counters — ingen `compositeScore`-formula för att undvika drift mellan
 * TS-runtime och Python-panelen.
 *
 * Kör:
 *   node scripts/db/scaffold-scores.mjs                # human-readable tabell
 *   node scripts/db/scaffold-scores.mjs --json         # JSON till stdout (för backoffice-panelen)
 *
 * Körs read-only mot DB:n som `.env.local` pekar på.
 *
 * SAJ-57: `scaffoldRetryUsed` är hardcodat `false` i `persist-telemetry.ts`
 * tills upstream signal finns. Det betyder att `retry_count` kommer vara 0
 * på alla rader. Backoffice-panelen visar varning om så är fallet.
 *
 * SAJ-49: rader med `previewSuccess === null` exkluderas från `total` och
 * `success_count` här (matchar TS-versionen efter SAJ-49-fixen). De
 * exponeras separat som `pending_count` så operatören ser hur stor andel
 * runs som aldrig fick en confirmed outcome.
 */
import { config } from "dotenv";
import pg from "pg";
import { normalizeEnvUrl, warnIfProdLikeReadTarget } from "./db-target-guard.mjs";

config({ path: ".env.local" });
warnIfProdLikeReadTarget({ commandName: "scaffold-scores" });

const wantJson = process.argv.includes("--json");
const allowInsecureSsl = process.argv.includes("--allow-insecure-ssl");
const LOOKBACK_DAYS = 30;

const cs = normalizeEnvUrl(
  process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.STORAGE_POSTGRES_URL ||
    process.env.STORAGE_POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL,
);
if (!cs) {
  if (wantJson) {
    process.stdout.write(JSON.stringify({ error: "Database URL missing" }));
  } else {
    console.error("Databas-URL saknas (.env.local / pulled env).");
  }
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

const client = new pg.Client({
  connectionString: url.toString(),
  ssl: resolveSsl(),
});

const QUERY = `
  SELECT
    scaffold_id,
    COUNT(*) FILTER (WHERE preview_success IS NOT NULL)         AS total,
    COUNT(*) FILTER (WHERE preview_success = TRUE)              AS success_count,
    COUNT(*) FILTER (WHERE preview_success IS NULL)             AS pending_count,
    COUNT(*) FILTER (WHERE scaffold_retry_used = TRUE)          AS retry_count,
    COUNT(*) FILTER (WHERE scaffold_selection_method IN ('embedding', 'agreement')) AS embedding_count,
    COUNT(*) FILTER (
      WHERE preview_success IS NOT NULL
        AND user_feedback IS NOT NULL
        AND TRIM(user_feedback) <> ''
    ) AS feedback_total,
    COUNT(*) FILTER (
      WHERE preview_success IS NOT NULL
        AND user_feedback LIKE '%"rating":"positive"%'
    ) AS feedback_positive,
    COALESCE(AVG(preflight_error_count) FILTER (WHERE preview_success IS NOT NULL), 0) AS avg_preflight_errors
  FROM generation_telemetry
  WHERE created_at >= NOW() - ($1::int || ' days')::interval
    AND scaffold_id IS NOT NULL
  GROUP BY scaffold_id
  ORDER BY total DESC, scaffold_id ASC
`;

try {
  await client.connect();
  const result = await client.query(QUERY, [LOOKBACK_DAYS]);
  const rows = result.rows.map((row) => {
    const total = Number(row.total);
    const successCount = Number(row.success_count);
    const pendingCount = Number(row.pending_count);
    const retryCount = Number(row.retry_count);
    const embeddingCount = Number(row.embedding_count);
    const feedbackTotal = Number(row.feedback_total);
    const feedbackPositive = Number(row.feedback_positive);
    const avgPreflightErrors = Number(row.avg_preflight_errors);
    return {
      scaffoldId: row.scaffold_id,
      total,
      successCount,
      pendingCount,
      retryCount,
      embeddingCount,
      feedbackTotal,
      feedbackPositive,
      successRate: total > 0 ? successCount / total : null,
      retryRate: total > 0 ? retryCount / total : null,
      embeddingShare: total > 0 ? embeddingCount / total : null,
      feedbackPositiveRate: feedbackTotal > 0 ? feedbackPositive / feedbackTotal : null,
      avgPreflightErrors,
    };
  });

  const allRetryZero = rows.length > 0 && rows.every((r) => r.retryCount === 0);

  const payload = {
    lookbackDays: LOOKBACK_DAYS,
    generatedAt: new Date().toISOString(),
    scaffolds: rows,
    warnings: allRetryZero
      ? [
          {
            id: "SAJ-57",
            severity: "high",
            message:
              "scaffold_retry_used är 0 på alla scaffolds. persist-telemetry.ts hardcodar fältet till false — historisk retry-rate fungerar inte. Se SAJ-57.",
          },
        ]
      : [],
  };

  if (wantJson) {
    process.stdout.write(JSON.stringify(payload));
  } else {
    console.log(`Lookback: ${LOOKBACK_DAYS} dagar. ${rows.length} scaffolds med data.`);
    console.log("");
    const header = ["scaffold", "total", "success", "rate", "pending", "retry", "embed%", "fb+", "preflight"];
    console.log(header.join("\t"));
    for (const row of rows) {
      console.log(
        [
          row.scaffoldId,
          row.total,
          row.successCount,
          row.successRate != null ? (row.successRate * 100).toFixed(1) + "%" : "-",
          row.pendingCount,
          row.retryCount,
          row.embeddingShare != null ? (row.embeddingShare * 100).toFixed(1) + "%" : "-",
          row.feedbackPositiveRate != null ? (row.feedbackPositiveRate * 100).toFixed(1) + "%" : "-",
          row.avgPreflightErrors.toFixed(1),
        ].join("\t"),
      );
    }
    if (allRetryZero) {
      console.log("");
      console.log("VARNING (SAJ-57): scaffold_retry_used är 0 överallt. Telemetri-fältet är trasigt.");
    }
  }
  process.exit(0);
} catch (err) {
  if (wantJson) {
    process.stdout.write(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  } else {
    console.error("scaffold-scores: query failed:", err instanceof Error ? err.message : err);
  }
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
