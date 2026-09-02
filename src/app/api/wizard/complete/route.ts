/**
 * API Route: Complete a server-owned wizard run
 * POST /api/wizard/complete
 *
 * Marks the caller's active run as completed so the same id cannot be
 * reused for further LLM calls.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/auth";
import { requireNotBot } from "@/lib/bot-protection";
import { withRateLimit } from "@/lib/rate-limit";
import { completeWizardRun } from "@/lib/db/services/wizard-runs";

export const runtime = "nodejs";

const requestSchema = z.object({
  wizardRunId: z.string().uuid(),
});

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

    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed" },
        { status: 400 },
      );
    }

    const result = await completeWizardRun(user.id, parsed.data.wizardRunId);
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error, wizardRunInvalid: true },
        { status: result.status },
      );
    }

    return NextResponse.json({
      success: true,
      wizardRunId: result.run.id,
      status: result.run.status,
    });
  });
}
