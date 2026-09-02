/**
 * Single source of truth for the hand-written SQL migration apply order.
 *
 * Consumed by BOTH entry points so they can never drift into two different
 * orderings again:
 *   - `scripts/db/run-migrations.ts`  (`npm run db:migrate`, run via tsx)
 *   - `scripts/db/db-init.mjs`        (`npm run db:init`, run via plain node)
 *
 * History: BUG-SWARM rank 10 fixed `run-migrations.ts` (it used a fragile
 * `readdir(...).sort()` alphabetical order) by introducing an explicit,
 * drift-checked manifest. But `db-init.mjs` kept its OWN 2-entry
 * `dependencyOrder` + alphabetical `.sort()` fallback, so the two scripts could
 * apply the same migrations in different orders. This module collapses both onto
 * one manifest. `db-init.mjs` can import it because it is `.mjs` (plain ESM,
 * no TypeScript), and `run-migrations.ts` imports it the same way it already
 * imports `./db-target-guard.mjs`.
 *
 * The filenames carry no numeric/timestamp prefix, so plain alphabetical order
 * is NOT dependency-aware (e.g. `add-generation-telemetry-scaffold-selection.sql`
 * — an ALTER — sorts BEFORE `add-generation-telemetry.sql` — its CREATE —
 * because '-' (0x2D) < '.' (0x2E)). This manifest fixes the order once: base
 * creates before alters; FK-cascade rewrites last. Statements stay idempotent
 * (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`), so re-running in this order is
 * safe.
 *
 * @type {readonly string[]}
 */
export const MIGRATION_ORDER = [
  "add-collaboration-tables.sql",
  "add-generation-telemetry.sql",
  "add-generation-telemetry-scaffold-selection.sql",
  "add-error-log-events.sql",
  "add-engine-chat-orchestration-snapshot.sql",
  "add-engine-message-thinking.sql",
  "add-engine-version-lifecycle-stage.sql",
  "add-engine-version-edit-kind.sql",
  "add-engine-version-repair-state.sql",
  "add-engine-versions-chat-version-unique.sql",
  "add-engine-version-jobs.sql",
  "add-transactions-stripe-session-unique.sql",
  // B1: one durable credit entitlement per wizard run, shared by lookup,
  // competitors and every enrich/prefetch request.
  "add-transactions-idempotency-key.sql",
  // B1 follow-up: server-owned wizard_runs. Start creates the row and
  // debits once (idempotency_key = run id). Wizard routes authorize the
  // run; a client-invented UUID is never a valid entitlement.
  "add-wizard-runs.sql",
  "rename-engine-version-preview-url.sql",
  "add-cascade-engine-chats-project.sql",
  "add-cascade-to-engine-fks.sql",
  "add-oc-debug-findings.sql",
  "add-llm-usage.sql",
  // Usage-baserad kostnad/debitering bygger på llm_usage och lägger dessutom
  // till cache_write_tokens på bastabellen.
  "add-generation-billing.sql",
  // Persistenta request-claim-nycklar gör att en avbruten usage-attach kan
  // köras om exakt. Egen fil krävs eftersom billing-migrationen redan har
  // ledgerförts i dev; färska databaser får kolumnen från basfilen ovan.
  "add-generation-billing-claim-keys.sql",
  // Explicitly separates successful generation markers from markers created
  // only to bill historical/imported post-processing. This follow-up runs
  // after the already-ledgered claim-key migration in existing dev databases.
  "add-generation-billing-free-eligibility.sql",
  // Existing databases may already have ledgered every earlier billing
  // migration. This nullable per-marker lower bound prevents a newly created
  // historical repair marker from charging the version's old usage.
  "add-generation-billing-usage-start.sql",
  "add-app-projects-vercel-project.sql",
  "add-branded-site-domains.sql",
  "drop-deployments-legacy-fks.sql",
  // v2 exists ONLY because the ledger tracks filenames: v1 was applied +
  // recorded with hardcoded constraint names before its body was upgraded to
  // the catalog-based drop (PR #431), so already-migrated DBs would never
  // re-run it. The new filename is pending there and forces one re-run.
  "drop-deployments-legacy-fks-v2.sql",
  // Converts TIMESTAMP WITHOUT TIME ZONE → TIMESTAMPTZ for tables whose
  // original migration SQL used bare TIMESTAMP. Guards via information_schema
  // so it is a no-op on fresh installs (where the source SQL already uses
  // TIMESTAMPTZ after this PR).
  "fix-timestamp-tz.sql",
  // Durable role-level UTC timezone (M#pg1). Replaces the per-connection
  // `SET TIME ZONE` in client.ts, which both triggered the pg client.query()
  // overlap warning and was unreliable behind Supavisor transaction pooling.
  "set-role-timezone-utc.sql",
  // Innehållsrevision: DB-genererad md5 av files_json på engine_versions, och
  // den revision ett verdikt bedömde på generation_telemetry. Additiv — ingen
  // läsare ändrar beteende förrän planens steg 3.
  "add-files-revision.sql",
  // Inbox för inkommande OpenAI plattforms-webhooks (POST /api/webhooks/openai).
  // Fristående CREATE — inga beroenden på andra tabeller.
  "add-openai-webhook-events.sql",
  // Scaffold-variant (stilriktning) per generation — samma selektionsyta som
  // scaffold_selection_*. Additiv ALTER; basen skapas tidigare i ordningen.
  "add-generation-telemetry-variant-id.sql",
  // Domänköp: adopterar den vilande `domain_orders`-tabellen (skapad av
  // db-init.mjs, utan egen migration) och lägger till orderkolumnerna plus de
  // två unika index som gör dubbelköp/dubbeldebitering omöjligt. Innehåller
  // ett eget CREATE TABLE IF NOT EXISTS så en databas som aldrig kört db-init
  // också får tabellen.
  "add-domain-purchase-orders.sql",
  // Dossier-env rehydrering: valda dossiers env-nycklar persisteras per
  // version så force-restart/quick-edit-fallback bygger samma F2 mock-seedade
  // .env.local som första boot. Additiv nullable jsonb; basen skapas tidigare.
  "add-engine-version-selected-dossier-env-keys.sql",
  // Inbox för Vercel Log Drain-leveranser (POST /api/drains/vercel) — gör
  // appens console.warn/error läsbara för /logg via SQL i stället för bara
  // `vercel logs`. Fristående CREATE — inga beroenden på andra tabeller.
  "add-vercel-log-drain-events.sql",
  // SM-070: persistad OpenClaw-grant + idempotent live-review-claim per
  // (version_id, files_revision). Additiv CREATE; FK mot engine_chats.
  "add-live-review-gate.sql",
  // Live dev↔prod-paritet (2026-08-05): prod-tabeller födda under äldre
  // CREATE TABLE-definitioner får dagens form (TIMESTAMPTZ, UNIQUE/FK-
  // constraints), dev tappar redundanta dubblett-index. Allt guardat via
  // kataloguppslag — no-op på färska installationer. Sist i ordningen:
  // den förutsätter att alla baser + tidigare alters redan körts.
  "align-live-schema-parity.sql",
  // SM-057: migrationsledgern själv låg utan RLS i ett schema där default-
  // privilegier ger anon/authenticated alla rättigheter, så den kunde skrivas
  // och TRUNCATE:as med den publika anon-nyckeln. Körs sist eftersom den bara
  // rör ledgern (som redan finns när migrationer körs) och inte får blockera
  // någon schemaändring före sig.
  "harden-schema-migrations-ledger.sql",
];

/**
 * Returns the `.sql` migrations from `filesOnDisk` in canonical apply order.
 *
 * Throws when the manifest and the directory drift apart in either direction:
 *  - a `.sql` file on disk that is missing from {@link MIGRATION_ORDER}
 *    (forces every new migration to be slotted in at a deliberate position), or
 *  - a manifest entry with no matching file on disk.
 *
 * Pure (no IO) so it is unit-testable against a real directory listing.
 *
 * @param {string[]} filesOnDisk
 * @returns {string[]}
 */
export function resolveMigrationRunOrder(filesOnDisk) {
  const sqlOnDisk = filesOnDisk.filter((f) => f.endsWith(".sql"));
  const listed = new Set(MIGRATION_ORDER);
  const onDisk = new Set(sqlOnDisk);

  const unlisted = sqlOnDisk.filter((f) => !listed.has(f));
  if (unlisted.length > 0) {
    throw new Error(
      `Migration file(s) not registered in MIGRATION_ORDER — add them at the ` +
        `correct dependency position in scripts/db/migration-order.mjs: ${unlisted.join(", ")}`,
    );
  }

  const missing = MIGRATION_ORDER.filter((f) => !onDisk.has(f));
  if (missing.length > 0) {
    throw new Error(`MIGRATION_ORDER lists migration(s) not found on disk: ${missing.join(", ")}`);
  }

  return [...MIGRATION_ORDER];
}

/**
 * Postgres SQLSTATE codes that all mean "this object already exists", i.e. the
 * migration statement is a safe no-op on a database where it was applied before.
 *
 * Matching on the stable SQLSTATE is locale-proof — unlike substring-matching
 * the English error text ("already exists"), which breaks the moment the server
 * runs with a non-English `lc_messages`.
 *
 * @type {ReadonlySet<string>}
 */
export const ALREADY_EXISTS_SQLSTATES = new Set([
  "42P07", // duplicate_table (also relations: view, sequence, index)
  "42P06", // duplicate_schema
  "42710", // duplicate_object (constraint, trigger, opclass, ...)
  "42701", // duplicate_column
  "42723", // duplicate_function
]);

/**
 * True when `err` represents an "object already exists" outcome — either via a
 * known Postgres SQLSTATE ({@link ALREADY_EXISTS_SQLSTATES}) or, as a fallback,
 * the English message substring. Used to treat a re-run migration statement as
 * already-applied instead of fatal, WITHOUT swallowing unrelated failures.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isAlreadyExistsError(err) {
  if (err && typeof err === "object" && "code" in err) {
    const code = /** @type {{ code?: unknown }} */ (err).code;
    if (typeof code === "string" && ALREADY_EXISTS_SQLSTATES.has(code)) {
      return true;
    }
  }
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("already exists");
}
