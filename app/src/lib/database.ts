import Database from "better-sqlite3";
import fs from "fs";
import { PATHS, logConfig, IS_PRODUCTION } from "./config";
import { debugLog } from "./debug";
import { hashPassword } from "./password-utils";

// Use centralized path configuration
const DB_PATH = PATHS.database;

// ============================================================================
// DATABASE ROW TYPES
// ============================================================================
// These interfaces represent the raw data returned from SQLite queries.
// JSON columns are stored as strings in the database and need parsing.
// ============================================================================

/** Raw row from project_data table (JSON stored as strings) */
interface ProjectDataRow {
  project_id: string;
  chat_id: string | null;
  demo_url: string | null;
  current_code: string | null;
  files_json: string;
  messages_json: string;
  version_id: string | null;
}

/** Raw row from project_files table */
interface ProjectFileRow {
  id?: number;
  project_id: string;
  path: string;
  content: string;
  mime_type?: string;
  size?: number;
  created_at: string;
  updated_at: string;
}

/** Raw row from company_profiles table (JSON stored as strings) */
interface CompanyProfileRow {
  id: number;
  project_id: string | null;
  company_name: string;
  industry: string | null;
  location: string | null;
  existing_website: string | null;
  website_analysis: string | null;
  site_likes: string | null;
  site_dislikes: string | null;
  site_feedback: string | null;
  target_audience: string | null;
  purposes: string | null;
  special_wishes: string | null;
  color_palette_name: string | null;
  color_primary: string | null;
  color_secondary: string | null;
  color_accent: string | null;
  competitor_insights: string | null;
  industry_trends: string | null;
  research_sources: string | null;
  inspiration_sites: string | null;
  voice_transcript: string | null;
  created_at: string;
  updated_at: string;
}

/** Raw row from users table */
interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  password_hash: string | null;
  email_verified: number;
  provider: string | null;
  diamonds: number | null;
  github_token: string | null;
  github_username: string | null;
  created_at: string;
  last_login: string | null;
}

/** Result type for COUNT(*) queries */
interface CountResult {
  count: number;
}

/** Result type for SUM() queries */
interface SumResult {
  sum: number | null;
}

/**
 * Safe JSON parse with fallback value
 */
function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    console.error("[Database] Failed to parse JSON:", json?.substring(0, 100));
    return fallback;
  }
}

// ============================================================================
// TEST USER CONFIGURATION
// ============================================================================
// Test user with unlimited credits for development/testing.
// DISABLED in production for security - only active in development.
// Credentials are loaded from environment variables for security.
// Set these in .env.local:
//   TEST_USER_EMAIL=your-test-email@example.com
//   TEST_USER_PASSWORD=your-secure-password
// ============================================================================
export const TEST_USER_EMAIL = IS_PRODUCTION
  ? ""
  : process.env.TEST_USER_EMAIL || "";
export const TEST_USER_PASSWORD = IS_PRODUCTION
  ? ""
  : process.env.TEST_USER_PASSWORD || "";
export const TEST_USER_DIAMONDS = 999999;

// Uploads directory - use centralized config
function getUploadsPath(): string {
  return PATHS.uploads;
}

// Create database connection (singleton pattern)
let db: Database.Database | null = null;
let configLogged = false;
let dbInitLogged = false; // Track if we've logged init message

export function getDb(): Database.Database {
  if (!db) {
    // Log configuration on first database access
    if (!configLogged) {
      logConfig();
      configLogged = true;
    }

    // Ensure data directory exists
    const dataDir = PATHS.dataDir;
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log("[Database] Created data directory:", dataDir);
    }

    debugLog("[Database] Opening SQLite database", { path: DB_PATH });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL"); // Better performance for concurrent access
    db.pragma("foreign_keys = ON"); // Enforce cascades and referential integrity
    initializeDatabase(db, !dbInitLogged); // Only log init message once
    dbInitLogged = true;
    debugLog("[Database] Database ready");
  }
  return db;
}

// Initialize database schema
function initializeDatabase(
  database: Database.Database,
  logInit: boolean = true
) {
  // Users table - with authentication and credits
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT,
      image TEXT,
      password_hash TEXT,
      email_verified INTEGER DEFAULT 0,
      provider TEXT DEFAULT 'anonymous',
      diamonds INTEGER DEFAULT 5,
      created_at TEXT DEFAULT (datetime('now')),
      last_login TEXT DEFAULT (datetime('now'))
    )
  `);

  // Add new columns to existing users table if they don't exist
  try {
    database.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT`);
  } catch {
    // Column already exists
  }
  try {
    database.exec(
      `ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`
    );
  } catch {
    // Column already exists
  }
  try {
    database.exec(`ALTER TABLE users ADD COLUMN diamonds INTEGER DEFAULT 5`);
  } catch {
    // Column already exists
  }
  try {
    database.exec(`ALTER TABLE users ADD COLUMN github_token TEXT`);
  } catch {
    // Column already exists
  }
  try {
    database.exec(`ALTER TABLE users ADD COLUMN github_username TEXT`);
  } catch {
    // Column already exists
  }

  // Guest usage tracking - tracks anonymous session usage
  database.exec(`
    CREATE TABLE IF NOT EXISTS guest_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      generations_used INTEGER DEFAULT 0,
      refines_used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Transactions table - tracks all credit changes and payments
  database.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      description TEXT,
      stripe_payment_id TEXT,
      stripe_session_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Sessions table - for tracking user sessions
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Page views table - for analytics
  database.exec(`
    CREATE TABLE IF NOT EXISTS page_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      session_id TEXT,
      user_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      referrer TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Create index for faster analytics queries
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views(created_at)
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_page_views_path ON page_views(path)
  `);

  // Projects table - main project info
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      description TEXT,
      thumbnail_path TEXT,
      session_id TEXT,
      user_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Project data table - stores v0 chat data
  database.exec(`
    CREATE TABLE IF NOT EXISTS project_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL UNIQUE,
      chat_id TEXT,
      demo_url TEXT,
      current_code TEXT,
      files_json TEXT,
      messages_json TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Project files table - stores taken-over project files persistently
  // NOTE: No FK constraint on project_id because takeover projects may use
  // IDs like "v0_abc123" or GitHub-style IDs that don't exist in projects table
  database.exec(`
    CREATE TABLE IF NOT EXISTS project_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      mime_type TEXT DEFAULT 'text/plain',
      size INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(project_id, path)
    )
  `);

  // Images table - tracks uploaded images
  database.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Media library table - stores all types of user media (images, videos, PDFs, text files, logos)
  // This is a persistent library that users can reuse across projects
  database.exec(`
    CREATE TABLE IF NOT EXISTS media_library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      project_id TEXT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      blob_url TEXT,
      mime_type TEXT NOT NULL,
      file_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      description TEXT,
      tags TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    )
  `);

  // Template screenshots cache - stores v0 API screenshots for template cards
  database.exec(`
    CREATE TABLE IF NOT EXISTS template_screenshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id TEXT NOT NULL UNIQUE,
      screenshot_url TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Template cache - stores full v0 API responses to avoid duplicate calls
  // When a user selects a template, we cache the result so subsequent selections
  // of the same template don't create new v0 chats
  database.exec(`
    CREATE TABLE IF NOT EXISTS template_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id TEXT NOT NULL UNIQUE,
      chat_id TEXT NOT NULL,
      demo_url TEXT,
      version_id TEXT,
      files_json TEXT,
      code TEXT,
      model TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT DEFAULT (datetime('now', '+7 days'))
    )
  `);

  // Company profiles - stores wizard data and research for reuse
  database.exec(`
    CREATE TABLE IF NOT EXISTS company_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT UNIQUE,
      
      -- Basic info
      company_name TEXT NOT NULL,
      industry TEXT,
      location TEXT,
      
      -- Website info
      existing_website TEXT,
      website_analysis TEXT,
      site_likes TEXT,
      site_dislikes TEXT,
      site_feedback TEXT,
      
      -- Business info
      target_audience TEXT,
      purposes TEXT,
      special_wishes TEXT,
      
      -- Design preferences
      color_palette_name TEXT,
      color_primary TEXT,
      color_secondary TEXT,
      color_accent TEXT,
      
      -- Research data (from Web Search)
      competitor_insights TEXT,
      industry_trends TEXT,
      research_sources TEXT,
      
      -- Inspiration
      inspiration_sites TEXT,
      
      -- Voice input transcript (if used)
      voice_transcript TEXT,
      
      -- Metadata
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    )
  `);

  // ═══════════════════════════════════════════════════════════════════════════
  // USER AUDITS - stores saved website audits for each user
  // ═══════════════════════════════════════════════════════════════════════════
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_audits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      
      -- Audit metadata
      url TEXT NOT NULL,
      domain TEXT NOT NULL,
      company_name TEXT,
      
      -- Audit data (JSON)
      audit_result TEXT NOT NULL,
      
      -- Scores (denormalized for easy querying)
      score_seo INTEGER,
      score_ux INTEGER,
      score_performance INTEGER,
      score_security INTEGER,
      score_overall INTEGER,
      
      -- Timestamps
      created_at TEXT DEFAULT (datetime('now')),
      
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // ═══════════════════════════════════════════════════════════════════════════
  // VERCEL DEPLOYMENTS TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  // Tracks Vercel deployments for projects.
  // This allows us to:
  // - Track deployment status (pending, ready, error)
  // - Store deployment URLs
  // - Avoid duplicate deployments
  // - Retry failed deployments
  // ═══════════════════════════════════════════════════════════════════════════
  database.exec(`
    CREATE TABLE IF NOT EXISTS vercel_deployments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      deployment_id TEXT NOT NULL UNIQUE,
      vercel_project_name TEXT NOT NULL,
      deployment_url TEXT,
      ready_state TEXT DEFAULT 'QUEUED',
      state TEXT DEFAULT 'BUILDING',
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // ═══════════════════════════════════════════════════════════════════════════
  // DOMAIN ORDERS TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  // Tracks domain purchases via Vercel Domains Registrar API.
  // Stores order information, pricing (with markup), and status.
  // ═══════════════════════════════════════════════════════════════════════════
  database.exec(`
    CREATE TABLE IF NOT EXISTS domain_orders (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      order_id TEXT,
      customer_price REAL NOT NULL,
      vercel_cost REAL NOT NULL,
      currency TEXT DEFAULT 'SEK',
      status TEXT NOT NULL,
      years INTEGER DEFAULT 1,
      domain_added_to_project INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // ═══════════════════════════════════════════════════════════════════════════
  // INDEXES for better query performance
  // ═══════════════════════════════════════════════════════════════════════════
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
    CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_projects_session_id ON projects(session_id);
    CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_project_data_chat_id ON project_data(chat_id);
    CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);
    CREATE INDEX IF NOT EXISTS idx_images_project_id ON images(project_id);
    CREATE INDEX IF NOT EXISTS idx_template_screenshots_template_id ON template_screenshots(template_id);
    CREATE INDEX IF NOT EXISTS idx_company_profiles_company_name ON company_profiles(company_name);
    CREATE INDEX IF NOT EXISTS idx_company_profiles_industry ON company_profiles(industry);
    CREATE INDEX IF NOT EXISTS idx_company_profiles_project_id ON company_profiles(project_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_guest_usage_session_id ON guest_usage(session_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_stripe_session_id ON transactions(stripe_session_id);
    CREATE INDEX IF NOT EXISTS idx_user_audits_user_id ON user_audits(user_id);
    CREATE INDEX IF NOT EXISTS idx_vercel_deployments_project_id ON vercel_deployments(project_id);
    CREATE INDEX IF NOT EXISTS idx_vercel_deployments_deployment_id ON vercel_deployments(deployment_id);
    CREATE INDEX IF NOT EXISTS idx_domain_orders_project_id ON domain_orders(project_id);
    CREATE INDEX IF NOT EXISTS idx_domain_orders_order_id ON domain_orders(order_id);
    CREATE INDEX IF NOT EXISTS idx_domain_orders_domain ON domain_orders(domain);
    CREATE INDEX IF NOT EXISTS idx_domain_orders_status ON domain_orders(status);
    CREATE INDEX IF NOT EXISTS idx_user_audits_domain ON user_audits(domain);
    CREATE INDEX IF NOT EXISTS idx_user_audits_created_at ON user_audits(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_media_library_user_id ON media_library(user_id);
    CREATE INDEX IF NOT EXISTS idx_media_library_project_id ON media_library(project_id);
    CREATE INDEX IF NOT EXISTS idx_media_library_file_type ON media_library(file_type);
    CREATE INDEX IF NOT EXISTS idx_media_library_created_at ON media_library(created_at DESC);
  `);

  // Create test/admin user if it doesn't exist
  ensureTestUserExists(database);

  if (logInit) {
    console.log("[Database] Initialized successfully at:", DB_PATH);
  }
}

// Ensure test user exists (for admin access and testing)
// Only creates if TEST_USER_EMAIL and TEST_USER_PASSWORD are set in environment
function ensureTestUserExists(database: Database.Database) {
  // Skip if no test credentials are configured
  if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    debugLog(
      "[Database] No test user configured (set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local)"
    );
    return;
  }

  const existingUser = database
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(TEST_USER_EMAIL);

  if (!existingUser) {
    const passwordHash = hashPassword(TEST_USER_PASSWORD);
    const userId = `email_${Date.now()}`;

    database
      .prepare(
        `INSERT INTO users (id, email, name, password_hash, provider, email_verified, diamonds)
         VALUES (?, ?, ?, ?, 'email', 1, ?)`
      )
      .run(
        userId,
        TEST_USER_EMAIL,
        "Test Admin",
        passwordHash,
        TEST_USER_DIAMONDS
      );

    debugLog("[Database] Created test user:", { email: TEST_USER_EMAIL });
  }
}

// ============ Project CRUD Operations ============

export interface Project {
  id: string;
  name: string;
  category?: string;
  description?: string;
  thumbnail_path?: string;
  session_id?: string; // Links project to anonymous session
  user_id?: string; // Links project to authenticated user
  created_at: string;
  updated_at: string;
}

export interface ProjectData {
  project_id: string;
  chat_id?: string;
  demo_url?: string;
  current_code?: string;
  files: Array<Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
}

// Generate unique ID
function generateId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Create a new project
export function createProject(
  name: string,
  category?: string,
  description?: string,
  sessionId?: string,
  userId?: string
): Project {
  const db = getDb();
  const id = generateId();

  const stmt = db.prepare(`
    INSERT INTO projects (id, name, category, description, session_id, user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    name,
    category || null,
    description || null,
    sessionId || null,
    userId || null
  );

  // Also create empty project_data entry
  const dataStmt = db.prepare(`
    INSERT INTO project_data (project_id, files_json, messages_json)
    VALUES (?, '[]', '[]')
  `);
  dataStmt.run(id);

  debugLog("[Database] Created project", {
    id,
    name,
    category,
    hasUser: Boolean(userId),
    hasSession: Boolean(sessionId),
  });
  const project = getProjectById(id);
  if (!project) {
    throw new Error(`Project not found: ${id}`);
  }
  return project;
}

// Get project by ID
export function getProjectById(id: string): Project | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM projects WHERE id = ?");
  return stmt.get(id) as Project | null;
}

// Get all projects
export function getAllProjects(): Project[] {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM projects ORDER BY updated_at DESC");
  return stmt.all() as Project[];
}

// Transfer projects from session to user (after login)
export function transferProjectsToUser(
  sessionId: string,
  userId: string
): number {
  const db = getDb();
  const stmt = db.prepare(
    "UPDATE projects SET user_id = ?, session_id = NULL WHERE session_id = ?"
  );
  const result = stmt.run(userId, sessionId);
  return result.changes;
}

// Update project
export function updateProject(
  id: string,
  updates: Partial<Omit<Project, "id" | "created_at">>
): Project | null {
  const db = getDb();

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.category !== undefined) {
    fields.push("category = ?");
    values.push(updates.category);
  }
  if (updates.description !== undefined) {
    fields.push("description = ?");
    values.push(updates.description);
  }
  if (updates.thumbnail_path !== undefined) {
    fields.push("thumbnail_path = ?");
    values.push(updates.thumbnail_path);
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);

  const stmt = db.prepare(`
    UPDATE projects SET ${fields.join(", ")} WHERE id = ?
  `);
  stmt.run(...values);

  return getProjectById(id);
}

// Delete project
export function deleteProject(id: string): boolean {
  const db = getDb();

  // Delete associated images from disk
  const images = getProjectImages(id);
  for (const img of images) {
    try {
      if (fs.existsSync(img.file_path)) {
        fs.unlinkSync(img.file_path);
      }
    } catch (e) {
      console.error("[Database] Failed to delete image file:", e);
    }
  }

  const stmt = db.prepare("DELETE FROM projects WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

// ============ Project Data Operations ============

// Get project data
export function getProjectData(projectId: string): ProjectData | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM project_data WHERE project_id = ?");
  const row = stmt.get(projectId) as ProjectDataRow | undefined;

  if (!row) return null;

  // Safe JSON parsing with fallback
  let files: Array<Record<string, unknown>> = [];
  let messages: Array<Record<string, unknown>> = [];

  try {
    files = row.files_json ? JSON.parse(row.files_json) : [];
  } catch {
    console.error(
      "[Database] Failed to parse files_json for project:",
      projectId
    );
  }

  try {
    messages = row.messages_json ? JSON.parse(row.messages_json) : [];
  } catch {
    console.error(
      "[Database] Failed to parse messages_json for project:",
      projectId
    );
  }

  const parsed: ProjectData = {
    project_id: row.project_id,
    chat_id: row.chat_id ?? undefined,
    demo_url: row.demo_url ?? undefined,
    current_code: row.current_code ?? undefined,
    files,
    messages,
  };
  debugLog("[Database] Loaded project data", {
    projectId,
    hasChat: Boolean(parsed.chat_id),
    hasDemoUrl: Boolean(parsed.demo_url),
    files: parsed.files.length,
    messages: parsed.messages.length,
  });
  return parsed;
}

// Save project data (upsert)
export function saveProjectData(data: ProjectData): void {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO project_data (project_id, chat_id, demo_url, current_code, files_json, messages_json)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      chat_id = excluded.chat_id,
      demo_url = excluded.demo_url,
      current_code = excluded.current_code,
      files_json = excluded.files_json,
      messages_json = excluded.messages_json
  `);

  stmt.run(
    data.project_id,
    data.chat_id || null,
    data.demo_url || null,
    data.current_code || null,
    JSON.stringify(data.files),
    JSON.stringify(data.messages)
  );

  // Update project's updated_at
  const updateStmt = db.prepare(
    "UPDATE projects SET updated_at = datetime('now') WHERE id = ?"
  );
  updateStmt.run(data.project_id);
  debugLog("[Database] Saved project data", {
    projectId: data.project_id,
    hasChat: Boolean(data.chat_id),
    hasDemoUrl: Boolean(data.demo_url),
    files: data.files.length,
    messages: data.messages.length,
  });
}

// ============ Project Files (SQLite) ============

export interface ProjectFileRecord {
  project_id?: string;
  path: string;
  content: string;
  mime_type?: string | null;
  size?: number | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Bulk upsert project files into SQLite.
 * Returns number of files written.
 */
export function saveProjectFilesToDb(
  projectId: string,
  files: Array<
    Pick<ProjectFileRecord, "path" | "content" | "mime_type" | "size">
  >
): number {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO project_files (project_id, path, content, mime_type, size, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(project_id, path) DO UPDATE SET
      content = excluded.content,
      mime_type = excluded.mime_type,
      size = excluded.size,
      updated_at = datetime('now')
  `);

  const run = db.transaction(
    (
      fileList: Array<
        Pick<ProjectFileRecord, "path" | "content" | "mime_type" | "size">
      >
    ) => {
      let count = 0;
      for (const file of fileList) {
        const size =
          typeof file.size === "number"
            ? file.size
            : Buffer.byteLength(file.content || "", "utf8");
        upsert.run(
          projectId,
          file.path,
          file.content,
          file.mime_type || "text/plain",
          size
        );
        count += 1;
      }
      return count;
    }
  );

  const saved = run(files);
  debugLog("[Database] Saved project files to SQLite", {
    projectId,
    files: saved,
  });
  return saved;
}

/**
 * Fetch project files from SQLite.
 */
export function getProjectFilesFromDb(projectId: string): ProjectFileRecord[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT project_id, path, content, mime_type, size, created_at, updated_at
    FROM project_files
    WHERE project_id = ?
    ORDER BY path ASC
  `);
  const rows = stmt.all(projectId) as ProjectFileRow[];

  return rows.map((row) => ({
    project_id: row.project_id,
    path: row.path,
    content: row.content,
    mime_type: row.mime_type,
    size: row.size,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

/**
 * Upsert a single project file in SQLite.
 */
export function updateProjectFileInDb(
  projectId: string,
  path: string,
  content: string,
  mimeType?: string
): boolean {
  const db = getDb();
  const size = Buffer.byteLength(content || "", "utf8");

  const stmt = db.prepare(`
    INSERT INTO project_files (project_id, path, content, mime_type, size, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(project_id, path) DO UPDATE SET
      content = excluded.content,
      mime_type = excluded.mime_type,
      size = excluded.size,
      updated_at = datetime('now')
  `);

  const result = stmt.run(
    projectId,
    path,
    content,
    mimeType || "text/plain",
    size
  );
  debugLog("[Database] Upserted project file in SQLite", {
    projectId,
    path,
    size,
  });
  return result.changes > 0;
}

/**
 * Delete a single project file from SQLite.
 */
export function deleteProjectFileFromDb(
  projectId: string,
  path: string
): boolean {
  const db = getDb();
  const stmt = db.prepare(
    "DELETE FROM project_files WHERE project_id = ? AND path = ?"
  );
  const result = stmt.run(projectId, path);
  debugLog("[Database] Deleted project file from SQLite", {
    projectId,
    path,
    removed: result.changes,
  });
  return result.changes > 0;
}

// ============ Image Operations ============

export interface ImageRecord {
  id: number;
  project_id: string;
  filename: string;
  original_name?: string;
  file_path: string;
  mime_type?: string;
  size_bytes?: number;
  created_at: string;
}

// Save image record
export function saveImage(
  projectId: string,
  filename: string,
  filePath: string,
  originalName?: string,
  mimeType?: string,
  sizeBytes?: number
): ImageRecord {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO images (project_id, filename, file_path, original_name, mime_type, size_bytes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    projectId,
    filename,
    filePath,
    originalName || null,
    mimeType || null,
    sizeBytes || null
  );

  return {
    id: result.lastInsertRowid as number,
    project_id: projectId,
    filename,
    file_path: filePath,
    original_name: originalName,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    created_at: new Date().toISOString(),
  };
}

// Get project images
export function getProjectImages(projectId: string): ImageRecord[] {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT * FROM images WHERE project_id = ? ORDER BY created_at DESC"
  );
  return stmt.all(projectId) as ImageRecord[];
}

// Get uploads directory path - creates directory if it doesn't exist (lazy initialization)
export function getUploadsDir(): string {
  const uploadsDir = getUploadsPath();

  // Create directory lazily at runtime (not during build)
  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log("[Database] Created uploads directory:", uploadsDir);
    }
  } catch (err) {
    // Silently fail during build, will work at runtime
    console.warn("[Database] Could not create uploads directory:", err);
  }

  return uploadsDir;
}

// ============ Template Screenshot Cache Operations ============

export interface TemplateScreenshot {
  id: number;
  template_id: string;
  screenshot_url: string;
  created_at: string;
}

// Get cached screenshot for a template
export function getTemplateScreenshot(
  templateId: string
): TemplateScreenshot | null {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT * FROM template_screenshots WHERE template_id = ?"
  );
  return stmt.get(templateId) as TemplateScreenshot | null;
}

// Save screenshot URL for a template (upsert)
export function saveTemplateScreenshot(
  templateId: string,
  screenshotUrl: string
): TemplateScreenshot {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO template_screenshots (template_id, screenshot_url)
    VALUES (?, ?)
    ON CONFLICT(template_id) DO UPDATE SET
      screenshot_url = excluded.screenshot_url,
      created_at = datetime('now')
  `);
  stmt.run(templateId, screenshotUrl);

  const screenshot = getTemplateScreenshot(templateId);
  if (!screenshot) {
    throw new Error(`Template screenshot not found: ${templateId}`);
  }
  return screenshot;
}

// Get all cached template screenshots
export function getAllTemplateScreenshots(): TemplateScreenshot[] {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM template_screenshots");
  return stmt.all() as TemplateScreenshot[];
}

// ============ Template Cache Operations ============
// Caches full v0 API responses to avoid duplicate template generations

export interface CachedTemplateResult {
  id: number;
  template_id: string;
  chat_id: string;
  demo_url: string | null;
  version_id: string | null;
  files_json: string | null;
  code: string | null;
  model: string | null;
  created_at: string;
  expires_at: string;
}

export interface TemplateResultInput {
  chatId: string;
  demoUrl?: string | null;
  versionId?: string | null;
  files?: Array<{ name: string; content: string }>;
  code?: string | null;
  model?: string | null;
}

/**
 * Get cached template result if it exists and hasn't expired
 */
export function getCachedTemplate(
  templateId: string
): CachedTemplateResult | null {
  const db = getDb();

  const stmt = db.prepare(`
    SELECT * FROM template_cache 
    WHERE template_id = ? 
    AND datetime(expires_at) > datetime('now')
  `);
  const result = stmt.get(templateId) as CachedTemplateResult | undefined;

  if (result) {
    console.log("[DB] Template cache HIT for:", templateId);
    return result;
  }

  console.log("[DB] Template cache MISS for:", templateId);
  return null;
}

/**
 * Cache a template result (upsert - updates if exists)
 */
export function cacheTemplateResult(
  templateId: string,
  result: TemplateResultInput
): CachedTemplateResult {
  const db = getDb();

  const filesJson = result.files ? JSON.stringify(result.files) : null;

  const stmt = db.prepare(`
    INSERT INTO template_cache (template_id, chat_id, demo_url, version_id, files_json, code, model, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 days'))
    ON CONFLICT(template_id) DO UPDATE SET
      chat_id = excluded.chat_id,
      demo_url = excluded.demo_url,
      version_id = excluded.version_id,
      files_json = excluded.files_json,
      code = excluded.code,
      model = excluded.model,
      created_at = datetime('now'),
      expires_at = datetime('now', '+7 days')
  `);

  stmt.run(
    templateId,
    result.chatId,
    result.demoUrl || null,
    result.versionId || null,
    filesJson,
    result.code || null,
    result.model || null
  );

  console.log("[DB] Template cached:", templateId);
  const cached = getCachedTemplate(templateId);
  if (!cached) {
    throw new Error(`Failed to retrieve cached template: ${templateId}`);
  }
  return cached;
}

// ============ Company Profile Operations ============

export interface CompanyProfile {
  id: number;
  project_id?: string;

  // Basic info
  company_name: string;
  industry?: string;
  location?: string;

  // Website info
  existing_website?: string;
  website_analysis?: string;
  site_likes?: string[];
  site_dislikes?: string[];
  site_feedback?: string;

  // Business info
  target_audience?: string;
  purposes?: string[];
  special_wishes?: string;

  // Design preferences
  color_palette_name?: string;
  color_primary?: string;
  color_secondary?: string;
  color_accent?: string;

  // Research data
  competitor_insights?: string;
  industry_trends?: string;
  research_sources?: Array<{ url: string; title: string }>;

  // Inspiration
  inspiration_sites?: string[];

  // Voice input
  voice_transcript?: string;

  // Metadata
  created_at: string;
  updated_at: string;
}

// Create or update company profile
export function saveCompanyProfile(
  profile: Omit<CompanyProfile, "id" | "created_at" | "updated_at">
): CompanyProfile {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO company_profiles (
      project_id, company_name, industry, location,
      existing_website, website_analysis, site_likes, site_dislikes, site_feedback,
      target_audience, purposes, special_wishes,
      color_palette_name, color_primary, color_secondary, color_accent,
      competitor_insights, industry_trends, research_sources,
      inspiration_sites, voice_transcript
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      company_name = excluded.company_name,
      industry = excluded.industry,
      location = excluded.location,
      existing_website = excluded.existing_website,
      website_analysis = excluded.website_analysis,
      site_likes = excluded.site_likes,
      site_dislikes = excluded.site_dislikes,
      site_feedback = excluded.site_feedback,
      target_audience = excluded.target_audience,
      purposes = excluded.purposes,
      special_wishes = excluded.special_wishes,
      color_palette_name = excluded.color_palette_name,
      color_primary = excluded.color_primary,
      color_secondary = excluded.color_secondary,
      color_accent = excluded.color_accent,
      competitor_insights = excluded.competitor_insights,
      industry_trends = excluded.industry_trends,
      research_sources = excluded.research_sources,
      inspiration_sites = excluded.inspiration_sites,
      voice_transcript = excluded.voice_transcript,
      updated_at = datetime('now')
  `);

  const result = stmt.run(
    profile.project_id || null,
    profile.company_name,
    profile.industry || null,
    profile.location || null,
    profile.existing_website || null,
    profile.website_analysis || null,
    profile.site_likes ? JSON.stringify(profile.site_likes) : null,
    profile.site_dislikes ? JSON.stringify(profile.site_dislikes) : null,
    profile.site_feedback || null,
    profile.target_audience || null,
    profile.purposes ? JSON.stringify(profile.purposes) : null,
    profile.special_wishes || null,
    profile.color_palette_name || null,
    profile.color_primary || null,
    profile.color_secondary || null,
    profile.color_accent || null,
    profile.competitor_insights || null,
    profile.industry_trends || null,
    profile.research_sources ? JSON.stringify(profile.research_sources) : null,
    profile.inspiration_sites
      ? JSON.stringify(profile.inspiration_sites)
      : null,
    profile.voice_transcript || null
  );

  return getCompanyProfileById(result.lastInsertRowid as number)!;
}

// Get company profile by ID
export function getCompanyProfileById(id: number): CompanyProfile | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM company_profiles WHERE id = ?");
  const row = stmt.get(id) as CompanyProfileRow | undefined;

  if (!row) return null;

  return parseCompanyProfileRow(row);
}

// Get company profile by project ID
export function getCompanyProfileByProjectId(
  projectId: string
): CompanyProfile | null {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT * FROM company_profiles WHERE project_id = ?"
  );
  const row = stmt.get(projectId) as CompanyProfileRow | undefined;

  if (!row) return null;

  return parseCompanyProfileRow(row);
}

// Get company profile by company name (for reuse)
export function getCompanyProfileByName(
  companyName: string
): CompanyProfile | null {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT * FROM company_profiles WHERE company_name = ? ORDER BY updated_at DESC LIMIT 1"
  );
  const row = stmt.get(companyName) as CompanyProfileRow | undefined;

  if (!row) return null;

  return parseCompanyProfileRow(row);
}

// Get all company profiles
export function getAllCompanyProfiles(): CompanyProfile[] {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT * FROM company_profiles ORDER BY updated_at DESC"
  );
  const rows = stmt.all() as CompanyProfileRow[];

  return rows.map(parseCompanyProfileRow);
}

// Search company profiles by name or industry
export function searchCompanyProfiles(query: string): CompanyProfile[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM company_profiles 
    WHERE company_name LIKE ? OR industry LIKE ? OR location LIKE ?
    ORDER BY updated_at DESC
    LIMIT 20
  `);
  const searchTerm = `%${query}%`;
  const rows = stmt.all(
    searchTerm,
    searchTerm,
    searchTerm
  ) as CompanyProfileRow[];

  return rows.map(parseCompanyProfileRow);
}

// Link company profile to a project
export function linkCompanyProfileToProject(
  profileId: number,
  projectId: string
): void {
  const db = getDb();
  const stmt = db.prepare(
    "UPDATE company_profiles SET project_id = ?, updated_at = datetime('now') WHERE id = ?"
  );
  stmt.run(projectId, profileId);
}

// Helper to parse database row to CompanyProfile
function parseCompanyProfileRow(row: CompanyProfileRow): CompanyProfile {
  return {
    id: row.id,
    project_id: row.project_id ?? undefined,
    company_name: row.company_name,
    industry: row.industry ?? undefined,
    location: row.location ?? undefined,
    existing_website: row.existing_website ?? undefined,
    website_analysis: row.website_analysis ?? undefined,
    site_likes: safeJsonParse(row.site_likes, undefined),
    site_dislikes: safeJsonParse(row.site_dislikes, undefined),
    site_feedback: row.site_feedback ?? undefined,
    target_audience: row.target_audience ?? undefined,
    purposes: safeJsonParse(row.purposes, undefined),
    special_wishes: row.special_wishes ?? undefined,
    color_palette_name: row.color_palette_name ?? undefined,
    color_primary: row.color_primary ?? undefined,
    color_secondary: row.color_secondary ?? undefined,
    color_accent: row.color_accent ?? undefined,
    competitor_insights: row.competitor_insights ?? undefined,
    industry_trends: row.industry_trends ?? undefined,
    research_sources: safeJsonParse(row.research_sources, undefined),
    inspiration_sites: safeJsonParse(row.inspiration_sites, undefined),
    voice_transcript: row.voice_transcript ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ============ User Operations ============

export interface User {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  password_hash: string | null;
  email_verified: boolean;
  provider: "google" | "email" | "anonymous";
  diamonds: number;
  github_token: string | null;
  github_username: string | null;
  created_at: string;
  last_login: string;
}

// Generate unique user ID
function generateUserId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Create user (for registration)
export function createUser(
  email: string,
  passwordHash: string,
  name?: string
): User {
  const db = getDb();
  const id = generateUserId();

  const stmt = db.prepare(`
    INSERT INTO users (id, email, name, password_hash, provider, diamonds)
    VALUES (?, ?, ?, ?, 'email', 5)
  `);
  stmt.run(id, email.toLowerCase(), name || null, passwordHash);

  return getUserById(id)!;
}

// Create user from Google OAuth
export function createGoogleUser(
  googleId: string,
  email: string,
  name: string,
  image?: string
): User {
  const db = getDb();
  const id = `google_${googleId}`;
  const normalizedEmail = email.toLowerCase();

  // First check if a user with this email already exists
  const existingUser = getUserByEmail(normalizedEmail);

  if (existingUser) {
    // If existing user has a different ID (different Google account or email-registered)
    // we need to handle this carefully to prevent account takeover
    if (existingUser.id !== id) {
      // If the existing account was created with email/password,
      // link it to Google by updating the provider (user is upgrading to Google login)
      if (
        existingUser.provider === "email" ||
        existingUser.provider === "anonymous"
      ) {
        const updateStmt = db.prepare(`
          UPDATE users SET
            id = ?,
            name = COALESCE(?, name),
            image = ?,
            provider = 'google',
            email_verified = 1,
            last_login = datetime('now')
          WHERE email = ?
        `);
        updateStmt.run(id, name, image || null, normalizedEmail);
        return getUserById(id)!;
      }

      // Different Google account trying to use same email - this shouldn't happen
      // in normal circumstances (Google emails are unique to accounts).
      // Log warning and return the existing user rather than merging.
      console.warn(
        `[Database] Google OAuth: Different Google ID (${googleId}) attempting to use ` +
          `email (${normalizedEmail}) already registered with ID (${existingUser.id}). ` +
          `Returning existing account to prevent account takeover.`
      );

      // Update last login for existing user
      const loginStmt = db.prepare(
        "UPDATE users SET last_login = datetime('now') WHERE id = ?"
      );
      loginStmt.run(existingUser.id);

      return existingUser;
    }

    // Same Google ID - just update profile info and login time
    const updateStmt = db.prepare(`
      UPDATE users SET
        name = ?,
        image = ?,
        last_login = datetime('now')
      WHERE id = ?
    `);
    updateStmt.run(name, image || null, id);
    return getUserById(id)!;
  }

  // No existing user - create new one
  const stmt = db.prepare(`
    INSERT INTO users (id, email, name, image, provider, email_verified, diamonds)
    VALUES (?, ?, ?, ?, 'google', 1, 5)
  `);
  stmt.run(id, normalizedEmail, name, image || null);

  return getUserById(id)!;
}

// Get user by ID
export function getUserById(id: string): User | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
  const row = stmt.get(id) as UserRow | undefined;
  if (!row) return null;
  return parseUserRow(row);
}

// Get user by email
export function getUserByEmail(email: string): User | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
  const row = stmt.get(email.toLowerCase()) as UserRow | undefined;
  if (!row) return null;
  return parseUserRow(row);
}

// Update user diamonds
export function updateUserDiamonds(userId: string, newBalance: number): void {
  const db = getDb();
  const stmt = db.prepare("UPDATE users SET diamonds = ? WHERE id = ?");
  stmt.run(newBalance, userId);
}

// Update last login
export function updateUserLastLogin(userId: string): void {
  const db = getDb();
  const stmt = db.prepare(
    "UPDATE users SET last_login = datetime('now') WHERE id = ?"
  );
  stmt.run(userId);
}

// Helper to parse user row
function parseUserRow(row: UserRow): User {
  // Test user always has unlimited diamonds
  const isTest = row.email === TEST_USER_EMAIL;
  const provider: User["provider"] =
    row.provider === "google" || row.provider === "email"
      ? row.provider
      : "anonymous";

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    image: row.image,
    password_hash: row.password_hash,
    email_verified: row.email_verified === 1,
    provider,
    diamonds: isTest ? TEST_USER_DIAMONDS : row.diamonds ?? 5,
    github_token: row.github_token || null,
    github_username: row.github_username || null,
    created_at: row.created_at,
    last_login: row.last_login ?? row.created_at,
  };
}

// ============ GitHub Integration Operations ============

// Update user's GitHub token and username
export function updateUserGitHub(
  userId: string,
  githubToken: string,
  githubUsername: string
): void {
  const db = getDb();
  const stmt = db.prepare(
    "UPDATE users SET github_token = ?, github_username = ? WHERE id = ?"
  );
  stmt.run(githubToken, githubUsername, userId);
}

// ============ Guest Usage Operations ============

export interface GuestUsage {
  id: number;
  session_id: string;
  generations_used: number;
  refines_used: number;
  created_at: string;
  updated_at: string;
}

// Get guest usage by session ID
export function getGuestUsage(sessionId: string): GuestUsage | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM guest_usage WHERE session_id = ?");
  return stmt.get(sessionId) as GuestUsage | null;
}

// Create or get guest usage record
export function getOrCreateGuestUsage(sessionId: string): GuestUsage {
  const db = getDb();

  // Try to get existing
  const usage = getGuestUsage(sessionId);
  if (usage) return usage;

  // Create new
  const stmt = db.prepare(`
    INSERT INTO guest_usage (session_id, generations_used, refines_used)
    VALUES (?, 0, 0)
  `);
  stmt.run(sessionId);

  return getGuestUsage(sessionId)!;
}

// Increment guest generation count
export function incrementGuestGenerations(sessionId: string): GuestUsage {
  const db = getDb();
  getOrCreateGuestUsage(sessionId);

  const stmt = db.prepare(`
    UPDATE guest_usage 
    SET generations_used = generations_used + 1, updated_at = datetime('now')
    WHERE session_id = ?
  `);
  stmt.run(sessionId);

  return getGuestUsage(sessionId)!;
}

// Increment guest refine count
export function incrementGuestRefines(sessionId: string): GuestUsage {
  const db = getDb();
  getOrCreateGuestUsage(sessionId);

  const stmt = db.prepare(`
    UPDATE guest_usage 
    SET refines_used = refines_used + 1, updated_at = datetime('now')
    WHERE session_id = ?
  `);
  stmt.run(sessionId);

  return getGuestUsage(sessionId)!;
}

// ============ Transaction Operations ============

export type TransactionType =
  | "signup_bonus"
  | "generation"
  | "refine"
  | "purchase"
  | "admin_adjust"
  | "audit"
  | "agent_code_edit"
  | "agent_copy"
  | "agent_image"
  | "agent_video"
  | "agent_web_search"
  | "agent_code_refactor"
  | "agent_analyze"
  | "orchestrator";

export interface Transaction {
  id: number;
  user_id: string;
  type: TransactionType;
  amount: number;
  balance_after: number;
  description: string | null;
  stripe_payment_id: string | null;
  stripe_session_id: string | null;
  created_at: string;
}

// Create a transaction and update user balance
export function createTransaction(
  userId: string,
  type: TransactionType,
  amount: number,
  description?: string,
  stripePaymentId?: string,
  stripeSessionId?: string
): Transaction {
  const db = getDb();

  // Get current user balance
  const user = getUserById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const newBalance = user.diamonds + amount;

  // Update user diamonds
  updateUserDiamonds(userId, newBalance);

  // Create transaction record
  const stmt = db.prepare(`
    INSERT INTO transactions (user_id, type, amount, balance_after, description, stripe_payment_id, stripe_session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    userId,
    type,
    amount,
    newBalance,
    description || null,
    stripePaymentId || null,
    stripeSessionId || null
  );

  return getTransactionById(result.lastInsertRowid as number)!;
}

// Get transaction by ID
export function getTransactionById(id: number): Transaction | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM transactions WHERE id = ?");
  return stmt.get(id) as Transaction | null;
}

// Get user transactions
export function getUserTransactions(userId: string, limit = 50): Transaction[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM transactions 
    WHERE user_id = ? 
    ORDER BY created_at DESC 
    LIMIT ?
  `);
  return stmt.all(userId, limit) as Transaction[];
}

// Get transaction by Stripe session ID (for webhook verification)
export function getTransactionByStripeSession(
  stripeSessionId: string
): Transaction | null {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT * FROM transactions WHERE stripe_session_id = ?"
  );
  return stmt.get(stripeSessionId) as Transaction | null;
}

// Check if user is the test user with unlimited credits
export function isTestUser(user: User | null): boolean {
  return user?.email === TEST_USER_EMAIL;
}

// Deduct diamonds for generation (deduct 1)
// Test user (email: "test") has unlimited credits
export function deductGenerationDiamond(userId: string): Transaction | null {
  const user = getUserById(userId);
  if (!user || user.diamonds < 1) {
    return null;
  }

  // Test user gets unlimited credits - no deduction
  if (isTestUser(user)) {
    console.log("[Database] Test user - skipping diamond deduction");
    // Return a mock transaction so the API still works correctly
    return {
      id: -1, // Mock ID for test user
      user_id: userId,
      type: "generation",
      amount: 0,
      balance_after: TEST_USER_DIAMONDS,
      description: "Test user - unlimited credits",
      stripe_payment_id: null,
      stripe_session_id: null,
      created_at: new Date().toISOString(),
    };
  }

  return createTransaction(userId, "generation", -1, "AI-generering");
}

// Deduct diamonds for refine (deduct 1)
// Test user (email: "test") has unlimited credits
export function deductRefineDiamond(userId: string): Transaction | null {
  const user = getUserById(userId);
  if (!user || user.diamonds < 1) {
    return null;
  }

  // Test user gets unlimited credits - no deduction
  if (isTestUser(user)) {
    console.log("[Database] Test user - skipping diamond deduction");
    // Return a mock transaction so the API still works correctly
    return {
      id: -1, // Mock ID for test user
      user_id: userId,
      type: "refine",
      amount: 0,
      balance_after: TEST_USER_DIAMONDS,
      description: "Test user - unlimited credits",
      stripe_payment_id: null,
      stripe_session_id: null,
      created_at: new Date().toISOString(),
    };
  }

  return createTransaction(userId, "refine", -1, "AI-förfining");
}

// Deduct a custom amount of diamonds
// Used for different task types with varying costs
export function deductDiamonds(
  userId: string,
  amount: number,
  description: string = "AI-operation",
  transactionType: TransactionType = "generation"
): Transaction | null {
  const user = getUserById(userId);
  if (!user || user.diamonds < amount) {
    return null;
  }

  // Test user gets unlimited credits - no deduction
  if (isTestUser(user)) {
    console.log("[Database] Test user - skipping diamond deduction");
    return {
      id: -1,
      user_id: userId,
      type: transactionType,
      amount: 0,
      balance_after: TEST_USER_DIAMONDS,
      description: "Test user - unlimited credits",
      stripe_payment_id: null,
      stripe_session_id: null,
      created_at: new Date().toISOString(),
    };
  }

  return createTransaction(userId, transactionType, -amount, description);
}

// ============ Analytics Operations ============

export interface PageView {
  id: number;
  path: string;
  session_id: string | null;
  user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  referrer: string | null;
  created_at: string;
}

export interface AnalyticsStats {
  totalPageViews: number;
  uniqueVisitors: number;
  totalUsers: number;
  totalProjects: number;
  totalGenerations: number;
  totalRefines: number;
  recentPageViews: { path: string; count: number }[];
  dailyViews: { date: string; views: number; unique: number }[];
  topReferrers: { referrer: string; count: number }[];
}

// Record a page view
export function recordPageView(
  path: string,
  sessionId?: string,
  userId?: string,
  ipAddress?: string,
  userAgent?: string,
  referrer?: string
): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO page_views (path, session_id, user_id, ip_address, user_agent, referrer)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    path,
    sessionId || null,
    userId || null,
    ipAddress || null,
    userAgent || null,
    referrer || null
  );
}

// Get analytics stats
export function getAnalyticsStats(days: number = 30): AnalyticsStats {
  const db = getDb();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffStr = cutoffDate.toISOString();

  // Total page views
  const totalPageViews =
    (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM page_views WHERE created_at >= ?"
        )
        .get(cutoffStr) as CountResult | undefined
    )?.count || 0;

  // Unique visitors (by session_id or ip_address)
  const uniqueVisitors =
    (
      db
        .prepare(
          `SELECT COUNT(DISTINCT COALESCE(session_id, ip_address)) as count 
           FROM page_views WHERE created_at >= ?`
        )
        .get(cutoffStr) as CountResult | undefined
    )?.count || 0;

  // Total users
  const totalUsers =
    (
      db.prepare("SELECT COUNT(*) as count FROM users").get() as
        | CountResult
        | undefined
    )?.count || 0;

  // Total projects
  const totalProjects =
    (
      db.prepare("SELECT COUNT(*) as count FROM projects").get() as
        | CountResult
        | undefined
    )?.count || 0;

  // Total generations (from guest_usage + transactions)
  const guestGenerations =
    (
      db
        .prepare("SELECT SUM(generations_used) as sum FROM guest_usage")
        .get() as SumResult | undefined
    )?.sum || 0;
  const userGenerations =
    (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM transactions WHERE type = 'generation'"
        )
        .get() as CountResult | undefined
    )?.count || 0;
  const totalGenerations = guestGenerations + userGenerations;

  // Total refines
  const guestRefines =
    (
      db.prepare("SELECT SUM(refines_used) as sum FROM guest_usage").get() as
        | SumResult
        | undefined
    )?.sum || 0;
  const userRefines =
    (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM transactions WHERE type = 'refine'"
        )
        .get() as CountResult | undefined
    )?.count || 0;
  const totalRefines = guestRefines + userRefines;

  // Most viewed pages
  const recentPageViews = db
    .prepare(
      `SELECT path, COUNT(*) as count 
       FROM page_views 
       WHERE created_at >= ?
       GROUP BY path 
       ORDER BY count DESC 
       LIMIT 10`
    )
    .all(cutoffStr) as { path: string; count: number }[];

  // Daily views for chart
  const dailyViews = db
    .prepare(
      `SELECT 
         date(created_at) as date, 
         COUNT(*) as views,
         COUNT(DISTINCT COALESCE(session_id, ip_address)) as unique
       FROM page_views 
       WHERE created_at >= ?
       GROUP BY date(created_at) 
       ORDER BY date ASC`
    )
    .all(cutoffStr) as { date: string; views: number; unique: number }[];

  // Top referrers
  const topReferrers = db
    .prepare(
      `SELECT referrer, COUNT(*) as count 
       FROM page_views 
       WHERE created_at >= ? AND referrer IS NOT NULL AND referrer != ''
       GROUP BY referrer 
       ORDER BY count DESC 
       LIMIT 10`
    )
    .all(cutoffStr) as { referrer: string; count: number }[];

  return {
    totalPageViews,
    uniqueVisitors,
    totalUsers,
    totalProjects,
    totalGenerations,
    totalRefines,
    recentPageViews,
    dailyViews,
    topReferrers,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// USER AUDITS FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface SavedAudit {
  id: number;
  user_id: string;
  url: string;
  domain: string;
  company_name: string | null;
  audit_result: string; // JSON string
  score_seo: number | null;
  score_ux: number | null;
  score_performance: number | null;
  score_security: number | null;
  score_overall: number | null;
  created_at: string;
}

/**
 * Save an audit result for a user
 */
export function saveUserAudit(
  userId: string,
  url: string,
  domain: string,
  auditResult: Record<string, unknown>
): SavedAudit {
  const db = getDb();

  // Extract scores from audit result
  const scores = auditResult.audit_scores as Record<string, number> | undefined;
  const scoreSeo = scores?.seo ?? null;
  const scoreUx = scores?.ux ?? null;
  const scorePerformance = scores?.performance ?? null;
  const scoreSecurity = scores?.security ?? null;

  // Calculate overall score (average of available scores)
  const availableScores = [
    scoreSeo,
    scoreUx,
    scorePerformance,
    scoreSecurity,
  ].filter((s) => s !== null) as number[];
  const scoreOverall =
    availableScores.length > 0
      ? Math.round(
          availableScores.reduce((a, b) => a + b, 0) / availableScores.length
        )
      : null;

  const companyName = (auditResult.company as string) || null;

  const stmt = db.prepare(`
    INSERT INTO user_audits (
      user_id, url, domain, company_name, audit_result,
      score_seo, score_ux, score_performance, score_security, score_overall
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    userId,
    url,
    domain,
    companyName,
    JSON.stringify(auditResult),
    scoreSeo,
    scoreUx,
    scorePerformance,
    scoreSecurity,
    scoreOverall
  );

  return {
    id: result.lastInsertRowid as number,
    user_id: userId,
    url,
    domain,
    company_name: companyName,
    audit_result: JSON.stringify(auditResult),
    score_seo: scoreSeo,
    score_ux: scoreUx,
    score_performance: scorePerformance,
    score_security: scoreSecurity,
    score_overall: scoreOverall,
    created_at: new Date().toISOString(),
  };
}

/**
 * Get all audits for a user
 */
export function getUserAudits(userId: string): SavedAudit[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM user_audits WHERE user_id = ? ORDER BY created_at DESC`
    )
    .all(userId) as SavedAudit[];
}

/**
 * Get a specific audit by ID (with user ownership check)
 */
export function getUserAuditById(
  auditId: number,
  userId: string
): SavedAudit | null {
  const db = getDb();
  const audit = db
    .prepare(`SELECT * FROM user_audits WHERE id = ? AND user_id = ?`)
    .get(auditId, userId) as SavedAudit | undefined;
  return audit || null;
}

/**
 * Delete an audit (with user ownership check)
 */
export function deleteUserAudit(auditId: number, userId: string): boolean {
  const db = getDb();
  const result = db
    .prepare(`DELETE FROM user_audits WHERE id = ? AND user_id = ?`)
    .run(auditId, userId);
  return result.changes > 0;
}

/**
 * Get audit count for a user
 */
export function getUserAuditCount(userId: string): number {
  const db = getDb();
  const result = db
    .prepare(`SELECT COUNT(*) as count FROM user_audits WHERE user_id = ?`)
    .get(userId) as { count: number };
  return result.count;
}

// ============================================================================
// MEDIA LIBRARY OPERATIONS
// ============================================================================
// Manages user's persistent media library (images, videos, PDFs, text files, logos)
// ============================================================================

export type MediaFileType =
  | "image"
  | "video"
  | "pdf"
  | "text"
  | "logo"
  | "other";

export interface MediaLibraryItem {
  id: number;
  user_id: string;
  project_id: string | null;
  filename: string;
  original_name: string;
  file_path: string;
  blob_url: string | null;
  mime_type: string;
  file_type: MediaFileType;
  size_bytes: number;
  description: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

interface MediaLibraryRow {
  id: number;
  user_id: string;
  project_id: string | null;
  filename: string;
  original_name: string;
  file_path: string;
  blob_url: string | null;
  mime_type: string;
  file_type: string;
  size_bytes: number;
  description: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Determine file type from MIME type
 */
function getFileTypeFromMime(mimeType: string): MediaFileType {
  if (mimeType.startsWith("image/")) {
    // Check if it's a logo-type image (SVG, icon formats)
    if (mimeType === "image/svg+xml" || mimeType.includes("icon")) {
      return "logo";
    }
    return "image";
  }
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/")) return "text";
  return "other";
}

/**
 * Save a media file to the library
 */
export function saveMediaLibraryItem(
  userId: string,
  filename: string,
  originalName: string,
  filePath: string,
  mimeType: string,
  sizeBytes: number,
  blobUrl?: string,
  projectId?: string,
  description?: string,
  tags?: string[]
): MediaLibraryItem {
  const db = getDb();

  const fileType = getFileTypeFromMime(mimeType);

  const stmt = db.prepare(`
    INSERT INTO media_library (
      user_id, project_id, filename, original_name, file_path, blob_url,
      mime_type, file_type, size_bytes, description, tags
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    userId,
    projectId || null,
    filename,
    originalName,
    filePath,
    blobUrl || null,
    mimeType,
    fileType,
    sizeBytes,
    description || null,
    tags ? JSON.stringify(tags) : null
  );

  return getMediaLibraryItemById(result.lastInsertRowid as number)!;
}

/**
 * Get a media library item by ID
 */
export function getMediaLibraryItemById(id: number): MediaLibraryItem | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM media_library WHERE id = ?");
  const row = stmt.get(id) as MediaLibraryRow | undefined;

  if (!row) return null;
  return parseMediaLibraryRow(row);
}

/**
 * Get all media library items for a user
 */
export function getMediaLibraryByUser(
  userId: string,
  fileType?: MediaFileType
): MediaLibraryItem[] {
  const db = getDb();

  let query = "SELECT * FROM media_library WHERE user_id = ?";
  const params: unknown[] = [userId];

  if (fileType) {
    query += " AND file_type = ?";
    params.push(fileType);
  }

  query += " ORDER BY created_at DESC";

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as MediaLibraryRow[];

  return rows.map(parseMediaLibraryRow);
}

/**
 * Delete a media library item
 */
export function deleteMediaLibraryItem(id: number, userId: string): boolean {
  const db = getDb();

  // Get item to delete file
  const item = getMediaLibraryItemById(id);
  if (!item || item.user_id !== userId) {
    return false;
  }

  // Delete physical file
  try {
    if (fs.existsSync(item.file_path)) {
      fs.unlinkSync(item.file_path);
    }
  } catch (e) {
    console.error("[Database] Failed to delete media file:", e);
  }

  // Delete database record
  const stmt = db.prepare(
    "DELETE FROM media_library WHERE id = ? AND user_id = ?"
  );
  const result = stmt.run(id, userId);
  return result.changes > 0;
}

// ============================================================================
// MEDIA LIBRARY COUNT FUNCTIONS (for enforcing user limits)
// ============================================================================

export interface MediaLibraryCounts {
  images: number; // Includes "image" and "logo" types
  videos: number;
  other: number; // PDFs, text files, etc. - no limit
  total: number;
}

/**
 * Get count of media items by type for a user
 * Used to enforce upload limits (e.g., max 10 images, max 3 videos)
 */
export function getMediaLibraryCounts(userId: string): MediaLibraryCounts {
  const db = getDb();

  // Count images (includes logos)
  const imageCount =
    (
      db
        .prepare(
          `SELECT COUNT(*) as count FROM media_library 
           WHERE user_id = ? AND file_type IN ('image', 'logo')`
        )
        .get(userId) as CountResult | undefined
    )?.count || 0;

  // Count videos
  const videoCount =
    (
      db
        .prepare(
          `SELECT COUNT(*) as count FROM media_library 
           WHERE user_id = ? AND file_type = 'video'`
        )
        .get(userId) as CountResult | undefined
    )?.count || 0;

  // Count other (pdfs, text, etc.)
  const otherCount =
    (
      db
        .prepare(
          `SELECT COUNT(*) as count FROM media_library 
           WHERE user_id = ? AND file_type NOT IN ('image', 'logo', 'video')`
        )
        .get(userId) as CountResult | undefined
    )?.count || 0;

  return {
    images: imageCount,
    videos: videoCount,
    other: otherCount,
    total: imageCount + videoCount + otherCount,
  };
}

/**
 * Check if user can upload a file of the given MIME type
 * Returns { allowed: boolean, reason?: string }
 */
export function canUserUploadFile(
  userId: string,
  mimeType: string,
  maxImages: number = 10,
  maxVideos: number = 3
): { allowed: boolean; reason?: string } {
  const counts = getMediaLibraryCounts(userId);

  // Check image/logo limit
  if (mimeType.startsWith("image/")) {
    if (counts.images >= maxImages) {
      return {
        allowed: false,
        reason: `Du har nått maxgränsen på ${maxImages} bilder/logos. Ta bort någon för att ladda upp fler.`,
      };
    }
  }

  // Check video limit
  if (mimeType.startsWith("video/")) {
    if (counts.videos >= maxVideos) {
      return {
        allowed: false,
        reason: `Du har nått maxgränsen på ${maxVideos} videos. Ta bort någon för att ladda upp fler.`,
      };
    }
  }

  // PDFs and text files have no limit
  return { allowed: true };
}

/**
 * Helper to parse media library row
 */
function parseMediaLibraryRow(row: MediaLibraryRow): MediaLibraryItem {
  return {
    id: row.id,
    user_id: row.user_id,
    project_id: row.project_id,
    filename: row.filename,
    original_name: row.original_name,
    file_path: row.file_path,
    blob_url: row.blob_url,
    mime_type: row.mime_type,
    file_type: row.file_type as MediaFileType,
    size_bytes: row.size_bytes,
    description: row.description,
    tags: safeJsonParse(row.tags, null),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DOMAIN ORDERS FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface DomainOrder {
  id: string;
  project_id: string;
  domain: string;
  order_id: string | null;
  customer_price: number;
  vercel_cost: number;
  currency: string;
  status: string;
  years: number;
  domain_added_to_project: number; // 0 or 1 (boolean)
  created_at: number;
  updated_at: number;
}

interface DomainOrderRow {
  id: string;
  project_id: string;
  domain: string;
  order_id: string | null;
  customer_price: number;
  vercel_cost: number;
  currency: string;
  status: string;
  years: number;
  domain_added_to_project: number;
  created_at: number;
  updated_at: number;
}

/**
 * Save a domain order to the database
 */
export function saveDomainOrder(order: {
  id: string;
  project_id: string;
  domain: string;
  order_id?: string | null;
  customer_price: number;
  vercel_cost: number;
  currency?: string;
  status: string;
  years?: number;
  domain_added_to_project?: boolean;
}): void {
  const db = getDb();
  const now = Date.now();

  db.prepare(
    `INSERT OR REPLACE INTO domain_orders (
      id, project_id, domain, order_id, customer_price, vercel_cost,
      currency, status, years, domain_added_to_project, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    order.id,
    order.project_id,
    order.domain,
    order.order_id || null,
    order.customer_price,
    order.vercel_cost,
    order.currency || "SEK",
    order.status,
    order.years || 1,
    order.domain_added_to_project ? 1 : 0,
    now,
    now
  );
}

/**
 * Get domain order by ID
 */
export function getDomainOrderById(id: string): DomainOrder | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM domain_orders WHERE id = ?").get(id) as
    | DomainOrderRow
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    project_id: row.project_id,
    domain: row.domain,
    order_id: row.order_id,
    customer_price: row.customer_price,
    vercel_cost: row.vercel_cost,
    currency: row.currency,
    status: row.status,
    years: row.years,
    domain_added_to_project: row.domain_added_to_project,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Get domain orders for a project
 */
export function getDomainOrdersByProjectId(projectId: string): DomainOrder[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM domain_orders WHERE project_id = ? ORDER BY created_at DESC"
    )
    .all(projectId) as DomainOrderRow[];

  return rows.map((row) => ({
    id: row.id,
    project_id: row.project_id,
    domain: row.domain,
    order_id: row.order_id,
    customer_price: row.customer_price,
    vercel_cost: row.vercel_cost,
    currency: row.currency,
    status: row.status,
    years: row.years,
    domain_added_to_project: row.domain_added_to_project,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

/**
 * Update domain order status
 */
export function updateDomainOrderStatus(
  id: string,
  status: string,
  orderId?: string,
  domainAddedToProject?: boolean
): void {
  const db = getDb();
  const now = Date.now();

  if (orderId !== undefined && domainAddedToProject !== undefined) {
    db.prepare(
      `UPDATE domain_orders 
       SET status = ?, order_id = ?, domain_added_to_project = ?, updated_at = ? 
       WHERE id = ?`
    ).run(status, orderId || null, domainAddedToProject ? 1 : 0, now, id);
  } else if (orderId !== undefined) {
    db.prepare(
      `UPDATE domain_orders 
       SET status = ?, order_id = ?, updated_at = ? 
       WHERE id = ?`
    ).run(status, orderId || null, now, id);
  } else if (domainAddedToProject !== undefined) {
    db.prepare(
      `UPDATE domain_orders 
       SET status = ?, domain_added_to_project = ?, updated_at = ? 
       WHERE id = ?`
    ).run(status, domainAddedToProject ? 1 : 0, now, id);
  } else {
    db.prepare(
      `UPDATE domain_orders 
       SET status = ?, updated_at = ? 
       WHERE id = ?`
    ).run(status, now, id);
  }
}
