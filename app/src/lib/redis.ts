/**
 * Redis Client Configuration
 * ==========================
 *
 * Uses Redis Cloud for caching user sessions and frequently accessed data.
 * Reduces database load and improves response times.
 *
 * REDIS KEY STRUCTURE:
 * ====================
 *
 * User Sessions:
 *   user:session:{userId}       → CachedUser JSON (TTL: 7 days)
 *
 * Rate Limiting:
 *   ratelimit:{key}             → Counter (TTL: variable)
 *
 * General Cache:
 *   cache:{key}                 → Any JSON (TTL: 1 hour default)
 *
 * Audit Caching:
 *   audit:{auditId}             → Audit JSON (TTL: 24 hours)
 *   audit_list:{userId}         → Audit list JSON (TTL: 24 hours)
 *
 * Project Storage (Takeover):
 *   project:files:{projectId}   → ProjectFile[] JSON (TTL: 365 days)
 *   project:meta:{projectId}    → ProjectMeta JSON (TTL: 365 days)
 *
 * Video Jobs (Sora):
 *   video:job:{videoId}         → VideoJob JSON (TTL: 1 hour)
 *
 * Preview Cache:
 *   preview:{templateId}        → CachedPreview JSON (TTL: 24 hours)
 */

import Redis from "ioredis";
import { REDIS_CONFIG, FEATURES } from "./config";

// Create Redis client (singleton)
let redisClient: Redis | null = null;

export function getRedis(): Redis | null {
  // Skip if Redis not configured
  if (!FEATURES.useRedisCache) {
    console.log("[Redis] Not configured, skipping Redis connection");
    return null;
  }

  if (!redisClient) {
    try {
      redisClient = new Redis({
        host: REDIS_CONFIG.host,
        port: REDIS_CONFIG.port,
        username: REDIS_CONFIG.username,
        password: REDIS_CONFIG.password,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        connectTimeout: 10000,
        keepAlive: 30000,
      });

      redisClient.on("error", (err) => {
        console.error("[Redis] Connection error:", err.message);
      });

      redisClient.on("connect", () => {
        console.log("[Redis] Connected successfully");
      });

      redisClient.on("ready", () => {
        console.log("[Redis] Ready to accept commands");
      });
    } catch (error) {
      console.error("[Redis] Failed to create client:", error);
      return null;
    }
  }

  return redisClient;
}

// ============ User Session Cache ============

const USER_SESSION_PREFIX = "user:session:";
const USER_SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

export interface CachedUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  diamonds: number;
  provider: string;
}

// Cache user session
export async function cacheUserSession(
  userId: string,
  user: CachedUser
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.setex(
      `${USER_SESSION_PREFIX}${userId}`,
      USER_SESSION_TTL,
      JSON.stringify(user)
    );
  } catch (error) {
    console.error("[Redis] Failed to cache user session:", error);
  }
}

// Get cached user session
export async function getCachedUserSession(
  userId: string
): Promise<CachedUser | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const data = await redis.get(`${USER_SESSION_PREFIX}${userId}`);
    if (data) {
      try {
        return JSON.parse(data) as CachedUser;
      } catch (parseError) {
        console.error("[Redis] Failed to parse cached user session JSON:", parseError);
        // Invalid JSON, delete corrupted cache
        await redis.del(`${USER_SESSION_PREFIX}${userId}`);
        return null;
      }
    }
  } catch (error) {
    console.error("[Redis] Failed to get cached user session:", error);
  }
  return null;
}

// Invalidate user session cache
export async function invalidateUserSession(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.del(`${USER_SESSION_PREFIX}${userId}`);
  } catch (error) {
    console.error("[Redis] Failed to invalidate user session:", error);
  }
}

// Update cached user diamonds
export async function updateCachedUserDiamonds(
  userId: string,
  diamonds: number
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    const data = await redis.get(`${USER_SESSION_PREFIX}${userId}`);
    if (data) {
      try {
        const user = JSON.parse(data) as CachedUser;
        user.diamonds = diamonds;
        await redis.setex(
          `${USER_SESSION_PREFIX}${userId}`,
          USER_SESSION_TTL,
          JSON.stringify(user)
        );
      } catch (parseError) {
        console.error("[Redis] Failed to parse cached user JSON for diamond update:", parseError);
        // Invalid JSON, delete corrupted cache
        await redis.del(`${USER_SESSION_PREFIX}${userId}`);
      }
    }
  } catch (error) {
    console.error("[Redis] Failed to update cached diamonds:", error);
  }
}

// ============ Rate Limiting ============

const RATE_LIMIT_PREFIX = "ratelimit:";

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const redis = getRedis();

  // If no Redis, allow all requests
  if (!redis) {
    return { allowed: true, remaining: maxRequests, resetIn: 0 };
  }

  const redisKey = `${RATE_LIMIT_PREFIX}${key}`;

  try {
    const current = await redis.incr(redisKey);

    if (current === 1) {
      // First request, set expiry
      await redis.expire(redisKey, windowSeconds);
    }

    const ttl = await redis.ttl(redisKey);
    const remaining = Math.max(0, maxRequests - current);

    return {
      allowed: current <= maxRequests,
      remaining,
      resetIn: ttl > 0 ? ttl : windowSeconds,
    };
  } catch (error) {
    console.error("[Redis] Rate limit check failed:", error);
    // On error, allow the request
    return { allowed: true, remaining: maxRequests, resetIn: 0 };
  }
}

// ============ General Cache ============

export async function setCache(
  key: string,
  value: any,
  ttlSeconds: number = 3600
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.setex(`cache:${key}`, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    console.error("[Redis] Failed to set cache:", error);
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const data = await redis.get(`cache:${key}`);
    if (data) {
      return JSON.parse(data) as T;
    }
  } catch (error) {
    console.error("[Redis] Failed to get cache:", error);
  }
  return null;
}

export async function deleteCache(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.del(`cache:${key}`);
  } catch (error) {
    console.error("[Redis] Failed to delete cache:", error);
  }
}

// ============ Audit Caching ============

const AUDIT_CACHE_PREFIX = "audit:";
const AUDIT_LIST_PREFIX = "audit_list:";
const AUDIT_CACHE_TTL = 86400; // 24 hours

/**
 * Cache a single audit result
 */
export async function cacheAudit(
  auditId: number,
  userId: string,
  auditData: Record<string, unknown>
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.setex(
      `${AUDIT_CACHE_PREFIX}${auditId}`,
      AUDIT_CACHE_TTL,
      JSON.stringify(auditData)
    );
    // Invalidate user's audit list cache
    await redis.del(`${AUDIT_LIST_PREFIX}${userId}`);
  } catch (error) {
    console.error("[Redis] Failed to cache audit:", error);
  }
}

/**
 * Get cached audit by ID
 */
export async function getCachedAudit(
  auditId: number
): Promise<Record<string, unknown> | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const data = await redis.get(`${AUDIT_CACHE_PREFIX}${auditId}`);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("[Redis] Failed to get cached audit:", error);
  }
  return null;
}

/**
 * Cache user's audit list (lightweight metadata only)
 */
export async function cacheUserAuditList(
  userId: string,
  audits: Array<{
    id: number;
    domain: string;
    company_name: string | null;
    score_overall: number | null;
    created_at: string;
  }>
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.setex(
      `${AUDIT_LIST_PREFIX}${userId}`,
      AUDIT_CACHE_TTL,
      JSON.stringify(audits)
    );
  } catch (error) {
    console.error("[Redis] Failed to cache audit list:", error);
  }
}

/**
 * Get cached user audit list
 */
export async function getCachedUserAuditList(userId: string): Promise<Array<{
  id: number;
  domain: string;
  company_name: string | null;
  score_overall: number | null;
  created_at: string;
}> | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const data = await redis.get(`${AUDIT_LIST_PREFIX}${userId}`);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("[Redis] Failed to get cached audit list:", error);
  }
  return null;
}

/**
 * Invalidate audit caches for a user
 */
export async function invalidateUserAuditCache(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.del(`${AUDIT_LIST_PREFIX}${userId}`);
  } catch (error) {
    console.error("[Redis] Failed to invalidate audit cache:", error);
  }
}

// ============ Admin Operations ============

export async function getRedisInfo(): Promise<{
  connected: boolean;
  memoryUsed?: string;
  totalKeys?: number;
  uptime?: number;
} | null> {
  const redis = getRedis();
  if (!redis) {
    return { connected: false };
  }

  try {
    const info = await redis.info();
    const dbSize = await redis.dbsize();

    // Parse memory from info
    const memMatch = info.match(/used_memory_human:(\S+)/);
    const uptimeMatch = info.match(/uptime_in_seconds:(\d+)/);

    return {
      connected: true,
      memoryUsed: memMatch?.[1] || "unknown",
      totalKeys: dbSize,
      uptime: uptimeMatch ? parseInt(uptimeMatch[1]) : undefined,
    };
  } catch (error) {
    console.error("[Redis] Failed to get info:", error);
    return { connected: false };
  }
}

export async function flushRedisCache(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  try {
    await redis.flushdb();
    console.log("[Redis] Cache flushed");
    return true;
  } catch (error) {
    console.error("[Redis] Failed to flush cache:", error);
    return false;
  }
}

// ============ Project Files Storage ============
// For "taken over" projects - stores files in Redis for agent editing

const PROJECT_FILES_PREFIX = "project:files:";
const PROJECT_META_PREFIX = "project:meta:";
const PROJECT_FILES_TTL = 60 * 60 * 24 * 365; // 365 days (1 year) - extended to prevent data loss

export interface ProjectFile {
  path: string;
  content: string;
  lastModified?: string;
}

export interface ProjectMeta {
  projectId: string;
  userId: string;
  name: string;
  takenOverAt: string;
  storageType: "redis" | "github";
  githubRepo?: string;
  githubOwner?: string;
  filesCount: number;
}

/**
 * Save project files to Redis (for takeover without GitHub)
 */
export async function saveProjectFiles(
  projectId: string,
  files: ProjectFile[]
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    console.error("[Redis] Cannot save project files - Redis not available");
    return false;
  }

  try {
    // Store files as JSON
    await redis.setex(
      `${PROJECT_FILES_PREFIX}${projectId}`,
      PROJECT_FILES_TTL,
      JSON.stringify(files)
    );
    console.log(`[Redis] Saved ${files.length} files for project ${projectId}`);
    return true;
  } catch (error) {
    console.error("[Redis] Failed to save project files:", error);
    return false;
  }
}

/**
 * Get project files from Redis
 * Also refreshes TTL on each read to prevent data expiration for active projects
 */
export async function getProjectFiles(
  projectId: string
): Promise<ProjectFile[] | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const key = `${PROJECT_FILES_PREFIX}${projectId}`;
    const data = await redis.get(key);
    if (data) {
      // Touch TTL on read to keep active projects alive
      await redis.expire(key, PROJECT_FILES_TTL);
      return JSON.parse(data) as ProjectFile[];
    }
  } catch (error) {
    console.error("[Redis] Failed to get project files:", error);
  }
  return null;
}

/**
 * Update a single file in the project
 */
export async function updateProjectFile(
  projectId: string,
  filePath: string,
  content: string
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  try {
    const files = await getProjectFiles(projectId);
    if (!files) return false;

    const fileIndex = files.findIndex((f) => f.path === filePath);
    if (fileIndex >= 0) {
      files[fileIndex].content = content;
      files[fileIndex].lastModified = new Date().toISOString();
    } else {
      // Add new file
      files.push({
        path: filePath,
        content,
        lastModified: new Date().toISOString(),
      });
    }

    await redis.setex(
      `${PROJECT_FILES_PREFIX}${projectId}`,
      PROJECT_FILES_TTL,
      JSON.stringify(files)
    );
    return true;
  } catch (error) {
    console.error("[Redis] Failed to update project file:", error);
    return false;
  }
}

/**
 * Delete a file from the project
 */
export async function deleteProjectFile(
  projectId: string,
  filePath: string
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  try {
    const files = await getProjectFiles(projectId);
    if (!files) return false;

    const filteredFiles = files.filter((f) => f.path !== filePath);
    await redis.setex(
      `${PROJECT_FILES_PREFIX}${projectId}`,
      PROJECT_FILES_TTL,
      JSON.stringify(filteredFiles)
    );
    return true;
  } catch (error) {
    console.error("[Redis] Failed to delete project file:", error);
    return false;
  }
}

/**
 * Save project metadata
 */
export async function saveProjectMeta(meta: ProjectMeta): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  try {
    await redis.setex(
      `${PROJECT_META_PREFIX}${meta.projectId}`,
      PROJECT_FILES_TTL,
      JSON.stringify(meta)
    );
    return true;
  } catch (error) {
    console.error("[Redis] Failed to save project meta:", error);
    return false;
  }
}

/**
 * Get project metadata
 * Also refreshes TTL on each read to prevent data expiration for active projects
 */
export async function getProjectMeta(
  projectId: string
): Promise<ProjectMeta | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const key = `${PROJECT_META_PREFIX}${projectId}`;
    const data = await redis.get(key);
    if (data) {
      // Touch TTL on read to keep active projects alive
      await redis.expire(key, PROJECT_FILES_TTL);
      return JSON.parse(data) as ProjectMeta;
    }
  } catch (error) {
    console.error("[Redis] Failed to get project meta:", error);
  }
  return null;
}

/**
 * List all taken-over projects for a user
 * Uses SCAN instead of KEYS to avoid blocking Redis with large datasets
 */
export async function listUserTakenOverProjects(
  userId: string
): Promise<ProjectMeta[]> {
  const redis = getRedis();
  if (!redis) return [];

  try {
    const projects: ProjectMeta[] = [];
    let cursor = "0";
    const pattern = `${PROJECT_META_PREFIX}*`;

    // Use SCAN to iterate through keys without blocking Redis
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100
      );
      cursor = nextCursor;

      // Fetch project metadata for each key
      if (keys.length > 0) {
        // Use pipeline for batch fetching (more efficient)
        const pipeline = redis.pipeline();
        for (const key of keys) {
          pipeline.get(key);
        }
        const results = await pipeline.exec();

        if (results) {
          for (const [err, data] of results) {
            if (!err && data) {
              try {
                const meta = JSON.parse(data as string) as ProjectMeta;
                if (meta.userId === userId) {
                  projects.push(meta);
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }
      }
    } while (cursor !== "0");

    // Sort by takenOverAt descending (newest first)
    return projects.sort(
      (a, b) =>
        new Date(b.takenOverAt).getTime() - new Date(a.takenOverAt).getTime()
    );
  } catch (error) {
    console.error("[Redis] Failed to list user projects:", error);
    return [];
  }
}

// ============ Video Job Storage ============
// For async video generation tracking (Sora API)

const VIDEO_JOB_PREFIX = "video:job:";
const VIDEO_JOB_TTL = 60 * 60; // 1 hour - video jobs expire after completion

export interface VideoJob {
  videoId: string;
  userId: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  prompt: string;
  model: string;
  createdAt: string;
  completedAt?: string;
  downloadUrl?: string;
  error?: string;
}

/**
 * Save a video generation job
 */
export async function saveVideoJob(job: VideoJob): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    console.warn("[Redis] Cannot save video job - Redis not available");
    return false;
  }

  try {
    await redis.setex(
      `${VIDEO_JOB_PREFIX}${job.videoId}`,
      VIDEO_JOB_TTL,
      JSON.stringify(job)
    );
    console.log(`[Redis] Saved video job: ${job.videoId}`);
    return true;
  } catch (error) {
    console.error("[Redis] Failed to save video job:", error);
    return false;
  }
}

/**
 * Get a video job by ID
 */
export async function getVideoJob(videoId: string): Promise<VideoJob | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const data = await redis.get(`${VIDEO_JOB_PREFIX}${videoId}`);
    if (data) {
      return JSON.parse(data) as VideoJob;
    }
  } catch (error) {
    console.error("[Redis] Failed to get video job:", error);
  }
  return null;
}

/**
 * Update a video job's status
 */
export async function updateVideoJob(
  videoId: string,
  updates: Partial<VideoJob>
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  try {
    const job = await getVideoJob(videoId);
    if (!job) return false;

    const updatedJob = { ...job, ...updates };
    await redis.setex(
      `${VIDEO_JOB_PREFIX}${videoId}`,
      VIDEO_JOB_TTL,
      JSON.stringify(updatedJob)
    );
    return true;
  } catch (error) {
    console.error("[Redis] Failed to update video job:", error);
    return false;
  }
}

// ============ Preview Cache ============
// For template preview caching (reduces v0 API calls)

const PREVIEW_CACHE_PREFIX = "preview:";
const PREVIEW_CACHE_TTL = 60 * 60 * 24; // 24 hours

export interface CachedPreview {
  templateId: string;
  demoUrl: string;
  chatId: string;
  versionId: string;
  code?: string;
  cachedAt: string;
}

/**
 * Cache a template preview
 */
export async function cachePreview(preview: CachedPreview): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  try {
    await redis.setex(
      `${PREVIEW_CACHE_PREFIX}${preview.templateId}`,
      PREVIEW_CACHE_TTL,
      JSON.stringify(preview)
    );
    console.log(`[Redis] Cached preview for template: ${preview.templateId}`);
    return true;
  } catch (error) {
    console.error("[Redis] Failed to cache preview:", error);
    return false;
  }
}

/**
 * Get cached preview for a template
 */
export async function getCachedPreview(
  templateId: string
): Promise<CachedPreview | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const data = await redis.get(`${PREVIEW_CACHE_PREFIX}${templateId}`);
    if (data) {
      return JSON.parse(data) as CachedPreview;
    }
  } catch (error) {
    console.error("[Redis] Failed to get cached preview:", error);
  }
  return null;
}

/**
 * Invalidate a cached preview
 */
export async function invalidatePreview(templateId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.del(`${PREVIEW_CACHE_PREFIX}${templateId}`);
  } catch (error) {
    console.error("[Redis] Failed to invalidate preview:", error);
  }
}

// ============ Cleanup ============

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
