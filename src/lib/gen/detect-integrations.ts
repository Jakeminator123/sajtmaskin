/**
 * Detect integration requirements from generated code.
 *
 * Scans generated source for env var references, known SDK imports,
 * and common integration patterns.  Returns signals that the client
 * renders as integration cards and env-var prompts.
 */

export type DetectedIntegration = {
  key: string;
  name: string;
  provider?: string;
  intent: "env_vars" | "install" | "connect" | "configure";
  envVars: string[];
  status: string;
  setupGuide?: string;
};

const ENV_VAR_PATTERN = /process\.env\.([A-Z][A-Z0-9_]{2,})/g;

type KnownIntegration = {
  pattern: RegExp;
  name: string;
  provider: string;
  envVars: string[];
  setupGuide: string;
};

const KNOWN_INTEGRATIONS: KnownIntegration[] = [
  {
    pattern: /(?:@supabase\/|createClient.*supabase|SUPABASE_)/i,
    name: "Supabase",
    provider: "supabase",
    envVars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    setupGuide: "Skapa ett projekt pa supabase.com. Kopiera Project URL och anon/public key fran Settings > API.",
  },
  {
    pattern: /(?:stripe|STRIPE_)/i,
    name: "Stripe",
    provider: "stripe",
    envVars: ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY"],
    setupGuide: "Logga in på dashboard.stripe.com. Kopiera nycklar från Developers > API keys. Använd test-nycklar under utveckling.",
  },
  {
    pattern: /(?:@clerk\/|CLERK_)/i,
    name: "Clerk",
    provider: "clerk",
    envVars: ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
    setupGuide: "Skapa en applikation på clerk.com. Kopiera Secret key och Publishable key från API Keys.",
  },
  {
    pattern: /(?:@auth\/|AUTH_SECRET|NEXTAUTH_)/i,
    name: "NextAuth / Auth.js",
    provider: "next-auth",
    envVars: ["AUTH_SECRET", "NEXTAUTH_URL"],
    setupGuide: "Generera AUTH_SECRET med: npx auth secret. Sätt NEXTAUTH_URL till din site-URL (t.ex. http://localhost:3000).",
  },
  {
    pattern: /(?:resend|RESEND_)/i,
    name: "Resend",
    provider: "resend",
    envVars: ["RESEND_API_KEY"],
    setupGuide: "Skapa konto på resend.com. Skapa en API-nyckel under API Keys. Verifiera din domän för produktion.",
  },
  {
    pattern: /(?:@upstash\/|UPSTASH_)/i,
    name: "Upstash",
    provider: "upstash",
    envVars: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    setupGuide: "Skapa en Redis-databas på console.upstash.com. Kopiera REST URL och REST Token.",
  },
  {
    pattern: /(?:@prisma\/|prisma\.)/i,
    name: "Prisma",
    provider: "prisma",
    envVars: ["DATABASE_URL"],
    setupGuide: "Satt DATABASE_URL till den databas du faktiskt valt. For SQLite: file:./dev.db. For hosted drift: anvand en Postgres- eller MySQL-anslutning. Valj inte provider pa chans.",
  },
  {
    pattern: /(?:better-sqlite3|sqlite|drizzle-orm\/sqlite|file:\.\/.*\.db)/i,
    name: "SQLite",
    provider: "other",
    envVars: ["DATABASE_URL"],
    setupGuide: "SQLite passar lokalt eller i enklare demos. Anvand t.ex. DATABASE_URL=file:./dev.db. For Vercel-deployad datahantering ar en hostad databas ofta battre.",
  },
  {
    pattern: /(?:openai|OPENAI_API_KEY)/i,
    name: "OpenAI",
    provider: "openai",
    envVars: ["OPENAI_API_KEY"],
    setupGuide: "Hämta din API-nyckel från platform.openai.com/api-keys.",
  },
  {
    pattern: /(?:@vercel\/blob|BLOB_)/i,
    name: "Vercel Blob",
    provider: "vercel-blob",
    envVars: ["BLOB_READ_WRITE_TOKEN"],
    setupGuide: "Lägg till Blob Store i ditt Vercel-projekt via Storage-fliken. Token skapas automatiskt.",
  },
  {
    pattern: /(?:@vercel\/kv|KV_REST_API_)/i,
    name: "Vercel KV",
    provider: "vercel-kv",
    envVars: ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
    setupGuide: "Lägg till KV Store i ditt Vercel-projekt via Storage-fliken. Variabler skapas automatiskt.",
  },
  {
    pattern: /(?:googleapis|GOOGLE_)/i,
    name: "Google APIs",
    provider: "google",
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    setupGuide: "Skapa OAuth-klient i Google Cloud Console > APIs & Services > Credentials.",
  },
];

const WELL_KNOWN_PUBLIC_VARS = new Set([
  "NODE_ENV",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_BASE_URL",
  "VERCEL_URL",
  "VERCEL_ENV",
  "PORT",
]);

export function detectIntegrations(code: string): DetectedIntegration[] {
  const results: DetectedIntegration[] = [];
  const seenKeys = new Set<string>();

  for (const integration of KNOWN_INTEGRATIONS) {
    if (integration.pattern.test(code) && !seenKeys.has(integration.provider)) {
      seenKeys.add(integration.provider);
      results.push({
        key: integration.provider,
        name: integration.name,
        provider: integration.provider,
        intent: "env_vars",
        envVars: integration.envVars,
        status: "Kräver konfiguration",
        setupGuide: integration.setupGuide,
      });
    }
  }

  const envMatches = new Set<string>();
  let match: RegExpExecArray | null;
  ENV_VAR_PATTERN.lastIndex = 0;
  while ((match = ENV_VAR_PATTERN.exec(code)) !== null) {
    const varName = match[1];
    if (!WELL_KNOWN_PUBLIC_VARS.has(varName)) {
      envMatches.add(varName);
    }
  }

  const coveredVars = new Set(results.flatMap((r) => r.envVars));
  const uncovered = [...envMatches].filter((v) => !coveredVars.has(v));

  if (uncovered.length > 0) {
    results.push({
      key: "custom-env",
      name: "Miljövariabler",
      intent: "env_vars",
      envVars: uncovered,
      status: "Kräver konfiguration",
    });
  }

  return results;
}
