/**
 * Child-process env for `migrate-prod.mjs`.
 *
 * `run-migrations.ts` loads `.env.local` through dotenv, which only fills keys
 * the process env does not already have, and it reads the *_NON_POOLING aliases
 * before POSTGRES_URL. Every alias it could pick is therefore set to the prod
 * URL here; leaving one unset would let a dev value from `.env.local` win and
 * turn the "production" wrapper into a DEV migration.
 */
export const PROD_MIGRATION_URL_KEYS = Object.freeze([
  "POSTGRES_URL_NON_POOLING",
  "STORAGE_POSTGRES_URL_NON_POOLING",
  "POSTGRES_URL",
  "STORAGE_POSTGRES_URL",
  "DATABASE_URL",
]);

/**
 * @param {Record<string, string | undefined>} baseEnv
 * @param {string} prodUrl
 * @returns {Record<string, string | undefined>}
 */
export function buildProdMigrationEnv(baseEnv, prodUrl) {
  return {
    ...baseEnv,
    ...Object.fromEntries(PROD_MIGRATION_URL_KEYS.map((key) => [key, prodUrl])),
    // The explicit prod-write acknowledgement db-target-guard requires.
    DB_ALLOW_PROD_LIKE_WRITE: "1",
    // Supabase presents a self-signed cert chain.
    DB_SSL_REJECT_UNAUTHORIZED: "false",
  };
}
