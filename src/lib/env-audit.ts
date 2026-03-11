import { serverSchema } from "@/lib/env";

export type VercelTarget = "development" | "preview" | "production";
export type EnvValueState = "set" | "empty" | "placeholder" | "missing";
export type EnvClassification =
  | "shared_runtime"
  | "optional_runtime"
  | "environment_specific"
  | "local_only"
  | "vercel_managed";

export interface EnvRule {
  key: string;
  classification: EnvClassification;
  recommendedVercelTargets: VercelTarget[];
  notes?: string;
}

const ALL_TARGETS: VercelTarget[] = ["development", "preview", "production"];
const DEPLOY_TARGETS: VercelTarget[] = ["preview", "production"];
const DEV_ONLY_TARGETS: VercelTarget[] = ["development"];

const RULES: EnvRule[] = [
  {
    key: "POSTGRES_URL",
    classification: "shared_runtime",
    recommendedVercelTargets: ALL_TARGETS,
    notes: "Primar databasanslutning for appen och migrations.",
  },
  {
    key: "POSTGRES_PRISMA_URL",
    classification: "optional_runtime",
    recommendedVercelTargets: ALL_TARGETS,
    notes: "Alternativ databas-URL for Prisma / pooling.",
  },
  {
    key: "POSTGRES_URL_NON_POOLING",
    classification: "optional_runtime",
    recommendedVercelTargets: ALL_TARGETS,
    notes: "Direktanslutning utan poolning for migreringar eller adminjobb.",
  },
  {
    key: "JWT_SECRET",
    classification: "shared_runtime",
    recommendedVercelTargets: ALL_TARGETS,
    notes: "Maste vara stabil mellan lokalt, preview och produktion for auth/sessioner.",
  },
  {
    key: "V0_API_KEY",
    classification: "shared_runtime",
    recommendedVercelTargets: ALL_TARGETS,
    notes: "Krav for v0-plattformsintegration och fallback-floden.",
  },
  {
    key: "OPENAI_API_KEY",
    classification: "shared_runtime",
    recommendedVercelTargets: ALL_TARGETS,
    notes: "Primar nyckel for egen motor och AI-hjalprutter.",
  },
  {
    key: "AI_GATEWAY_API_KEY",
    classification: "optional_runtime",
    recommendedVercelTargets: ALL_TARGETS,
    notes: "Anvands nar appen kor via AI Gateway i stallet for direkt OpenAI.",
  },
  {
    key: "VERCEL_TOKEN",
    classification: "shared_runtime",
    recommendedVercelTargets: ALL_TARGETS,
    notes: "Krav for Vercel API-kopplingar, deploy och env-audits.",
  },
  {
    key: "VERCEL_TEAM_ID",
    classification: "shared_runtime",
    recommendedVercelTargets: ALL_TARGETS,
    notes: "Binder appen till ratt Vercel-team.",
  },
  {
    key: "VERCEL_PROJECT_ID",
    classification: "shared_runtime",
    recommendedVercelTargets: ALL_TARGETS,
    notes: "Binder appen till ratt Vercel-projekt.",
  },
  {
    key: "VERCEL_WEBHOOK_SECRET",
    classification: "optional_runtime",
    recommendedVercelTargets: ALL_TARGETS,
    notes: "Validerar inkommande webhooks fran Vercel.",
  },
  {
    key: "VERCEL_OIDC_TOKEN",
    classification: "environment_specific",
    recommendedVercelTargets: DEV_ONLY_TARGETS,
    notes: "Rotations-token som uppdateras lokalt via `vercel env pull`; ska inte blind-synkas till preview/produktion.",
  },
  {
    key: "NEXT_PUBLIC_APP_URL",
    classification: "environment_specific",
    recommendedVercelTargets: DEPLOY_TARGETS,
    notes: "Har normalt olika varden lokalt och i deployad miljo.",
  },
  {
    key: "NEXT_PUBLIC_BASE_URL",
    classification: "environment_specific",
    recommendedVercelTargets: DEPLOY_TARGETS,
    notes: "Publik bas-URL for externa callback- och delningslankar.",
  },
  {
    key: "GOOGLE_REDIRECT_URI",
    classification: "environment_specific",
    recommendedVercelTargets: DEPLOY_TARGETS,
    notes: "OAuth-callback skiljer ofta mellan localhost och deployment.",
  },
  {
    key: "GITHUB_REDIRECT_URI",
    classification: "environment_specific",
    recommendedVercelTargets: DEPLOY_TARGETS,
    notes: "OAuth-callback skiljer ofta mellan localhost och deployment.",
  },
  {
    key: "DATA_DIR",
    classification: "local_only",
    recommendedVercelTargets: [],
    notes: "Filsystemslagring ar lokal/serverbunden och brukar inte anvandas pa Vercel.",
  },
  {
    key: "AUTH_DEBUG",
    classification: "local_only",
    recommendedVercelTargets: [],
    notes: "Lokal felsokningsflagga.",
  },
  {
    key: "DEBUG",
    classification: "local_only",
    recommendedVercelTargets: [],
    notes: "Generell lokal debugflagga.",
  },
  {
    key: "SAJTMASKIN_DEV_LOG",
    classification: "local_only",
    recommendedVercelTargets: [],
    notes: "Utvecklingsloggning som inte ska speglas till deployad miljo.",
  },
  {
    key: "SAJTMASKIN_DEV_LOG_DOC_MAX_WORDS",
    classification: "local_only",
    recommendedVercelTargets: [],
    notes: "Tuning for lokal utvecklingsloggning.",
  },
  {
    key: "TEST_USER_EMAIL",
    classification: "local_only",
    recommendedVercelTargets: [],
    notes: "Lokal testanvandare.",
  },
  {
    key: "TEST_USER_PASSWORD",
    classification: "local_only",
    recommendedVercelTargets: [],
    notes: "Lokalt testlosenord.",
  },
  {
    key: "INSPECTOR_CAPTURE_WORKER_URL",
    classification: "environment_specific",
    recommendedVercelTargets: ALL_TARGETS,
    notes: "Kan peka pa lokal worker i dev men pa en deployad worker i preview/produktion.",
  },
  {
    key: "INSPECTOR_CAPTURE_WORKER_TOKEN",
    classification: "optional_runtime",
    recommendedVercelTargets: ALL_TARGETS,
    notes: "Delad hemlighet for inspector-worker.",
  },
  {
    key: "INSPECTOR_FORCE_WORKER_ONLY",
    classification: "environment_specific",
    recommendedVercelTargets: ALL_TARGETS,
    notes: "Lokal fallback kan vara pa i dev men avstangd i serverless-miljoer.",
  },
  {
    key: "INSPECTOR_CAPTURE_WORKER_TIMEOUT_MS",
    classification: "optional_runtime",
    recommendedVercelTargets: ALL_TARGETS,
    notes: "Tuning for inspector capture-timeout.",
  },
];

const RULE_BY_KEY = new Map(RULES.map((rule) => [rule.key, rule]));

const EXTRA_KNOWN_KEYS = [
  "ADMIN_EMAILS",
  "ADMIN_CREDENTIALS",
  "ANTHROPIC_API_KEY",
  "BACKOFFICE_PASSWORD",
  "BACKOFFICE_SESSION_VERSION",
  "BLOB_CONTENT_KEY",
  "BLOB_COLORS_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "BRAVE_API_KEY",
  "CRON_SECRET",
  "CSP_ENFORCE",
  "DB_SSL_REJECT_UNAUTHORIZED",
  "DESIGN_SYSTEM_ID",
  "EMAIL_FROM",
  "ENABLE_PEXELS",
  "FIGMA_ACCESS_TOKEN",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_ID_DEV",
  "GITHUB_CLIENT_SECRET",
  "GITHUB_CLIENT_SECRET_DEV",
  "GOOGLE_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_ID_DEV",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CLIENT_SECRET_DEV",
  "INBOUND_WEBHOOK_SHARED_SECRET",
  "KOSTNADSFRI_API_KEY",
  "KOSTNADSFRI_PASSWORD_SEED",
  "KV_REST_API_TOKEN",
  "KV_REST_API_URL",
  "KV_URL",
  "LEGACY_EMAIL_AUTO_VERIFY_BEFORE",
  "LOG_PROMPTS",
  "LOOPIA_API_PASSWORD",
  "LOOPIA_API_USER",
  "NEXT_PUBLIC_ADMIN_EMAIL",
  "NEXT_PUBLIC_ADMIN_EMAILS",
  "NEXT_PUBLIC_BETA_BANNER",
  "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
  "NEXT_PUBLIC_REGISTRY_BASE_URL",
  "NEXT_PUBLIC_REGISTRY_STYLE",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "OPENCLAW_GATEWAY_TOKEN",
  "OPENCLAW_GATEWAY_URL",
  "PEXELS_API_KEY",
  "REDIS_URL",
  "REGISTRY_AUTH_TOKEN",
  "REGISTRY_BASE_URL",
  "RESEND_API_KEY",
  "STORAGE_BACKEND",
  "STRIPE_PRICE_10_CREDITS",
  "STRIPE_PRICE_25_CREDITS",
  "STRIPE_PRICE_50_CREDITS",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SUPERADMIN_DIAMONDS",
  "SUPERADMIN_EMAIL",
  "SUPERADMIN_PASSWORD",
  "TEMPLATE_EMBEDDINGS_AUTO_REBUILD",
  "TEMPLATE_EMBEDDINGS_BLOB_KEY",
  "TEMPLATE_EMBEDDINGS_STORAGE",
  "TEMPLATE_SYNC_GITHUB_TOKEN",
  "TEMPLATE_SYNC_INCLUDE_EMBEDDINGS",
  "TEMPLATE_SYNC_REF",
  "TEMPLATE_SYNC_REPO_NAME",
  "TEMPLATE_SYNC_REPO_OWNER",
  "TEMPLATE_SYNC_WORKFLOW_FILE",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "USE_RESPONSES_API",
  "V0_FALLBACK_BUILDER",
  "V0_STREAMING_ENABLED",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
] as const;

export function inspectEnvValue(value: string | undefined): EnvValueState {
  if (value == null) return "missing";
  const trimmed = value.trim();
  if (!trimmed) return "empty";
  if (/^\$\{[A-Z0-9_]+\}$/.test(trimmed) || /^\$[A-Z0-9_]+$/.test(trimmed)) {
    return "placeholder";
  }
  if (/(placeholder|changeme|example|todo|replace-me)/i.test(trimmed)) {
    return "placeholder";
  }
  return "set";
}

export function getKnownEnvKeys(): string[] {
  const keys = new Set<string>([
    ...Object.keys(serverSchema.shape),
    ...EXTRA_KNOWN_KEYS,
    ...RULE_BY_KEY.keys(),
  ]);
  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

export function getEnvRule(key: string): EnvRule {
  const explicit = RULE_BY_KEY.get(key);
  if (explicit) return explicit;

  if (key === "VERCEL" || key === "VERCEL_ENV" || key === "VERCEL_URL") {
    return {
      key,
      classification: "vercel_managed",
      recommendedVercelTargets: [],
      notes: "Satts automatiskt av Vercel vid deployment/runtime.",
    };
  }

  if (
    key.startsWith("NEXT_PUBLIC_") ||
    key.endsWith("_REDIRECT_URI")
  ) {
    return {
      key,
      classification: "environment_specific",
      recommendedVercelTargets: DEPLOY_TARGETS,
      notes: "Publikt eller miljo-beroende varde som ofta skiljer mellan localhost och deployment.",
    };
  }

  if (
    key.includes("TOKEN") ||
    key.includes("SECRET") ||
    key.includes("PASSWORD") ||
    key.includes("KEY") ||
    key.includes("URL")
  ) {
    return {
      key,
      classification: "optional_runtime",
      recommendedVercelTargets: ALL_TARGETS,
      notes: "Runtime-varde som kan behova finnas pa Vercel om funktionen anvands.",
    };
  }

  return {
    key,
    classification: "optional_runtime",
    recommendedVercelTargets: ALL_TARGETS,
    notes: "Ingen specialregel definierad; verifiera anvandning innan sync.",
  };
}

export function hasAllTargets(
  actualTargets: string[],
  recommendedTargets: VercelTarget[],
): boolean {
  if (recommendedTargets.length === 0) return true;
  const actual = new Set(actualTargets);
  return recommendedTargets.every((target) => actual.has(target));
}
