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
  // Projects table - main project info
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      description TEXT,
      thumbnail_path TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
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

  // ═══════════════════════════════════════════════════════════════════════════
  // INDEXES for better query performance
  // ═══════════════════════════════════════════════════════════════════════════
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
    CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_project_data_chat_id ON project_data(chat_id);
    CREATE INDEX IF NOT EXISTS idx_images_project_id ON images(project_id);
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
  description?: string
): Project {
  const db = getDb();
  const id = generateId();

  const stmt = db.prepare(`
    INSERT INTO projects (id, name, category, description)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(id, name, category || null, description || null);

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
