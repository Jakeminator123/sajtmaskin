/**
 * Runtime credentials that must never change the default unit-test graph.
 * Tests that exercise one of these integrations set their own sentinel after
 * setup. Postgres and live-network coverage have dedicated lanes.
 */
export const HERMETIC_TEST_ENV_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "XAI_API_KEY",
  "REDIS_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "STORAGE_POSTGRES_URL",
  "STORAGE_POSTGRES_URL_NON_POOLING",
  "DATABASE_URL",
  "VERCEL_PROJECT_ID",
  "VERCEL_TEAM_ID",
  "KOSTNADSFRI_API_KEY",
  "KOSTNADSFRI_PASSWORD_SEED",
  "OC_REPO_SLUG",
  "OC_REPO_READ_TOKEN",
] as const;

export function scrubHermeticTestEnv(env: NodeJS.ProcessEnv = process.env): void {
  for (const key of HERMETIC_TEST_ENV_KEYS) delete env[key];
}
