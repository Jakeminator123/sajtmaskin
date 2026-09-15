import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { resolveServerBillingMode } from "@/lib/billing/site-subscription-offer";
import { evaluateSitePublishEntitlement } from "@/lib/billing/site-subscription-policy";
import { isSiteSubscriptionPublishEnforced } from "@/lib/billing/site-subscription-flags";
import { SECRETS } from "@/lib/config";
import { getAllProjectsForOwner } from "@/lib/db/services/projects";
import { listSiteSubscriptionsForUser } from "@/lib/db/services/site-subscriptions";
import { getUserTransactions } from "@/lib/db/services/transactions";
import {
  loginMethodLabel,
  parseKontoHistoryQuery,
  sliceKontoHistory,
} from "@/lib/konto/account";

/**
 * GET /api/konto — account, credit balance and ledger for the signed-in user.
 *
 * Authority is the session from `getCurrentUser()`. A `userId` query parameter
 * is ignored so the client cannot ask for another user's history.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Du måste vara inloggad." },
        { status: 401 },
      );
    }

    const { limit, offset } = parseKontoHistoryQuery(request.nextUrl.searchParams);
    const fetched = await getUserTransactions(user.id, limit + 1, offset);
    const { rows, hasMore } = sliceKontoHistory(fetched, limit);

    const billingMode = resolveServerBillingMode(SECRETS.stripeSecretKey);
    const [projects, subscriptions] = await Promise.all([
      getAllProjectsForOwner({ userId: user.id }),
      billingMode ? listSiteSubscriptionsForUser(user.id, billingMode) : Promise.resolve([]),
    ]);
    const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
    const now = new Date();

    return NextResponse.json({
      success: true,
      account: {
        name: user.name,
        email: user.email,
        loginMethod: loginMethodLabel(user.provider),
      },
      credits: {
        balance: user.diamonds,
      },
      siteSubscriptions: subscriptions
        .filter((row) => row.user_id === user.id)
        .map((row) => {
          const entitlement = evaluateSitePublishEntitlement({
            projectId: row.project_id,
            rowProjectId: row.project_id,
            billingMode: row.billing_mode,
            rowBillingMode: row.billing_mode,
            lifecycleState: row.lifecycle_state as "checkout_pending" | "active" | "ended",
            hostingDesired: row.hosting_state_desired as "active" | "grace" | "paused",
            hostingActual: row.hosting_state_actual as
              | "active"
              | "pausing"
              | "paused"
              | "resuming",
            graceUntil: row.grace_until,
            currentPeriodEnd: row.current_period_end,
            now,
            enforce: isSiteSubscriptionPublishEnforced(),
          });
          return {
            id: row.id,
            projectId: row.project_id,
            projectName: projectNameById.get(row.project_id) ?? row.project_id,
            billingMode: row.billing_mode,
            lifecycleState: row.lifecycle_state,
            stripeStatus: row.stripe_status,
            hostingDesired: row.hosting_state_desired,
            hostingActual: row.hosting_state_actual,
            currentPeriodEnd: row.current_period_end?.toISOString() ?? null,
            cancelAtPeriodEnd: row.cancel_at_period_end,
            graceUntil: row.grace_until?.toISOString() ?? null,
            pausedAt: row.paused_at?.toISOString() ?? null,
            entitled: entitlement.entitled,
            graceActive: entitlement.graceActive,
            canReactivate:
              Boolean(row.cancel_at_period_end) ||
              (entitlement.entitled &&
                (row.hosting_state_actual === "paused" ||
                  row.hosting_state_actual === "pausing" ||
                  row.hosting_state_desired === "paused")),
          };
        }),
      transactions: rows.map((row) => ({
        id: row.id,
        type: row.type,
        amount: row.amount,
        balanceAfter: row.balance_after,
        description: row.description,
        createdAt: row.created_at.toISOString(),
      })),
      hasMore,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[API/konto] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte hämta kontot." },
      { status: 500 },
    );
  }
}
