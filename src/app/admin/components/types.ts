export type AdminTab = "analytics" | "database" | "environment" | "prompts";

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

export interface DatabaseStats {
  database: {
    users: number;
    projects: number;
    pageViews: number;
    transactions: number;
    guestUsage: number;
    companyProfiles: number;
    templateCache?: number;
    templateCacheExpired?: number;
  };
  redis: {
    connected: boolean;
    memoryUsed?: string;
    totalKeys?: number;
    uptime?: number;
  } | null;
  dbFileSize: string;
  uploads?: {
    fileCount: number;
    totalSize: string;
    files: { name: string; size: string }[];
  };
  dataDir?: string;
}

export interface EnvKeyStatus {
  key: string;
  required: boolean;
  present: boolean;
  notes?: string;
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
}

export interface VercelEnvVar {
  id: string | null;
  key: string;
  target: string[];
  type?: string | null;
}

export interface PromptLog {
  id: string;
  event: string;
  userId: string | null;
  sessionId: string | null;
  appProjectId: string | null;
  v0ProjectId: string | null;
  chatId: string | null;
  promptOriginal: string | null;
  promptFormatted: string | null;
  systemPrompt: string | null;
  promptAssistModel: string | null;
  promptAssistDeep: boolean | null;
  promptAssistMode: string | null;
  buildIntent: string | null;
  buildMethod: string | null;
  modelTier: string | null;
  imageGenerations: boolean | null;
  thinking: boolean | null;
  attachmentsCount: number | null;
  meta: Record<string, unknown> | null;
  createdAt: string | null;
}

export interface TeamStatus {
  configured: boolean;
  configuredTeamId: string | null;
  configuredTeam: {
    id: string;
    slug: string;
    name: string;
    plan: string;
    isFree: boolean;
    isPro: boolean;
    isEnterprise: boolean;
  } | null;
  teams: Array<{
    id: string;
    slug: string;
    name: string;
    plan: string;
    isFree: boolean;
    isPro: boolean;
    isEnterprise: boolean;
  }>;
  warnings: string[];
}

export interface TemplateSyncStatus {
  configured: boolean;
  missingRequiredKeys: string[];
  workflowFile: string;
  ref: string;
  includeEmbeddingsDefault: boolean;
  repository: string | null;
}
