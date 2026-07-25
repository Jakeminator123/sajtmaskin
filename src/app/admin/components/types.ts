/**
 * Shared payload types for the admin console.
 *
 * Each block mirrors one `/api/admin/*` (or `/api/analytics`) response — the API
 * is the contract, this file is just the typed view of it. Fields the UI does not
 * render are deliberately absent so drift is visible in review.
 */

export interface AnalyticsStats {
  days: number;
  totalPageViews: number;
  uniqueVisitors: number;
  totalUsers: number;
  totalProjects: number;
  totalGenerations: number;
  totalRefines: number;
  metricScopes: {
    totalPageViews: "period";
    uniqueVisitors: "period";
    totalUsers: "period";
    totalProjects: "period";
    totalGenerations: "all_time";
    totalRefines: "all_time";
  };
  recentPageViews: { path: string; count: number }[];
  dailyViews: { date: string; views: number; unique: number }[];
  topReferrers: { referrer: string; count: number }[];
}

/**
 * Counters are `number | string` on purpose: Postgres returns `count(*)` as a
 * string over the wire, so the honest type forces callers through `formatCount`/
 * `toCount` instead of silently printing `"42"` unformatted.
 */
export type DbCount = number | string;

export interface DatabaseStats {
  database: {
    users: DbCount;
    projects: DbCount;
    pageViews: DbCount;
    transactions: DbCount;
    guestUsage: DbCount;
    companyProfiles: DbCount;
  };
  redis: {
    connected: boolean;
    memoryUsed?: string;
    totalKeys?: DbCount;
    uptime?: number;
  } | null;
  dbFileSize: string;
  uploads?: {
    fileCount: DbCount;
    totalSize: string;
    files: { name: string; size: string }[];
  };
  dataDir?: string;
}

/** `POST /api/admin/database` action `get-cleanup-stats`. */
export interface CleanupStatsPayload {
  success: boolean;
  stats: {
    anonymousProjects: DbCount;
    anonymousProjectsOld: DbCount;
    userProjects: DbCount;
    orphanedFiles: DbCount;
    orphanedImages: DbCount;
    templateCacheCount: DbCount;
    templateCacheExpired: DbCount;
  };
  config?: Record<string, unknown>;
}

export interface EnvKeyStatus {
  key: string;
  required: boolean;
  present: boolean;
  /** From the canonical env policy (`src/lib/env-audit.ts`). */
  classification?:
    | "shared_runtime"
    | "optional_runtime"
    | "environment_specific"
    | "local_only"
    | "vercel_managed";
  notes?: string;
}

export interface OpenClawStatus {
  status: "ok" | "unconfigured" | "unhealthy" | "unreachable";
  surfaceEnabled: boolean;
  surfaceStatus: string;
  blockers: string[];
  debugEnabled: boolean;
  upstream?: number;
  error?: string;
  healthEndpoint?: string;
}

export interface EnvStatusPayload {
  runtime: {
    nodeEnv: string | null;
    vercelEnv: string | null;
    vercel: string | null;
    appUrl: string | null;
    baseUrl: string;
    vercelUrl: string | null;
  };
  vercel: {
    teamId: string | null;
    projectId: string | null;
  };
  openclaw?: OpenClawStatus;
  features: Record<string, boolean>;
  keys: EnvKeyStatus[];
}

export interface IntegrationItem {
  id: string;
  label: string;
  enabled: boolean;
  required: boolean;
  requiredEnv: string[];
  affects: string;
  notes?: string;
}

export interface IntegrationStatus {
  updatedAt: string;
  items: IntegrationItem[];
}

export interface VercelProject {
  id: string;
  name: string;
  accountId: string;
  updatedAt: number;
  /**
   * Set by `GET /api/admin/vercel/projects` for Sajtmaskin's own project
   * (`VERCEL_PROJECT_ID`). The UI refuses to offer deletion for it and the API
   * refuses to perform it — the old admin UI happily deleted production.
   */
  isSelf?: boolean;
}

export interface VercelEnvVar {
  id: string | null;
  key: string;
  target: string[];
  type?: string | null;
}

export interface FrontlogEntry {
  ts: string;
  target: string;
  slug: string | null;
  data: Record<string, unknown>;
}

export interface FrontlogsPayload {
  success: boolean;
  available: boolean;
  slug: string | null;
  latestSlug: string | null;
  slugs: string[];
  entryCount: number;
  entries: FrontlogEntry[];
  note?: string | null;
}

export interface TeamPlanInfo {
  id: string;
  slug: string;
  name: string;
  plan: string;
  isFree: boolean;
  isPro: boolean;
  isEnterprise: boolean;
}

export interface TeamStatus {
  configured: boolean;
  configuredTeamId: string | null;
  configuredTeam: TeamPlanInfo | null;
  teams: TeamPlanInfo[];
  warnings: string[];
}
