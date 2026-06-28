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
  "rename-engine-version-preview-url.sql",
  "add-cascade-engine-chats-project.sql",
  "add-cascade-to-engine-fks.sql",
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
    throw new Error(
      `MIGRATION_ORDER lists migration(s) not found on disk: ${missing.join(", ")}`,
    );
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
