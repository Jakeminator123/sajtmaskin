import { NextRequest, NextResponse } from "next/server";
import { getTeam, listTeams, isVercelConfigured } from "@/lib/vercel/vercel-client";
import { getCurrentUser } from "@/lib/auth/auth";
import { TEST_USER_EMAIL } from "@/lib/db/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function isAdmin(req: NextRequest): Promise<boolean> {
  const user = await getCurrentUser(req);
  return Boolean(user?.email && user.email === TEST_USER_EMAIL);
}

/**
 * GET /api/admin/vercel/team-status
 * Returns all teams with their billing plans
 */
export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isVercelConfigured()) {
    return NextResponse.json({
      configured: false,
      teams: [],
      warning: "VERCEL_TOKEN not configured",
    });
  }

  try {
    // First list all teams
    const teamsBasic = await listTeams();

    // Fetch detailed info for each team to get billing plan
    const teamsDetailed = await Promise.all(
      teamsBasic.map(async (team) => {
        try {
          const details = await getTeam(team.id);
          // Plan can be in billing.plan or directly on plan field
          const plan =
            details.billing?.plan || details.plan || "unknown";
          return {
            id: team.id,
            slug: team.slug,
            name: team.name,
            plan,
            isFree: plan === "hobby" || plan === "free",
            isPro: plan === "pro",
            isEnterprise: plan === "enterprise",
          };
        } catch {
          // If we can't get details, return basic info
          return {
            id: team.id,
            slug: team.slug,
            name: team.name,
            plan: "unknown",
            isFree: false,
            isPro: false,
            isEnterprise: false,
          };
        }
      }),
    );

    // Check which team is configured
    const configuredTeamId = process.env.VERCEL_TEAM_ID;
    const configuredTeam = teamsDetailed.find((t) => t.id === configuredTeamId);

    // Count free teams
    const freeTeams = teamsDetailed.filter((t) => t.isFree);
    const hasFreePlan = freeTeams.length > 0;
    const configuredTeamIsFree = configuredTeam?.isFree ?? false;

    return NextResponse.json({
      configured: true,
      configuredTeamId,
      configuredTeam: configuredTeam || null,
      teams: teamsDetailed,
      warnings: [
        ...(configuredTeamIsFree
          ? [
              `Configured team "${configuredTeam?.name}" is on FREE plan. Some features may be limited.`,
            ]
          : []),
        ...(hasFreePlan && !configuredTeamIsFree
          ? [`You have ${freeTeams.length} team(s) on FREE plan: ${freeTeams.map((t) => t.name).join(", ")}`]
          : []),
        ...(!configuredTeamId
          ? ["No VERCEL_TEAM_ID configured - using personal account"]
          : []),
      ],
    });
  } catch (error) {
    console.error("[Admin] Failed to fetch team status:", error);
    return NextResponse.json(
      { error: "Failed to fetch Vercel team status" },
      { status: 500 },
    );
  }
}
