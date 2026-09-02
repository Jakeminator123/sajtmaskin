/**
 * API Route: Start a server-owned wizard run
 * POST /api/wizard/start
 *
 * Creates (or resumes) the caller's active wizard run and debits 11 credits
 * exactly once. The client only receives the run id; it cannot invent one.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { requireNotBot } from "@/lib/bot-protection";
import { withRateLimit } from "@/lib/rate-limit";
import { isTestUser } from "@/lib/db/services/users";
import { InsufficientCreditsError } from "@/lib/db/services/transactions";
import { startWizardRun } from "@/lib/db/services/wizard-runs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return withRateLimit(req, "ai:chat", async () => {
    const botError = requireNotBot(req);
    if (botError) return botError;

    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Du måste vara inloggad för att använda wizard-läget.",
          requiresAuth: true,
        },
        { status: 401 },
      );
    }

    try {
      const started = await startWizardRun({
        userId: user.id,
        skipCharge: isTestUser(user),
      });
      return NextResponse.json({
        success: true,
        wizardRunId: started.run.id,
        status: started.run.status,
        expiresAt: started.run.expires_at.toISOString(),
        reused: started.reused,
        charged: started.charged,
        cost: started.cost,
        current: started.balanceAfter,
      });
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        return NextResponse.json(
          {
            success: false,
            error: `Du behöver minst ${error.required} credits för en wizard-analys. Du har ${error.available} credits.`,
            insufficientCredits: true,
            required: error.required,
            current: error.available,
          },
          { status: 402 },
        );
      }
      console.error("[API/wizard/start] Error:", error);
      return NextResponse.json(
        { success: false, error: "Kunde inte starta wizard-körningen." },
        { status: 500 },
      );
    }
  });
}
