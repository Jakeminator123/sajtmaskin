import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "sajtmaskin.db");
const SCHEMA_CANDIDATE_PATHS = [
  path.resolve(process.cwd(), "src/lib/db/schema.sql"),
  path.resolve(process.cwd(), ".next/server/src/lib/db/schema.sql"),
  path.resolve(__dirname, "schema.sql"),
];

// Fallback for runtimes where file tracing does not include schema.sql.
const FALLBACK_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT,
  model TEXT NOT NULL DEFAULT 'gpt-5.2',
  system_prompt TEXT,
  scaffold_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id),
  role TEXT NOT NULL CHECK(role IN ('system','user','assistant','thinking')),
  content TEXT NOT NULL,
  token_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id),
  message_id TEXT REFERENCES messages(id),
  version_number INTEGER NOT NULL,
  files_json TEXT NOT NULL,
  sandbox_url TEXT,
  release_state TEXT NOT NULL DEFAULT 'draft',
  verification_state TEXT NOT NULL DEFAULT 'pending',
  verification_summary TEXT,
  promoted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS generation_logs (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id),
  model TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  duration_ms INTEGER,
  success INTEGER NOT NULL DEFAULT 1,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS version_error_logs (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id),
  version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK(level IN ('info', 'warning', 'error')),
  category TEXT,
  message TEXT NOT NULL,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_versions_chat ON versions(chat_id);
CREATE INDEX IF NOT EXISTS idx_gen_logs_chat ON generation_logs(chat_id);
CREATE INDEX IF NOT EXISTS idx_version_error_logs_version ON version_error_logs(version_id);
`;

let _db: Database.Database | null = null;

function loadSchemaSql(): string {
  for (const candidate of SCHEMA_CANDIDATE_PATHS) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, "utf-8");
    }
  }
  return FALLBACK_SCHEMA_SQL;
}

function applySchema(db: Database.Database): void {
  db.exec(loadSchemaSql());
  runMigrations(db);
}

function runMigrations(db: Database.Database): void {
  const columns = db
    .prepare("PRAGMA table_info(chats)")
    .all() as Array<{ name: string }>;
  const hasScaffoldId = columns.some((c) => c.name === "scaffold_id");
  if (!hasScaffoldId) {
    db.exec("ALTER TABLE chats ADD COLUMN scaffold_id TEXT;");
  }

  const versionColumns = db
    .prepare("PRAGMA table_info(versions)")
    .all() as Array<{ name: string }>;
  const hasReleaseState = versionColumns.some((c) => c.name === "release_state");
  if (!hasReleaseState) {
    db.exec("ALTER TABLE versions ADD COLUMN release_state TEXT NOT NULL DEFAULT 'draft';");
    db.exec("UPDATE versions SET release_state = 'promoted';");
  }
  const hasVerificationState = versionColumns.some((c) => c.name === "verification_state");
  if (!hasVerificationState) {
    db.exec("ALTER TABLE versions ADD COLUMN verification_state TEXT NOT NULL DEFAULT 'pending';");
    db.exec("UPDATE versions SET verification_state = 'passed';");
  }
  const hasVerificationSummary = versionColumns.some((c) => c.name === "verification_summary");
  if (!hasVerificationSummary) {
    db.exec("ALTER TABLE versions ADD COLUMN verification_summary TEXT;");
  }
  const hasPromotedAt = versionColumns.some((c) => c.name === "promoted_at");
  if (!hasPromotedAt) {
    db.exec("ALTER TABLE versions ADD COLUMN promoted_at TEXT;");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS version_error_logs (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id),
      version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
      level TEXT NOT NULL CHECK(level IN ('info', 'warning', 'error')),
      category TEXT,
      message TEXT NOT NULL,
      meta TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_version_error_logs_version ON version_error_logs(version_id);
  `);
}

/**
 * Returns a singleton better-sqlite3 database instance.
 * On first call: creates the data/ directory, opens (or creates) the DB file,
 * enables WAL mode, enforces foreign keys, and runs schema migration.
 */
export function getDb(): Database.Database {
  if (_db) return _db;

  fs.mkdirSync(DB_DIR, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  applySchema(_db);

  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export { DB_PATH };
