export type IntegrationRuntime = "browser" | "server" | "edge" | "deploy";

export type IntegrationCategory =
  | "analytics"
  | "payments"
  | "auth"
  | "data"
  | "email"
  | "storage"
  | "other";

export type IntegrationDefinition = {
  key: string;
  name: string;
  category: IntegrationCategory;
  envVars: string[];
  setupGuide: string;
  runtime: IntegrationRuntime;
  optional: boolean;
  provider?: string;
};

export const integrationRegistry: IntegrationDefinition[] = [
  {
    key: "supabase",
    name: "Supabase",
    category: "data",
    envVars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    setupGuide:
      "Skapa ett projekt på supabase.com. Kopiera Project URL och anon/public key från Settings > API.",
    runtime: "server",
    optional: false,
    provider: "supabase",
  },
  {
    key: "stripe",
    name: "Stripe",
    category: "payments",
    envVars: ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY"],
    setupGuide:
      "Logga in på dashboard.stripe.com. Kopiera nycklar från Developers > API keys. Använd test-nycklar under utveckling.",
    runtime: "server",
    optional: false,
    provider: "stripe",
  },
  {
    key: "resend",
    name: "Resend",
    category: "email",
    envVars: ["RESEND_API_KEY"],
    setupGuide:
      "Skapa konto på resend.com. Skapa en API-nyckel under API Keys. Verifiera din domän för produktion.",
    runtime: "server",
    optional: false,
    provider: "resend",
  },
  {
    key: "openai",
    name: "OpenAI",
    category: "other",
    envVars: ["OPENAI_API_KEY"],
    setupGuide: "Hämta din API-nyckel från platform.openai.com/api-keys.",
    runtime: "server",
    optional: false,
    provider: "openai",
  },
  {
    key: "upstash",
    name: "Upstash",
    category: "data",
    envVars: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    setupGuide:
      "Skapa en Redis-databas på console.upstash.com. Kopiera REST URL och REST Token.",
    runtime: "edge",
    optional: false,
    provider: "upstash",
  },
  {
    key: "vercel-blob",
    name: "Vercel Blob",
    category: "storage",
    envVars: ["BLOB_READ_WRITE_TOKEN"],
    setupGuide:
      "Lägg till Blob Store i ditt Vercel-projekt via Storage-fliken. Token skapas automatiskt.",
    runtime: "deploy",
    optional: false,
    provider: "vercel-blob",
  },
];
