import { Pool } from "pg";
import { config } from "dotenv";

// Load .env.local for local development
config({ path: ".env.local" });

function normalizeEnvUrl(value) {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  if (/^\$\{[A-Z0-9_]+\}$/.test(trimmed)) return undefined;
  if (/^\$[A-Z0-9_]+$/.test(trimmed)) return undefined;
  return trimmed;
}

const connectionString = normalizeEnvUrl(process.env.POSTGRES_URL);

if (!connectionString) {
  console.error("Missing database connection URL.");
  console.error("Set POSTGRES_URL.");
  process.exit(1);
}

// Parse connection string to handle SSL properly with Supabase pooler
const url = new URL(connectionString);
// Remove sslmode from search params - we handle it via ssl option
url.searchParams.delete("sslmode");
url.searchParams.delete("supa");

const pool = new Pool({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: false },
});

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
  `CREATE TABLE IF NOT EXISTS project_data (
    project_id TEXT PRIMARY KEY REFERENCES app_projects(id) ON DELETE CASCADE,
    chat_id TEXT,
    demo_url TEXT,
    current_code TEXT,
    files JSONB,
    messages JSONB,
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
    diamonds INTEGER DEFAULT 5 NOT NULL,
    tier TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_login_at TIMESTAMPTZ
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
];

const schemaQueries = [
  `CREATE INDEX IF NOT EXISTS idx_versions_chat_id ON versions(chat_id)`,
  `ALTER TABLE versions ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE versions ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ`,
  `CREATE INDEX IF NOT EXISTS idx_deployments_chat_id ON deployments(chat_id)`,
  `CREATE INDEX IF NOT EXISTS idx_deployments_vercel_deployment_id ON deployments(vercel_deployment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_app_projects_user_id ON app_projects(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_app_projects_session_id ON app_projects(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_project_data_project_id ON project_data(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_media_library_user_id ON media_library(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_media_library_project_id ON media_library(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_audits_user_id ON user_audits(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_page_views_path ON page_views(path)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS template_cache_template_user_idx ON template_cache(template_id, user_id)`,
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
  $$ LANGUAGE plpgsql;
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
  `DROP TRIGGER IF EXISTS set_updated_at_project_data ON project_data`,
  `CREATE TRIGGER set_updated_at_project_data BEFORE UPDATE ON project_data FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
];

async function run() {
  try {
    for (const q of setupQueries) await pool.query(q);
    for (const q of schemaQueries) await pool.query(q);
    for (const q of cascadeQueries) await pool.query(q);
    await pool.query(updatedAtFunction);
    for (const q of updatedAtTriggers) await pool.query(q);

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
    console.log("Database tables are ready.");
  } catch (err) {
    console.error("Failed to initialize database tables:", err?.message || err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
