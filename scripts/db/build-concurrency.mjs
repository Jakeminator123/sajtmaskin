/**
 * Read-only: byggintervall för backoffice-sidan "Samtidighet".
 *
 * Ett bygge = en rad i `engine_generation_logs` (skrivs när en version sparats
 * och när en körning dog på leverantörsfel). Intervallet är
 * `[created_at - duration_ms, created_at]` — `duration_ms` mäts från
 * motorströmmens start. Samtidigheten räknas fram i backofficen.
 *
 * Raden skrivs först när bygget är klart, så "pågår nu" uppskattas separat:
 * byggstarter (`prompt_logs` create_chat/follow_up) de senaste
 * OPEN_WINDOW_MINUTES minuterna som ännu saknar en generationsrad för samma
 * chatt. Avbrutna strömmar och plan-lägets turer ger ingen generationsrad och
 * syns därför inte i historiken.
 *
 * Usage:
 *   node scripts/db/build-concurrency.mjs --json
 *   node scripts/db/build-concurrency.mjs --json --env=.env.vercel.production.pulled --days=14 --allow-insecure-ssl
 *
 * SELECT only, inside a READ ONLY transaction.
 */
import { config } from "dotenv";
import pg from "pg";
import { normalizeEnvUrl, inspectDbTarget, summarizeTarget } from "./db-target-guard.mjs";
import { connectionStringForPg, resolveSslConfig } from "./db-ssl.mjs";
import { mergeEnvFileOverProcess } from "./env-merge.mjs";

export const OPEN_WINDOW_MINUTES = 10;
export const MAX_DAYS = 90;

const argv = process.argv.slice(2);
const wantJson = argv.includes("--json");
const allowInsecureSsl = argv.includes("--allow-insecure-ssl");

function argValue(name, fallback = null) {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : fallback;
}

const envPath = argValue("env", ".env.local");
const daysRaw = Number.parseInt(argValue("days", "14"), 10);
const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), MAX_DAYS) : 14;

function emit(payload) {
  if (wantJson) {
    process.stdout.write(JSON.stringify(payload));
  } else if (payload.ok) {
    console.log(
      `${payload.target}: ${payload.builds.length} byggen senaste ${payload.windowDays} d, ` +
        `${payload.openStarts.length} startade utan avslut senaste ${OPEN_WINDOW_MINUTES} min.`,
    );
  } else {
    console.error(payload.error);
  }
}

function fail(message) {
  emit({ ok: false, error: message, envPath });
  process.exit(1);
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
if (!cs) fail(`Databas-URL saknas i ${envPath}.`);

const inspection = inspectDbTarget(effectiveEnv);
const client = new pg.Client({
  connectionString: connectionStringForPg(cs),
  ssl: resolveSslConfig(cs, { allowInsecureSsl, env: effectiveEnv }),
});

try {
  await client.connect();
  await client.query("BEGIN READ ONLY");

  // Rader som slutar inom fönstret; starten kan ligga före fönstret.
  const builds = await client.query(
    `SELECT (extract(epoch FROM created_at) * 1000)::float8 AS end_ms,
            duration_ms,
            success
       FROM engine_generation_logs
      WHERE created_at > now() - make_interval(days => $1::int)
      ORDER BY created_at`,
    [days],
  );

  const openStarts = await client.query(
    `SELECT (extract(epoch FROM p.created_at) * 1000)::float8 AS start_ms, p.event
       FROM prompt_logs p
      WHERE p.event IN ('create_chat', 'follow_up')
        AND p.chat_id IS NOT NULL
        AND p.created_at > now() - make_interval(mins => $1::int)
        AND NOT EXISTS (
          SELECT 1 FROM engine_generation_logs g
           WHERE g.chat_id = p.chat_id AND g.created_at >= p.created_at
        )
      ORDER BY p.created_at`,
    [OPEN_WINDOW_MINUTES],
  );

  const serverNow = await client.query(
    `SELECT (extract(epoch FROM now()) * 1000)::float8 AS now_ms`,
  );

  await client.query("ROLLBACK");
  await client.end();

  emit({
    ok: true,
    generatedAt: new Date().toISOString(),
    envPath,
    target: summarizeTarget(inspection.current),
    isProdLike: inspection.isProdLike,
    windowDays: days,
    nowMs: serverNow.rows[0]?.now_ms ?? Date.now(),
    openWindowMinutes: OPEN_WINDOW_MINUTES,
    builds: builds.rows.map((row) => ({
      endMs: row.end_ms,
      durationMs: row.duration_ms,
      success: row.success,
    })),
    openStarts: openStarts.rows.map((row) => ({ startMs: row.start_ms, event: row.event })),
  });
} catch (err) {
  try {
    await client.end();
  } catch {
    // ignore
  }
  fail(err instanceof Error ? err.message : String(err));
}
