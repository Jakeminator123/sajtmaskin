/**
 * Centralized Vercel Blob Storage Service
 * ========================================
 *
 * All blob operations go through this service to ensure:
 * 1. Consistent tenant/user isolation via path prefixes
 * 2. Single source of truth for blob configuration
 * 3. Easy to audit and maintain
 *
 * PATH STRUCTURE:
 * All files are stored with user isolation:
 *   {userId}/media/{filename}           - User's media library files
 *   {userId}/projects/{projectId}/{...} - Project-specific files
 *   {userId}/ai-images/{filename}       - AI-generated images (no project)
 *
 * This ensures:
 * - Each user's files are namespaced under their ID
 * - Easy GDPR deletion (delete everything under userId/)
 * - Clear audit trail
 * - No accidental cross-user file access
 *
 * NOTE: This file can be imported by client components.
 * Local file storage is handled in API routes, not here.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface BlobUploadResult {
  url: string;
  path: string;
  storageType: "blob" | "local" | "dataurl";
}

export interface BlobUploadOptions {
  userId: string;
  filename: string;
  buffer: Buffer;
  contentType: string;
  projectId?: string;
  category?: "media" | "ai-images" | "project-files";
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Track if blob warning has been logged (module-level to avoid spam)
let _blobWarningLogged = false;

/**
 * Check if Vercel Blob is configured
 *
 * CRITICAL: Without BLOB_READ_WRITE_TOKEN, AI-generated images will NOT work
 * in v0's preview! v0's demoUrl is hosted on v0's servers (vusercontent.net)
 * which cannot access local files - they need public URLs from Vercel Blob.
 */
export function isBlobConfigured(): boolean {
  const configured = !!process.env.BLOB_READ_WRITE_TOKEN;

  // Log warning once per process if not configured
  if (!configured && !_blobWarningLogged) {
    _blobWarningLogged = true;
    console.warn(
      "[BlobService] ⚠️ BLOB_READ_WRITE_TOKEN not configured!\n" +
        "  → AI-generated images will NOT appear in v0 preview\n" +
        "  → Set BLOB_READ_WRITE_TOKEN in .env.local to enable\n" +
        "  → Get token from: https://vercel.com/dashboard/stores",
    );
  }

  return configured;
}

// ============================================================================
// PATH HELPERS (no fs dependencies)
// ============================================================================

/**
 * Get file extension from filename (without using path module)
 */
function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === 0) return ".png";
  return filename.substring(lastDot);
}

/**
 * Build an isolated blob path with user prefix
 * This is the core of our tenant isolation strategy
 */
export function buildBlobPath(
  userId: string,
  filename: string,
  options?: {
    projectId?: string;
    category?: "media" | "ai-images" | "project-files";
  },
): string {
  const category = options?.category || "media";

  // All paths start with userId for isolation
  if (options?.projectId) {
    // Project-specific files: {userId}/projects/{projectId}/{category}/{filename}
    return `${userId}/projects/${options.projectId}/${category}/${filename}`;
  }

  // User-level files: {userId}/{category}/{filename}
  return `${userId}/${category}/${filename}`;
}

/**
 * Generate a unique filename with timestamp
 */
export function generateUniqueFilename(originalName: string, prefix?: string): string {
  const ext = getExtension(originalName);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const prefixStr = prefix ? `${prefix}_` : "";
  return `${prefixStr}${timestamp}_${random}${ext}`;
}

// ============================================================================
// UPLOAD FUNCTIONS
// ============================================================================

/**
 * Upload a file to Vercel Blob storage
 * Returns null if blob storage is not configured
 */
async function uploadToVercelBlob(
  blobPath: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ url: string } | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.log("[BlobService] ⚠️ BLOB_READ_WRITE_TOKEN not configured");
    return null;
  }

  try {
    const { put } = await import("@vercel/blob");
    const blob = await put(blobPath, buffer, {
      access: "public",
      contentType,
      addRandomSuffix: false, // We handle uniqueness in filename
    });

    console.log("[BlobService] ✅ Uploaded to Vercel Blob:", blobPath);
    return { url: blob.url };
  } catch (error) {
    console.error("[BlobService] ❌ Vercel Blob upload failed:", error);
    return null;
  }
}

/**
 * Main upload function - uploads to Vercel Blob
 * Local fallback should be handled in API routes if needed
 *
 * @example
 * // Upload a media file
 * const result = await uploadBlob({
 *   userId: "user_123",
 *   filename: "avatar.png",
 *   buffer: imageBuffer,
 *   contentType: "image/png",
 *   category: "media"
 * });
 */
export async function uploadBlob(options: BlobUploadOptions): Promise<BlobUploadResult | null> {
  const { userId, filename, buffer, contentType, projectId, category } = options;

  // Build isolated path
  const blobPath = buildBlobPath(userId, filename, { projectId, category });

  // Upload to Vercel Blob
  const blobResult = await uploadToVercelBlob(blobPath, buffer, contentType);

  if (blobResult) {
    return {
      url: blobResult.url,
      path: blobPath,
      storageType: "blob",
    };
  }

  // Return null - local fallback handled in API routes
  console.log("[BlobService] ⚠️ Upload failed, fallback to local in API route");
  return null;
}

/**
 * Upload from base64 string (convenience for AI-generated images)
 */
export async function uploadBlobFromBase64(
  userId: string,
  base64: string,
  options?: {
    projectId?: string;
    filenamePrefix?: string;
    contentType?: string;
  },
): Promise<BlobUploadResult | null> {
  const buffer = Buffer.from(base64, "base64");
  const filename = generateUniqueFilename(".png", options?.filenamePrefix || "ai");

  return uploadBlob({
    userId,
    filename,
    buffer,
    contentType: options?.contentType || "image/png",
    projectId: options?.projectId,
    category: "ai-images",
  });
}

// ============================================================================
// DELETE FUNCTIONS
// ============================================================================

/**
 * Delete a blob from Vercel Blob storage
 */
export async function deleteBlob(url: string): Promise<boolean> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.log("[BlobService] ⚠️ Cannot delete - BLOB_READ_WRITE_TOKEN not configured");
    return false;
  }

  try {
    const { del } = await import("@vercel/blob");
    await del(url);
    console.log("[BlobService] ✅ Deleted from Vercel Blob:", url);
    return true;
  } catch (error) {
    console.error("[BlobService] ❌ Delete failed:", error);
    return false;
  }
}

// ============================================================================
// LIST FUNCTIONS
// ============================================================================

/**
 * List all blobs for a user (useful for GDPR deletion)
 */
export async function listUserBlobs(
  userId: string,
  options?: { prefix?: string; limit?: number },
): Promise<string[]> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return [];
  }

  try {
    const { list } = await import("@vercel/blob");
    const prefix = options?.prefix ? `${userId}/${options.prefix}` : `${userId}/`;

    const result = await list({
      prefix,
      limit: options?.limit || 1000,
    });

    return result.blobs.map((blob) => blob.url);
  } catch (error) {
    console.error("[BlobService] ❌ List failed:", error);
    return [];
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a URL is from Vercel Blob storage
 */
export function isVercelBlobUrl(url: string): boolean {
  return url.includes(".blob.vercel-storage.com");
}
