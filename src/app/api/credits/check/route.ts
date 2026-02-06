/**
 * API Route: Check if user can generate/refine
 * GET /api/credits/check?action=generate|refine
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import { getOrCreateGuestUsage, isTestUser } from "@/lib/db/services";
import {
  getCreditCost,
  type CreditAction,
  type PricingContext,
} from "@/lib/credits/pricing";

const VALID_ACTIONS = new Set<CreditAction>([
  "prompt.create",
  "prompt.refine",
  "prompt.template",
  "prompt.registry",
  "prompt.vercelTemplate",
  "deploy.preview",
  "deploy.production",
  "audit.basic",
  "audit.advanced",
]);

function resolveAction(searchParams: URLSearchParams): CreditAction {
  const raw = (searchParams.get("action") || "prompt.create").trim();
  if (VALID_ACTIONS.has(raw as CreditAction)) {
    return raw as CreditAction;
  }
  if (raw === "generate") return "prompt.create";
  if (raw === "refine") return "prompt.refine";
  if (raw === "audit") {
    return searchParams.get("mode") === "advanced" ? "audit.advanced" : "audit.basic";
  }
  if (raw === "deploy") {
    return searchParams.get("target") === "preview" ? "deploy.preview" : "deploy.production";
  }
  return "prompt.create";
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const action = resolveAction(searchParams);
    const context: PricingContext = {
      modelId: searchParams.get("modelId"),
      quality: (searchParams.get("quality") as PricingContext["quality"]) || null,
      target: (searchParams.get("target") as PricingContext["target"]) || null,
    };
    const cost = getCreditCost(action, context);

    // Try to get authenticated user
    const user = await getCurrentUser(req);

    if (user) {
      // Admin/test users always have unlimited credits
      const isAdmin = isTestUser(user);
      const canProceed = isAdmin || user.diamonds >= cost;

      return NextResponse.json({
        success: true,
        canProceed,
        reason: canProceed ? null : "Du har slut på credits. Köp fler för att fortsätta.",
        authenticated: true,
        balance: isAdmin ? 9999 : user.diamonds,
        cost: isAdmin ? 0 : cost,
      });
    }

    // Guest user - check usage limits
    const sessionId = getSessionIdFromRequest(req);

    if (!sessionId) {
      return NextResponse.json({
        success: true,
        canProceed: true,
        reason: null,
        authenticated: false,
        cost,
        guest: {
          generationsUsed: 0,
          refinesUsed: 0,
        },
      });
    }

    const guestUsage = await getOrCreateGuestUsage(sessionId);

    let canProceed = false;
    let reason: string | null = null;
    const guestAction =
      action === "prompt.refine"
        ? "refine"
        : action.startsWith("prompt.")
          ? "generate"
          : null;

    if (guestAction === "generate") {
      canProceed = guestUsage.generations_used < 1;
      if (!canProceed) {
        reason = "Du har använt din gratis generation. Skapa ett konto för att fortsätta bygga!";
      }
    } else if (guestAction === "refine") {
      canProceed = guestUsage.refines_used < 1;
      if (!canProceed) {
        reason = "Du har använt din gratis förfining. Skapa ett konto för att fortsätta förfina!";
      }
    } else {
      canProceed = false;
      reason = "Du måste vara inloggad för att fortsätta.";
    }

    return NextResponse.json({
      success: true,
      canProceed,
      reason,
      authenticated: false,
      cost,
      guest: {
        generationsUsed: guestUsage.generations_used,
        refinesUsed: guestUsage.refines_used,
        canGenerate: guestUsage.generations_used < 1,
        canRefine: guestUsage.refines_used < 1,
      },
    });
  } catch (error) {
    console.error("[API/credits/check] Error:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte kontrollera credits. Försök igen." },
      { status: 500 },
    );
  }
}
