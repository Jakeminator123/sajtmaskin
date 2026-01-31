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

const pool = new Pool({
  connectionString,
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
];

const schemaQueries = [
  `CREATE INDEX IF NOT EXISTS idx_versions_chat_id ON versions(chat_id)`,
  `ALTER TABLE versions ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE versions ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ`,
  `CREATE INDEX IF NOT EXISTS idx_deployments_chat_id ON deployments(chat_id)`,
  `CREATE INDEX IF NOT EXISTS idx_deployments_vercel_deployment_id ON deployments(vercel_deployment_id)`,
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
