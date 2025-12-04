import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Database file location - stored in app root
const DB_PATH = path.join(process.cwd(), "sajtmaskin.db");

// Uploads directory for images
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
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
  // Users table - for future Google OAuth
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT,
      image TEXT,
      provider TEXT DEFAULT 'anonymous',
      created_at TEXT DEFAULT (datetime('now')),
      last_login TEXT DEFAULT (datetime('now'))
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
  `);

  console.log("[Database] Initialized successfully at:", DB_PATH);
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

// Get uploads directory path
export function getUploadsDir(): string {
  return UPLOADS_DIR;
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
