import { Pool } from 'pg';

function normalizeEnvUrl(value) {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  if (/^\$\{[A-Z0-9_]+\}$/.test(trimmed)) return undefined;
  if (/^\$[A-Z0-9_]+$/.test(trimmed)) return undefined;
  return trimmed;
}

const connectionString =
  normalizeEnvUrl(process.env.POSTGRES_URL) ||
  normalizeEnvUrl(process.env.POSTGRES_URL_NON_POOLING) ||
  normalizeEnvUrl(process.env.DATABASE_URL);

if (!connectionString) {
  console.error('Missing database connection URL.');
  console.error('Set POSTGRES_URL (preferred), POSTGRES_URL_NON_POOLING, or DATABASE_URL.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const queries = [
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
    project_id TEXT REFERENCES projects(id),
    v0_chat_id TEXT NOT NULL UNIQUE,
    v0_project_id TEXT NOT NULL,
    web_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS versions (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES chats(id),
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
    project_id TEXT REFERENCES projects(id),
    chat_id TEXT NOT NULL REFERENCES chats(id),
    version_id TEXT NOT NULL REFERENCES versions(id),
    v0_deployment_id TEXT,
    vercel_deployment_id TEXT,
    vercel_project_id TEXT,
    inspector_url TEXT,
    url TEXT,
    status VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_versions_chat_id ON versions(chat_id)`,
  `ALTER TABLE versions ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE versions ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ`,
  `CREATE INDEX IF NOT EXISTS idx_deployments_chat_id ON deployments(chat_id)`,
  `CREATE INDEX IF NOT EXISTS idx_deployments_vercel_deployment_id ON deployments(vercel_deployment_id)`,
];

async function run() {
  try {
    for (const q of queries) {
      await pool.query(q);
    }
    console.log('Database tables are ready.');
  } catch (err) {
    console.error('Failed to initialize database tables:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
