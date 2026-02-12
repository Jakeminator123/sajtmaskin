import { NextResponse } from "next/server";

const SUPPORTED_MARKETPLACE_INTEGRATIONS = [
  {
    id: "neon",
    label: "Neon Postgres",
    marketplaceSlug: "neon",
    requiredEnv: ["POSTGRES_URL"],
  },
  {
    id: "supabase",
    label: "Supabase",
    marketplaceSlug: "supabase",
    requiredEnv: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  },
  {
    id: "upstash",
    label: "Upstash Redis",
    marketplaceSlug: "upstash",
    requiredEnv: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  },
] as const;

export async function GET() {
  return NextResponse.json({
    success: true,
    strategy: {
      key: "user_managed_vercel",
      ownershipModel: "user_vercel_account",
      billingOwner: "user",
      envOwnership: "project_scoped",
      installFlow: "vercel_marketplace_redirect",
      notes: [
        "Användaren installerar integrationen i sitt eget Vercel-konto.",
        "Kostnader hanteras av användaren via Vercel Marketplace.",
        "Sajtmaskin synkar endast metadata och projektets env-vars.",
      ],
    },
    supportedIntegrations: SUPPORTED_MARKETPLACE_INTEGRATIONS.map((integration) => ({
      ...integration,
      installUrl: `https://vercel.com/marketplace/${integration.marketplaceSlug}`,
    })),
  });
}
