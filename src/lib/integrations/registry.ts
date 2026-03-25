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
    key: "clerk",
    name: "Clerk",
    category: "auth",
    envVars: ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
    setupGuide:
      "Skapa en applikation på clerk.com. Kopiera Secret key och Publishable key från API Keys.",
    runtime: "server",
    optional: false,
    provider: "clerk",
  },
  {
    key: "next-auth",
    name: "NextAuth / Auth.js",
    category: "auth",
    envVars: ["AUTH_SECRET", "NEXTAUTH_URL"],
    setupGuide:
      "Generera AUTH_SECRET med: npx auth secret. Sätt NEXTAUTH_URL till din site-URL (t.ex. http://localhost:3000).",
    runtime: "server",
    optional: false,
    provider: "next-auth",
  },
  {
    key: "google",
    name: "Google APIs",
    category: "other",
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    setupGuide:
      "Skapa OAuth-klient i Google Cloud Console > APIs & Services > Credentials.",
    runtime: "server",
    optional: false,
    provider: "google",
  },
  {
    key: "google-analytics",
    name: "Google Analytics 4",
    category: "analytics",
    envVars: ["NEXT_PUBLIC_GA_ID"],
    setupGuide:
      "Skapa en GA4 property i Google Analytics och sätt measurement ID som NEXT_PUBLIC_GA_ID.",
    runtime: "browser",
    optional: false,
    provider: "google-analytics",
  },
  {
    key: "gtm",
    name: "Google Tag Manager",
    category: "analytics",
    envVars: ["NEXT_PUBLIC_GTM_ID"],
    setupGuide: "Skapa en GTM-container och sätt container-ID som NEXT_PUBLIC_GTM_ID.",
    runtime: "browser",
    optional: false,
    provider: "gtm",
  },
  {
    key: "vercel-analytics",
    name: "Vercel Analytics",
    category: "analytics",
    envVars: [],
    setupGuide:
      "Aktivera Vercel Analytics i projektet och behåll Analytics-komponenten i layouten.",
    runtime: "browser",
    optional: true,
    provider: "vercel-analytics",
  },
  {
    key: "plausible",
    name: "Plausible",
    category: "analytics",
    envVars: ["NEXT_PUBLIC_PLAUSIBLE_DOMAIN"],
    setupGuide:
      "Skapa sajt i Plausible och sätt domänen som NEXT_PUBLIC_PLAUSIBLE_DOMAIN.",
    runtime: "browser",
    optional: false,
    provider: "plausible",
  },
  {
    key: "posthog",
    name: "PostHog",
    category: "analytics",
    envVars: ["NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_HOST"],
    setupGuide:
      "Skapa project i PostHog och sätt API key + host i NEXT_PUBLIC_POSTHOG_KEY och NEXT_PUBLIC_POSTHOG_HOST.",
    runtime: "browser",
    optional: false,
    provider: "posthog",
  },
  {
    key: "vercel-kv",
    name: "Vercel KV",
    category: "data",
    envVars: ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
    setupGuide:
      "Lägg till KV Store i ditt Vercel-projekt via Storage-fliken. Variabler skapas automatiskt.",
    runtime: "edge",
    optional: false,
    provider: "vercel-kv",
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
