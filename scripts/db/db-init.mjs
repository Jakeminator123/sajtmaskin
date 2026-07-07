import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { Pool } from "pg";
import { config } from "dotenv";
import { assertSafeWriteTarget, normalizeEnvUrl } from "./db-target-guard.mjs";
import {
  resolveMigrationRunOrder,
  isAlreadyExistsError,
} from "./migration-order.mjs";
import {
  ensureMigrationLedger,
  recordAppliedMigration,
} from "./migration-ledger.mjs";

config({ path: ".env.local" });

assertSafeWriteTarget({ commandName: "db:init" });

const connectionString = normalizeEnvUrl(
  process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.STORAGE_POSTGRES_URL ||
    process.env.STORAGE_POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL,
);

if (!connectionString) {
  console.error("Missing database connection URL.");
  console.error(
    "Set POSTGRES_URL/POSTGRES_URL_NON_POOLING or STORAGE_POSTGRES_URL/STORAGE_POSTGRES_URL_NON_POOLING.",
  );
  process.exit(1);
}

// Parse connection string to handle SSL properly with Supabase pooler
const url = new URL(connectionString);

// Check sslmode before removing it from the URL
const sslMode = url.searchParams.get("sslmode")?.trim().toLowerCase() || null;

// Remove sslmode from search params - we handle it via ssl option
url.searchParams.delete("sslmode");
url.searchParams.delete("supa");

// Resolve SSL config: handle sslmode=disable explicitly, otherwise use env var
let sslConfig;
if (sslMode === "disable") {
  sslConfig = false;
} else {
  sslConfig = {
    rejectUnauthorized:
      process.env.DB_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase() !== "false",
  };
}

const pool = new Pool({
  connectionString: url.toString(),
  ssl: sslConfig,
  // Fail fast at dev start: never let predev hang if the DB is slow/unreachable.
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
  query_timeout: 15000,
});
const MIGRATIONS_DIR = join(process.cwd(), "src/lib/db/migrations");

const setupQueries = [
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    v0_project_id TEXT NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    v0_chat_id TEXT NOT NULL UNIQUE,
    v0_project_id TEXT NOT NULL,
    web_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS versions (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    v0_version_id TEXT NOT NULL,
    v0_message_id TEXT,
    demo_url TEXT,
    metadata JSONB,
    pinned BOOLEAN DEFAULT FALSE,
    pinned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS version_error_logs (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
    v0_version_id TEXT,
    level TEXT NOT NULL,
    category TEXT,
    message TEXT NOT NULL,
    meta JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
    v0_deployment_id TEXT,
    vercel_deployment_id TEXT,
    vercel_project_id TEXT,
    inspector_url TEXT,
    url TEXT,
    status VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS app_projects (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    session_id TEXT,
    name TEXT NOT NULL,
    category TEXT,
    description TEXT,
    thumbnail_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS prompt_handoffs (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    source TEXT,
    project_id TEXT,
    user_id TEXT,
    session_id TEXT,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS prompt_logs (
    id TEXT PRIMARY KEY,
    event TEXT NOT NULL,
    user_id TEXT,
    session_id TEXT,
    app_project_id TEXT,
    v0_project_id TEXT,
    chat_id TEXT,
    prompt_original TEXT,
    prompt_formatted TEXT,
    system_prompt TEXT,
    prompt_assist_model TEXT,
    prompt_assist_deep BOOLEAN,
    prompt_assist_mode TEXT,
    build_intent TEXT,
    build_method TEXT,
    model_tier TEXT,
    image_generations BOOLEAN,
    thinking BOOLEAN,
    attachments_count INTEGER,
    meta JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS project_data (
    project_id TEXT PRIMARY KEY REFERENCES app_projects(id) ON DELETE CASCADE,
    chat_id TEXT,
    demo_url TEXT,
    current_code TEXT,
    files JSONB,
    messages JSONB,
    meta JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS project_files (
    id BIGSERIAL PRIMARY KEY,
    project_id TEXT REFERENCES app_projects(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    size_bytes INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS images (
    id BIGSERIAL PRIMARY KEY,
    project_id TEXT REFERENCES app_projects(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    original_name TEXT,
    mime_type TEXT,
    size_bytes INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS media_library (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    blob_url TEXT,
    mime_type TEXT NOT NULL,
    file_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    description TEXT,
    tags JSONB,
    project_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    name TEXT,
    image TEXT,
    provider TEXT,
    google_id TEXT,
    github_id TEXT,
    github_username TEXT,
    github_token TEXT,
    diamonds INTEGER DEFAULT 50 NOT NULL,
    tier TEXT,
    email_verified BOOLEAN DEFAULT FALSE NOT NULL,
    verification_token TEXT,
    verification_token_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_login_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS user_integrations (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT,
    v0_project_id TEXT,
    integration_type TEXT NOT NULL,
    marketplace_slug TEXT,
    ownership_model TEXT DEFAULT 'user_managed_vercel' NOT NULL,
    billing_owner TEXT DEFAULT 'user' NOT NULL,
    status TEXT DEFAULT 'pending' NOT NULL,
    env_vars JSONB,
    install_url TEXT,
    installed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    description TEXT,
    stripe_payment_intent TEXT,
    stripe_session_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS guest_usage (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT UNIQUE NOT NULL,
    generations_used INTEGER DEFAULT 0 NOT NULL,
    refines_used INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS company_profiles (
    id BIGSERIAL PRIMARY KEY,
    project_id TEXT,
    company_name TEXT NOT NULL,
    industry TEXT,
    location TEXT,
    existing_website TEXT,
    website_analysis TEXT,
    site_likes TEXT,
    site_dislikes TEXT,
    site_feedback TEXT,
    target_audience TEXT,
    purposes TEXT,
    special_wishes TEXT,
    color_palette_name TEXT,
    color_primary TEXT,
    color_secondary TEXT,
    color_accent TEXT,
    competitor_insights TEXT,
    industry_trends TEXT,
    research_sources TEXT,
    inspiration_sites TEXT,
    voice_transcript TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS template_cache (
    id BIGSERIAL PRIMARY KEY,
    template_id TEXT NOT NULL,
    user_id TEXT,
    chat_id TEXT NOT NULL,
    demo_url TEXT,
    version_id TEXT,
    code TEXT,
    files_json TEXT,
    model TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS page_views (
    id BIGSERIAL PRIMARY KEY,
    path TEXT NOT NULL,
    session_id TEXT,
    user_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    referrer TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_audits (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    domain TEXT NOT NULL,
    company_name TEXT,
    score_overall INTEGER,
    score_seo INTEGER,
    score_ux INTEGER,
    score_performance INTEGER,
    score_security INTEGER,
    audit_result TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS kostnadsfri_pages (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    company_name TEXT NOT NULL,
    industry TEXT,
    website TEXT,
    contact_email TEXT,
    contact_name TEXT,
    extra_data JSONB,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS domain_orders (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    order_id TEXT,
    customer_price INTEGER,
    vercel_cost INTEGER,
    currency TEXT,
    status TEXT,
    years INTEGER,
    domain_added_to_project BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS engine_chats (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    title TEXT,
    model TEXT NOT NULL DEFAULT 'gpt-5.4',
    system_prompt TEXT,
    scaffold_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS engine_messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES engine_chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS engine_versions (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES engine_chats(id) ON DELETE CASCADE,
    message_id TEXT,
    version_number INTEGER NOT NULL,
    files_json TEXT NOT NULL,
    preview_url TEXT,
    release_state TEXT NOT NULL DEFAULT 'draft',
    verification_state TEXT NOT NULL DEFAULT 'pending',
    verification_summary TEXT,
    promoted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS engine_generation_logs (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES engine_chats(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    duration_ms INTEGER,
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS engine_version_error_logs (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES engine_chats(id) ON DELETE CASCADE,
    version_id TEXT NOT NULL REFERENCES engine_versions(id) ON DELETE CASCADE,
    v0_version_id TEXT,
    level TEXT NOT NULL,
    category TEXT,
    message TEXT NOT NULL,
    meta JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  // Distributed lease for server-verify / build-error-repair / manual-repair
  // (Plan C / P1). One active (status='running') lease per version_id is the
  // cross-instance lock. See add-engine-version-jobs.sql + schema.ts.
  `CREATE TABLE IF NOT EXISTS engine_version_jobs (
    id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL REFERENCES engine_versions(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    run_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    lease_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
];

const schemaQueries = [
  // Critical: unique constraint required for upsert in tenant.ts
  `CREATE UNIQUE INDEX IF NOT EXISTS projects_user_v0project_idx ON projects(user_id, v0_project_id)`,
  // Critical: unique constraint required for onConflictDoNothing in chat creation (stream routes + webhooks)
  `CREATE UNIQUE INDEX IF NOT EXISTS chats_v0_chat_id_unique ON chats(v0_chat_id)`,
  `CREATE INDEX IF NOT EXISTS idx_versions_chat_id ON versions(chat_id)`,
  `CREATE INDEX IF NOT EXISTS idx_version_error_logs_version_id ON version_error_logs(version_id)`,
  `CREATE INDEX IF NOT EXISTS idx_version_error_logs_chat_id ON version_error_logs(chat_id)`,
  `CREATE INDEX IF NOT EXISTS idx_engine_version_error_logs_version_id ON engine_version_error_logs(version_id)`,
  `CREATE INDEX IF NOT EXISTS idx_engine_version_error_logs_chat_id ON engine_version_error_logs(chat_id)`,
  // engine_version_jobs lease lock: only ONE active (running) lease per version.
  `CREATE UNIQUE INDEX IF NOT EXISTS engine_version_jobs_active_uq ON engine_version_jobs(version_id) WHERE status = 'running'`,
  `CREATE INDEX IF NOT EXISTS idx_engine_version_jobs_version ON engine_version_jobs(version_id)`,
  `ALTER TABLE engine_messages ADD COLUMN IF NOT EXISTS ui_parts JSONB`,
  `ALTER TABLE engine_messages ADD COLUMN IF NOT EXISTS thinking TEXT`,
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'engine_versions'
         AND column_name = 'sandbox_url'
     ) AND NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'engine_versions'
         AND column_name = 'preview_url'
     ) THEN
       ALTER TABLE engine_versions RENAME COLUMN sandbox_url TO preview_url;
     END IF;
   END $$`,
  `ALTER TABLE engine_versions ADD COLUMN IF NOT EXISTS release_state TEXT`,
  `UPDATE engine_versions SET release_state = 'promoted' WHERE release_state IS NULL`,
  `ALTER TABLE engine_versions ALTER COLUMN release_state SET DEFAULT 'draft'`,
  `ALTER TABLE engine_versions ALTER COLUMN release_state SET NOT NULL`,
  `ALTER TABLE engine_versions ADD COLUMN IF NOT EXISTS verification_state TEXT`,
  `UPDATE engine_versions SET verification_state = 'passed' WHERE verification_state IS NULL`,
  `ALTER TABLE engine_versions ALTER COLUMN verification_state SET DEFAULT 'pending'`,
  `ALTER TABLE engine_versions ALTER COLUMN verification_state SET NOT NULL`,
  `ALTER TABLE engine_versions ADD COLUMN IF NOT EXISTS verification_summary TEXT`,
  `ALTER TABLE engine_versions ADD COLUMN IF NOT EXISTS repaired_files_json TEXT`,
  `ALTER TABLE engine_versions ADD COLUMN IF NOT EXISTS repair_available_at TIMESTAMPTZ`,
  `ALTER TABLE engine_versions ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ`,
  `ALTER TABLE engine_versions ADD COLUMN IF NOT EXISTS parent_version_id TEXT`,
  `ALTER TABLE engine_versions ADD COLUMN IF NOT EXISTS edit_kind TEXT`,
  `ALTER TABLE engine_versions ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT`,
  `UPDATE engine_versions SET lifecycle_stage = 'design' WHERE lifecycle_stage IS NULL`,
  `ALTER TABLE engine_versions ALTER COLUMN lifecycle_stage SET DEFAULT 'design'`,
  `ALTER TABLE engine_versions ALTER COLUMN lifecycle_stage SET NOT NULL`,
  `CREATE INDEX IF NOT EXISTS engine_versions_parent_version_id_idx ON engine_versions(parent_version_id)`,
  `CREATE INDEX IF NOT EXISTS engine_versions_lifecycle_stage_idx ON engine_versions(lifecycle_stage)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE NOT NULL`,
  `ALTER TABLE users ALTER COLUMN diamonds SET DEFAULT 50`,
  `ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT FALSE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMPTZ`,
  // Preserve Google/OAuth semantics while tightening email/password defaults.
  // Any email-provider user that still has an active verification token should
  // remain unverified until the token flow is completed.
  `UPDATE users SET email_verified = FALSE WHERE provider = 'email' AND verification_token IS NOT NULL AND email_verified = TRUE`,
  `UPDATE users SET email_verified = TRUE WHERE provider = 'google' AND email_verified = FALSE`,
  `ALTER TABLE versions ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE`,
  `CREATE INDEX IF NOT EXISTS idx_prompt_logs_created_at ON prompt_logs(created_at DESC)`,
  `ALTER TABLE versions ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ`,
  `ALTER TABLE project_data ADD COLUMN IF NOT EXISTS meta JSONB`,
  `ALTER TABLE deployments ADD COLUMN IF NOT EXISTS domain TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_deployments_chat_id ON deployments(chat_id)`,
  `CREATE INDEX IF NOT EXISTS idx_deployments_vercel_deployment_id ON deployments(vercel_deployment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_app_projects_user_id ON app_projects(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_app_projects_session_id ON app_projects(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_prompt_handoffs_created_at ON prompt_handoffs(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_prompt_handoffs_consumed_at ON prompt_handoffs(consumed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_project_data_project_id ON project_data(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_media_library_user_id ON media_library(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_media_library_project_id ON media_library(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_audits_user_id ON user_audits(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_page_views_path ON page_views(path)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS user_integrations_owner_project_type_idx ON user_integrations(user_id, project_id, integration_type)`,
  `CREATE INDEX IF NOT EXISTS idx_user_integrations_user_id ON user_integrations(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_integrations_project_id ON user_integrations(project_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS template_cache_template_user_idx ON template_cache(template_id, user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_kostnadsfri_pages_slug ON kostnadsfri_pages(slug)`,
  // Registry cache for shadcn/ui block picker
  `CREATE TABLE IF NOT EXISTS registry_cache (
    base_url TEXT NOT NULL,
    style TEXT NOT NULL,
    source TEXT NOT NULL,
    index_json JSONB NOT NULL,
    item_status JSONB,
    fetched_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS registry_cache_source_style_idx ON registry_cache(base_url, style, source)`,
];

const cascadeQueries = [
  `ALTER TABLE chats DROP CONSTRAINT IF EXISTS chats_project_id_fkey`,
  `ALTER TABLE versions DROP CONSTRAINT IF EXISTS versions_chat_id_fkey`,
  `ALTER TABLE deployments DROP CONSTRAINT IF EXISTS deployments_project_id_fkey`,
  `ALTER TABLE deployments DROP CONSTRAINT IF EXISTS deployments_chat_id_fkey`,
  `ALTER TABLE deployments DROP CONSTRAINT IF EXISTS deployments_version_id_fkey`,
  `ALTER TABLE chats ADD CONSTRAINT chats_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`,
  `ALTER TABLE versions ADD CONSTRAINT versions_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE`,
  `ALTER TABLE deployments ADD CONSTRAINT deployments_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`,
  `ALTER TABLE deployments ADD CONSTRAINT deployments_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE`,
  `ALTER TABLE deployments ADD CONSTRAINT deployments_version_id_fkey FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE`,
];

const updatedAtFunction = `
  CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql
  SET search_path = public, pg_temp;
`;

const updatedAtTriggers = [
  `DROP TRIGGER IF EXISTS set_updated_at_projects ON projects`,
  `CREATE TRIGGER set_updated_at_projects BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
  `DROP TRIGGER IF EXISTS set_updated_at_chats ON chats`,
  `CREATE TRIGGER set_updated_at_chats BEFORE UPDATE ON chats FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
  `DROP TRIGGER IF EXISTS set_updated_at_deployments ON deployments`,
  `CREATE TRIGGER set_updated_at_deployments BEFORE UPDATE ON deployments FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
  `DROP TRIGGER IF EXISTS set_updated_at_app_projects ON app_projects`,
  `CREATE TRIGGER set_updated_at_app_projects BEFORE UPDATE ON app_projects FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
  `DROP TRIGGER IF EXISTS set_updated_at_users ON users`,
  `CREATE TRIGGER set_updated_at_users BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
  `DROP TRIGGER IF EXISTS set_updated_at_guest_usage ON guest_usage`,
  `CREATE TRIGGER set_updated_at_guest_usage BEFORE UPDATE ON guest_usage FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
  `DROP TRIGGER IF EXISTS set_updated_at_company_profiles ON company_profiles`,
  `CREATE TRIGGER set_updated_at_company_profiles BEFORE UPDATE ON company_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
  `DROP TRIGGER IF EXISTS set_updated_at_domain_orders ON domain_orders`,
  `CREATE TRIGGER set_updated_at_domain_orders BEFORE UPDATE ON domain_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
  `DROP TRIGGER IF EXISTS set_updated_at_kostnadsfri_pages ON kostnadsfri_pages`,
  `CREATE TRIGGER set_updated_at_kostnadsfri_pages BEFORE UPDATE ON kostnadsfri_pages FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
  `DROP TRIGGER IF EXISTS set_updated_at_project_data ON project_data`,
  `CREATE TRIGGER set_updated_at_project_data BEFORE UPDATE ON project_data FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
  `DROP TRIGGER IF EXISTS set_updated_at_user_integrations ON user_integrations`,
  `CREATE TRIGGER set_updated_at_user_integrations BEFORE UPDATE ON user_integrations FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
  `DROP TRIGGER IF EXISTS set_updated_at_version_comments ON version_comments`,
  `CREATE TRIGGER set_updated_at_version_comments BEFORE UPDATE ON version_comments FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
];

const guestUsageRepairQueries = [
  `WITH guest_usage_dupes AS (
     SELECT
       session_id,
       MIN(id) AS keeper_id,
       COALESCE(SUM(generations_used), 0) AS total_generations_used,
       COALESCE(SUM(refines_used), 0) AS total_refines_used,
       MIN(created_at) AS first_created_at,
       MAX(updated_at) AS last_updated_at
     FROM guest_usage
     GROUP BY session_id
     HAVING COUNT(*) > 1
   )
   UPDATE guest_usage AS target
   SET generations_used = guest_usage_dupes.total_generations_used,
       refines_used = guest_usage_dupes.total_refines_used,
       created_at = guest_usage_dupes.first_created_at,
       updated_at = guest_usage_dupes.last_updated_at
   FROM guest_usage_dupes
   WHERE target.id = guest_usage_dupes.keeper_id`,
  `WITH guest_usage_dupes AS (
     SELECT
       session_id,
       MIN(id) AS keeper_id
     FROM guest_usage
     GROUP BY session_id
     HAVING COUNT(*) > 1
   )
   DELETE FROM guest_usage AS target
   USING guest_usage_dupes
   WHERE target.session_id = guest_usage_dupes.session_id
     AND target.id <> guest_usage_dupes.keeper_id`,
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'guest_usage'
         AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
         AND indexdef ILIKE '%(session_id)%'
     ) THEN
       CREATE UNIQUE INDEX guest_usage_session_idx ON guest_usage(session_id);
     END IF;
   END $$`,
];

// ---------------------------------------------------------------------------
// Row Level Security — block direct access from anon/authenticated roles.
// All access goes through the backend (postgres / service_role).
// ---------------------------------------------------------------------------

const ALL_TABLES = [
  "projects",
  "chats",
  "versions",
  "version_error_logs",
  "deployments",
  "app_projects",
  "prompt_handoffs",
  "prompt_logs",
  "project_data",
  "project_files",
  "images",
  "media_library",
  "users",
  "user_integrations",
  "transactions",
  "guest_usage",
  "company_profiles",
  "template_cache",
  "registry_cache",
  "page_views",
  "user_audits",
  "kostnadsfri_pages",
  "domain_orders",
  "engine_chats",
  "engine_messages",
  "engine_versions",
  "engine_generation_logs",
  "engine_version_error_logs",
  "engine_version_jobs",
  "generation_telemetry",
  "version_comments",
  "version_approvals",
  "error_log_events",
  "oc_debug_findings",
];

async function applySqlMigrations() {
  // Shared, drift-checked apply order (scripts/db/migration-order.mjs) — the
  // SAME source `npm run db:migrate` uses, so db:init and db:migrate can never
  // apply migrations in different orders. Throws if a `.sql` file on disk is not
  // registered in MIGRATION_ORDER (forces deliberate slotting), which is exactly
  // the drift the blocking `db:schema-drift` gate also guards.
  const ordered = resolveMigrationRunOrder(await readdir(MIGRATIONS_DIR));

  // Best-effort ledger so `db:migrate:check` can tell this DB is up to date.
  // Warn-only — a ledger hiccup must never abort db:init / dev startup.
  try {
    await ensureMigrationLedger(pool);
  } catch (err) {
    console.warn(
      `[db:init] Could not ensure schema_migrations ledger: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  for (const file of ordered) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf-8");
    try {
      await pool.query(sql);
    } catch (err) {
      // Idempotent re-run: the object already exists, so this statement is a
      // no-op. Tolerate ONLY that (matched by stable SQLSTATE, not message text)
      // and re-throw everything else so a real failure still aborts loudly.
      if (!isAlreadyExistsError(err)) {
        throw err;
      }
    }
    // Record every migration processed (applied OR already-exists). Warn-only.
    try {
      await recordAppliedMigration(pool, file);
    } catch (err) {
      console.warn(
        `[db:init] Could not record ${file} in schema_migrations: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

function buildRlsQueries() {
  const queries = [];
  for (const table of ALL_TABLES) {
    queries.push(`ALTER TABLE IF EXISTS ${table} ENABLE ROW LEVEL SECURITY`);
    queries.push(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = '${table}' AND policyname = '${table}_backend_full_access'
        ) THEN
          CREATE POLICY ${table}_backend_full_access ON ${table}
            FOR ALL
            TO postgres, service_role
            USING (true)
            WITH CHECK (true);
        END IF;
      END $$`
    );
  }
  return queries;
}

async function run() {
  try {
    for (const q of setupQueries) await pool.query(q);
    for (const q of schemaQueries) await pool.query(q);
    for (const q of cascadeQueries) await pool.query(q);
    await applySqlMigrations();
    await pool.query(updatedAtFunction);
    for (const q of updatedAtTriggers) await pool.query(q);

    const rlsQueries = buildRlsQueries();
    for (const q of rlsQueries) {
      try {
        await pool.query(q);
      } catch (rlsErr) {
        // Non-fatal: table may not exist yet (engine tables only on PG engine)
        if (!rlsErr.message?.includes("does not exist")) {
          console.warn(`[RLS] Warning for query: ${rlsErr.message}`);
        }
      }
    }
    console.info("Row Level Security enabled on all tables.");

    const guestUsageDupes = await pool.query(
      `SELECT
         COUNT(*)::int AS duplicate_sessions,
         COALESCE(SUM(row_count - 1), 0)::int AS extra_rows
       FROM (
         SELECT COUNT(*) AS row_count
         FROM guest_usage
         GROUP BY session_id
         HAVING COUNT(*) > 1
       ) dupes`,
    );
    const guestUsageRepairSummary = guestUsageDupes.rows[0] ?? {
      duplicate_sessions: 0,
      extra_rows: 0,
    };
    if (guestUsageRepairSummary.duplicate_sessions > 0) {
      console.warn(
        "Repairing duplicate guest_usage rows before enforcing unique session constraint:",
        guestUsageRepairSummary,
      );
    }
    for (const q of guestUsageRepairQueries) {
      await pool.query(q);
    }

    const dupes = await pool.query(
      `SELECT chat_id, v0_version_id, COUNT(*) as count
       FROM versions
       GROUP BY chat_id, v0_version_id
       HAVING COUNT(*) > 1
       LIMIT 1`,
    );
    if (dupes.rowCount === 0) {
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_versions_chat_v0_version_unique
         ON versions(chat_id, v0_version_id)`,
      );
    } else {
      console.warn(
        "Skipping unique index on versions(chat_id, v0_version_id); duplicates detected:",
        dupes.rows[0],
      );
    }
    console.info("Database tables are ready.");
  } catch (err) {
    console.error("Failed to initialize database tables:", err?.message || err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
