import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import type { User } from "@/lib/db/services/shared";
import { withRateLimit } from "@/lib/rate-limit";
import {
  requireActiveWizardRun,
  type WizardRun,
} from "@/lib/db/services/wizard-runs";

export type AuthorizedWizardRun =
  | { ok: true; user: User; run: WizardRun }
  | { ok: false; response: Response };

/**
 * Gate for lookup / competitors / enrich / prefetch. A missing, foreign,
 * invented, completed or expired run never reaches an LLM call. The existing
 * AI quota also follows the verified account across IPs, routes and runs.
 */
export async function authorizeWizardRun(
  req: Request,
  wizardRunId: string,
): Promise<AuthorizedWizardRun> {
  const user = await getCurrentUser(req);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Du måste vara inloggad för att använda wizard-läget.",
          requiresAuth: true,
        },
        { status: 401 },
      ),
    };
  }

  const result = await requireActiveWizardRun(user.id, wizardRunId);
  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: result.error, wizardRunInvalid: true },
        { status: result.status },
      ),
    };
  }

  const admission = await withRateLimit(req, "ai:chat", async () => new Response(null, { status: 204 }), {
    userId: user.id,
    failClosedOnTimeout: true,
  });
  if (!admission.ok) return { ok: false, response: admission };

  return { ok: true, user, run: result.run };
}
