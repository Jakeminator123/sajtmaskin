/**
 * API Route: Check if user can generate/refine
 * GET /api/credits/check?action=generate|refine&executionMode=codegen|plan|repair
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { isTestUser } from "@/lib/db/services/users";
import { getCreditCost, type CreditAction, type PricingContext } from "@/lib/credits/pricing";

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

type CreditsExecutionMode = "codegen" | "plan" | "repair" | "other";

const VALID_EXECUTION_MODES = new Set<CreditsExecutionMode>([
  "codegen",
  "plan",
  "repair",
  "other",
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

function resolveExecutionMode(searchParams: URLSearchParams): CreditsExecutionMode {
  const raw = searchParams.get("executionMode")?.trim();
  if (raw) {
    return VALID_EXECUTION_MODES.has(raw as CreditsExecutionMode)
      ? (raw as CreditsExecutionMode)
      : "other";
  }

  // Legacy callers still receive the same response shape, but missing mode is
  // deliberately fail-safe: only an explicit own-engine codegen check may
  // advertise or spend the account's one free generation.
  return "other";
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const action = resolveAction(searchParams);
    const executionMode = resolveExecutionMode(searchParams);
    const context: PricingContext = {
      modelId: searchParams.get("modelId"),
      quality: (searchParams.get("quality") as PricingContext["quality"]) || null,
      target: (searchParams.get("target") as PricingContext["target"]) || null,
    };
    const cost = getCreditCost(action, context);
    const isGenerationAction = action === "prompt.create" || action === "prompt.refine";
    const freeGenerationEligible = isGenerationAction && executionMode === "codegen";

    // Try to get authenticated user
    const user = await getCurrentUser(req);

    if (user) {
      // Admin/test users always have unlimited credits
      const isAdmin = isTestUser(user);
      const usingFreeGeneration =
        !isAdmin && freeGenerationEligible && user.free_generation_available;
      const canProceed = isAdmin || usingFreeGeneration || user.diamonds >= cost;

      return NextResponse.json({
        success: true,
        canProceed,
        reason: canProceed ? null : "Du har slut på credits. Köp fler för att fortsätta.",
        authenticated: true,
        balance: isAdmin ? 9999 : user.diamonds,
        cost: isAdmin ? 0 : cost,
        executionMode,
        freeGenerationEligible,
        // Effective availability for this exact operation. Keep the raw
        // account entitlement separate so plan/repair UI cannot advertise it
        // as payment for work where it is deliberately disabled.
        freeGenerationAvailable: freeGenerationEligible && user.free_generation_available,
        accountFreeGenerationAvailable: user.free_generation_available,
        usingFreeGeneration,
      });
    }

    return NextResponse.json({
      success: true,
      canProceed: false,
      reason: freeGenerationEligible
        ? "Skapa ett konto eller logga in för att fortsätta. Kontot får en kostnadsfri första generering."
        : "Skapa ett konto eller logga in för att fortsätta.",
      authenticated: false,
      cost,
      executionMode,
      freeGenerationEligible,
      requiresAuth: true,
      guest: {
        generationsUsed: 0,
        refinesUsed: 0,
        canGenerate: false,
        canRefine: false,
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
