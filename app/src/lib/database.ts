import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// Database file location - use DATA_DIR env var for persistent storage (e.g., /var/data on Render)
const DATA_DIR = process.env.DATA_DIR || process.cwd();
const DB_PATH = path.join(DATA_DIR, "sajtmaskin.db");

// Test user configuration - unlimited credits for testing
// Login with email: "test@gmail.com" and password: "Ma!!orca123"
// This user also has admin access to /admin
export const TEST_USER_EMAIL = "test@gmail.com";
export const TEST_USER_PASSWORD = "Ma!!orca123";
export const TEST_USER_DIAMONDS = 999999;

// Simple password hash function (same as in auth.ts)
function hashPasswordInternal(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
}

// Uploads directory for images - use DATA_DIR for persistent storage
// NOTE: Directory is created lazily via getUploadsDir() to avoid build-time errors on Render
function getUploadsPath(): string {
  return process.env.DATA_DIR
    ? path.join(process.env.DATA_DIR, "uploads")
    : path.join(process.cwd(), "public", "uploads");
}

// Create database connection (singleton pattern)
let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL"); // Better performance for concurrent access
    initializeDatabase(db);
  }
  return db;
}

// Initialize database schema
function initializeDatabase(database: Database.Database) {
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

  // Template screenshots cache - stores v0 API screenshots for template cards
  database.exec(`
    CREATE TABLE IF NOT EXISTS template_screenshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id TEXT NOT NULL UNIQUE,
      screenshot_url TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
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
  // INDEXES for better query performance
  // ═══════════════════════════════════════════════════════════════════════════
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
    CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_projects_session_id ON projects(session_id);
    CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_project_data_chat_id ON project_data(chat_id);
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
  `);

  // Create test/admin user if it doesn't exist
  ensureTestUserExists(database);

  console.log("[Database] Initialized successfully at:", DB_PATH);
}

// Ensure test user exists (for admin access and testing)
function ensureTestUserExists(database: Database.Database) {
  const existingUser = database
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(TEST_USER_EMAIL);

  if (!existingUser) {
    const passwordHash = hashPasswordInternal(TEST_USER_PASSWORD);
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

    console.log("[Database] Created test user:", TEST_USER_EMAIL);
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
  files: any[];
  messages: any[];
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

  return getProjectById(id)!;
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

// Get projects by session ID (for anonymous users)
export function getProjectsBySession(sessionId: string): Project[] {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT * FROM projects WHERE session_id = ? ORDER BY updated_at DESC"
  );
  return stmt.all(sessionId) as Project[];
}

// Get projects by user ID (for authenticated users)
export function getProjectsByUser(userId: string): Project[] {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC"
  );
  return stmt.all(userId) as Project[];
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
  const values: any[] = [];

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
  const row = stmt.get(projectId) as any;

  if (!row) return null;

  return {
    project_id: row.project_id,
    chat_id: row.chat_id,
    demo_url: row.demo_url,
    current_code: row.current_code,
    files: row.files_json ? JSON.parse(row.files_json) : [],
    messages: row.messages_json ? JSON.parse(row.messages_json) : [],
  };
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

// Delete image
export function deleteImage(imageId: number): boolean {
  const db = getDb();

  // Get image path first
  const getStmt = db.prepare("SELECT file_path FROM images WHERE id = ?");
  const img = getStmt.get(imageId) as { file_path: string } | undefined;

  if (img?.file_path && fs.existsSync(img.file_path)) {
    try {
      fs.unlinkSync(img.file_path);
    } catch (e) {
      console.error("[Database] Failed to delete image file:", e);
    }
  }

  const stmt = db.prepare("DELETE FROM images WHERE id = ?");
  const result = stmt.run(imageId);
  return result.changes > 0;
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

  return getTemplateScreenshot(templateId)!;
}

// Get all cached template screenshots
export function getAllTemplateScreenshots(): TemplateScreenshot[] {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM template_screenshots");
  return stmt.all() as TemplateScreenshot[];
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
  const row = stmt.get(id) as any;

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
  const row = stmt.get(projectId) as any;

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
  const row = stmt.get(companyName) as any;

  if (!row) return null;

  return parseCompanyProfileRow(row);
}

// Get all company profiles
export function getAllCompanyProfiles(): CompanyProfile[] {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT * FROM company_profiles ORDER BY updated_at DESC"
  );
  const rows = stmt.all() as any[];

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
  const rows = stmt.all(searchTerm, searchTerm, searchTerm) as any[];

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
function parseCompanyProfileRow(row: any): CompanyProfile {
  return {
    id: row.id,
    project_id: row.project_id,
    company_name: row.company_name,
    industry: row.industry,
    location: row.location,
    existing_website: row.existing_website,
    website_analysis: row.website_analysis,
    site_likes: row.site_likes ? JSON.parse(row.site_likes) : undefined,
    site_dislikes: row.site_dislikes
      ? JSON.parse(row.site_dislikes)
      : undefined,
    site_feedback: row.site_feedback,
    target_audience: row.target_audience,
    purposes: row.purposes ? JSON.parse(row.purposes) : undefined,
    special_wishes: row.special_wishes,
    color_palette_name: row.color_palette_name,
    color_primary: row.color_primary,
    color_secondary: row.color_secondary,
    color_accent: row.color_accent,
    competitor_insights: row.competitor_insights,
    industry_trends: row.industry_trends,
    research_sources: row.research_sources
      ? JSON.parse(row.research_sources)
      : undefined,
    inspiration_sites: row.inspiration_sites
      ? JSON.parse(row.inspiration_sites)
      : undefined,
    voice_transcript: row.voice_transcript,
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
  const row = stmt.get(id) as any;
  if (!row) return null;
  return parseUserRow(row);
}

// Get user by email
export function getUserByEmail(email: string): User | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
  const row = stmt.get(email.toLowerCase()) as any;
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

// Verify user email
export function verifyUserEmail(userId: string): void {
  const db = getDb();
  const stmt = db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?");
  stmt.run(userId);
}

// Helper to parse user row
function parseUserRow(row: any): User {
  // Test user always has unlimited diamonds
  const isTest = row.email === TEST_USER_EMAIL;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    image: row.image,
    password_hash: row.password_hash,
    email_verified: row.email_verified === 1,
    provider: row.provider || "anonymous",
    diamonds: isTest ? TEST_USER_DIAMONDS : row.diamonds ?? 5,
    created_at: row.created_at,
    last_login: row.last_login,
  };
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
  let usage = getGuestUsage(sessionId);
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

// Check if guest can generate (max 1 generation)
export function canGuestGenerate(sessionId: string): boolean {
  const usage = getOrCreateGuestUsage(sessionId);
  return usage.generations_used < 1;
}

// Check if guest can refine (max 1 refine)
export function canGuestRefine(sessionId: string): boolean {
  const usage = getOrCreateGuestUsage(sessionId);
  return usage.refines_used < 1;
}

// ============ Transaction Operations ============

export type TransactionType =
  | "signup_bonus"
  | "generation"
  | "refine"
  | "purchase"
  | "admin_adjust";

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
        .get(cutoffStr) as any
    )?.count || 0;

  // Unique visitors (by session_id or ip_address)
  const uniqueVisitors =
    (
      db
        .prepare(
          `SELECT COUNT(DISTINCT COALESCE(session_id, ip_address)) as count 
           FROM page_views WHERE created_at >= ?`
        )
        .get(cutoffStr) as any
    )?.count || 0;

  // Total users
  const totalUsers =
    (db.prepare("SELECT COUNT(*) as count FROM users").get() as any)?.count ||
    0;

  // Total projects
  const totalProjects =
    (db.prepare("SELECT COUNT(*) as count FROM projects").get() as any)
      ?.count || 0;

  // Total generations (from guest_usage + transactions)
  const guestGenerations =
    (
      db
        .prepare("SELECT SUM(generations_used) as sum FROM guest_usage")
        .get() as any
    )?.sum || 0;
  const userGenerations =
    (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM transactions WHERE type = 'generation'"
        )
        .get() as any
    )?.count || 0;
  const totalGenerations = guestGenerations + userGenerations;

  // Total refines
  const guestRefines =
    (
      db
        .prepare("SELECT SUM(refines_used) as sum FROM guest_usage")
        .get() as any
    )?.sum || 0;
  const userRefines =
    (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM transactions WHERE type = 'refine'"
        )
        .get() as any
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
