/**
 * Generate shared storage helper for backoffice routes
 */
export function generateStorageLib(): string {
  return `import fs from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const COLORS_FILE = path.join(DATA_DIR, "colors.json");
const MANIFEST_FILE = path.join(process.cwd(), "data", "manifest.json");
const STORAGE_BACKEND = process.env.STORAGE_BACKEND?.trim() === "json-blob" ? "json-blob" : "fs";
const VERCEL_ENV = process.env.VERCEL_ENV?.trim().toLowerCase();
const BLOB_ENV_SEGMENT =
  VERCEL_ENV === "production" ? "prod" : VERCEL_ENV === "preview" ? "preview" : "dev";
const DEFAULT_BLOB_PREFIX = \`backoffice/\${BLOB_ENV_SEGMENT}\`;
const BLOB_CONTENT_KEY =
  process.env.BLOB_CONTENT_KEY?.trim() || \`\${DEFAULT_BLOB_PREFIX}/content.json\`;
const BLOB_COLORS_KEY =
  process.env.BLOB_COLORS_KEY?.trim() || \`\${DEFAULT_BLOB_PREFIX}/colors.json\`;

type ContentData = { content: any[]; products: any[]; colors: Record<string, unknown> };

function ensureDataDir() {
  const dir = path.dirname(CONTENT_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readManifest(): ContentData {
  if (fs.existsSync(MANIFEST_FILE)) {
    return JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf-8"));
  }
  return { content: [], products: [], colors: {} };
}

async function readBlobJson<T>(pathname: string): Promise<T | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) return null;

  const blobSdk = await import("@vercel/blob");
  const listResult = await blobSdk.list({
    token,
    prefix: pathname,
    limit: 1,
  });
  const match = listResult.blobs.find((blob) => blob.pathname === pathname) || listResult.blobs[0];
  if (!match) return null;

  const response = await fetch(match.url, { cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

async function writeBlobJson(pathname: string, data: unknown): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required for STORAGE_BACKEND=json-blob");
  }
  const blobSdk = await import("@vercel/blob");
  await blobSdk.put(pathname, JSON.stringify(data, null, 2), {
    access: "public",
    contentType: "application/json",
    token,
    addRandomSuffix: false,
  });
}

export async function loadContentData(): Promise<ContentData> {
  if (STORAGE_BACKEND === "json-blob") {
    const data = await readBlobJson<ContentData>(BLOB_CONTENT_KEY);
    if (data) return data;
    return readManifest();
  }

  ensureDataDir();
  if (!fs.existsSync(CONTENT_FILE)) {
    return readManifest();
  }
  return JSON.parse(fs.readFileSync(CONTENT_FILE, "utf-8"));
}

export async function saveContentData(data: ContentData): Promise<void> {
  if (STORAGE_BACKEND === "json-blob") {
    await writeBlobJson(BLOB_CONTENT_KEY, data);
    return;
  }

  ensureDataDir();
  fs.writeFileSync(CONTENT_FILE, JSON.stringify(data, null, 2));
}

export async function loadColorsData(): Promise<{ colors: Record<string, unknown> | null }> {
  if (STORAGE_BACKEND === "json-blob") {
    const colors = await readBlobJson<Record<string, unknown>>(BLOB_COLORS_KEY);
    if (colors) return { colors };
    const manifest = readManifest();
    return { colors: manifest.colors || null };
  }

  ensureDataDir();
  if (!fs.existsSync(COLORS_FILE)) {
    const manifest = readManifest();
    return { colors: manifest.colors || null };
  }
  return { colors: JSON.parse(fs.readFileSync(COLORS_FILE, "utf-8")) };
}

export async function saveColorsData(colors: Record<string, unknown>): Promise<void> {
  if (STORAGE_BACKEND === "json-blob") {
    await writeBlobJson(BLOB_COLORS_KEY, colors);
    return;
  }

  ensureDataDir();
  fs.writeFileSync(COLORS_FILE, JSON.stringify(colors, null, 2));
}
`;
}
