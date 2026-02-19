import { NextResponse } from "next/server";

type McpPriorityItem = {
  id: string;
  label: string;
  phase: 1 | 2 | 3;
  priority: "high" | "medium" | "low";
  rationale: string;
  requiredEnv: string[];
};

const MCP_PRIORITY_BLUEPRINT: McpPriorityItem[] = [
  {
    id: "posthog",
    label: "PostHog",
    phase: 1,
    priority: "high",
    rationale: "Mäter användarbeteende i genererade sajter och hjälper er förbättra kvalitet snabbt.",
    requiredEnv: ["NEXT_PUBLIC_POSTHOG_KEY"],
  },
  {
    id: "sentry",
    label: "Sentry",
    phase: 1,
    priority: "high",
    rationale: "Fångar runtime-fel i produktion och minskar supporttid för kundprojekt.",
    requiredEnv: ["SENTRY_DSN"],
  },
  {
    id: "notion",
    label: "Notion",
    phase: 2,
    priority: "medium",
    rationale: "Bra för innehållsdrivna företagswebbar där team redan använder Notion.",
    requiredEnv: ["NOTION_TOKEN"],
  },
  {
    id: "linear",
    label: "Linear",
    phase: 2,
    priority: "medium",
    rationale: "Ger spårbar arbetsyta för buggar/feature requests från builderflödet.",
    requiredEnv: ["LINEAR_API_KEY"],
  },
  {
    id: "sanity",
    label: "Sanity",
    phase: 3,
    priority: "low",
    rationale: "Passar kunder med behov av headless CMS och redaktionella flöden.",
    requiredEnv: ["SANITY_API_TOKEN", "NEXT_PUBLIC_SANITY_PROJECT_ID"],
  },
  {
    id: "zapier",
    label: "Zapier",
    phase: 3,
    priority: "low",
    rationale: "Bra automationsstöd men bäst efter att kärnflöden och observability sitter.",
    requiredEnv: ["ZAPIER_WEBHOOK_SECRET"],
  },
];

function buildReadiness(requiredEnv: string[]) {
  const missing = requiredEnv.filter((key) => !process.env[key]?.trim());
  return {
    missing,
    ready: missing.length === 0,
  };
}

export async function GET() {
  const priorities = MCP_PRIORITY_BLUEPRINT.map((item) => {
    const readiness = buildReadiness(item.requiredEnv);
    return {
      ...item,
      readiness: readiness.ready ? "ready" : "needs_env_setup",
      missingEnv: readiness.missing,
    };
  });

  return NextResponse.json({
    success: true,
    assumptions: {
      strategy: "user_managed_vercel",
      prerequisite: "project_env_vars_available",
    },
    phases: [
      { phase: 1, title: "Observability först", focus: "PostHog + Sentry" },
      { phase: 2, title: "Innehall & arbetsflöde", focus: "Notion + Linear" },
      { phase: 3, title: "Avancerade tillagg", focus: "Sanity + Zapier" },
    ],
    priorities,
  });
}
