/**
 * Shared payload types for the admin console.
 *
 * Each block mirrors one `/api/admin/*` (or `/api/analytics`) response — the API
 * is the contract, this file is just the typed view of it. Fields the UI does not
 * render are deliberately absent so drift is visible in review.
 */

/**
 * Counters are `number | string` on purpose: Postgres returns `count(*)` as a
 * string over the wire even where the service types it as `number`. The honest
 * type forces callers through `formatCount`/`toCount` in `ui-bits.tsx`.
 */
export type DbCount = number | string;

export interface AnalyticsStats {
  days: number;
  totalPageViews: DbCount;
  uniqueVisitors: DbCount;
  totalUsers: DbCount;
  totalProjects: DbCount;
  totalGenerations: DbCount;
  totalRefines: DbCount;
  metricScopes: {
    totalPageViews: "period";
    uniqueVisitors: "period";
    totalUsers: "period";
    totalProjects: "period";
    totalGenerations: "all_time";
    totalRefines: "all_time";
  };
  recentPageViews: { path: string; count: DbCount }[];
  dailyViews: { date: string; views: DbCount; unique: DbCount }[];
  topReferrers: { referrer: string; count: DbCount }[];
}

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
  editEnabled: boolean;
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
  /**
   * The delete decision from `src/lib/vercel/self-project-guard.ts`, mirrored so
   * the UI never offers an action the API rejects. `false` for the app's own
   * project AND for every project while the app's own id is unknown.
   */
  deletable?: boolean;
}

/** `GET /api/admin/vercel/projects` envelope. */
export interface VercelProjectsPayload {
  projects: VercelProject[];
  /** False → the app cannot identify its own project, so deletion is disabled. */
  selfProjectKnown?: boolean;
  selfProjectIdSource?: "env" | "vercel-link" | null;
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

export interface GenerationBillingSettingsPayload {
  markupBasisPoints: number;
  markupMultiplier: number;
  usdToSekOre: number;
  usdToSek: number;
  sekPerCreditOre: number;
  sekPerCredit: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface GenerationBillingRowPayload {
  id: string;
  versionId: string;
  versionNumber: number | null;
  chatId: string;
  chatTitle: string | null;
  projectId: string | null;
  projectName: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  status: string;
  providerCostMicroUsd: number;
  providerCostOre: number;
  markupBasisPoints: number;
  billableOre: number;
  usdToSekOre: number;
  sekPerCreditOre: number;
  creditsCharged: number;
  freeGenerationApplied: boolean;
  llmCalls: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  pricingVersion: string;
  priceBreakdown: unknown;
  promptExcerpt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationBillingPayload {
  success: boolean;
  settings: GenerationBillingSettingsPayload;
  days: number;
  windowStart: string;
  windowEnd: string;
  summary: {
    generations: number;
    providerCostOre: number;
    billableOre: number;
    creditsCharged: number;
    freeGenerations: number;
    llmCalls: number;
    openAiProviderCostMicroUsd: number;
  };
  users: Array<{
    userId: string | null;
    name: string;
    email: string | null;
    generations: number;
    providerCostOre: number;
    creditsCharged: number;
    freeGenerations: number;
  }>;
  generations: GenerationBillingRowPayload[];
  openAiReconciliation: {
    status: "ok" | "unconfigured" | "error";
    scope: "organization";
    attribution: "daily_org_project_api_key_line_item_only";
    windowStart: string;
    windowEnd: string;
    totalCostMicroUsd: number;
    currency: "usd";
    buckets: Array<{
      startTime: string;
      endTime: string;
      costMicroUsd: number;
    }>;
    lineItems: Array<{
      lineItem: string;
      projectId: string | null;
      apiKeyId: string | null;
      costMicroUsd: number;
    }>;
    fetchedAt: string | null;
    error: string | null;
  };
}
