import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import {
  createTransaction,
  getOrCreateGuestUsage,
  incrementGuestUsage,
  isTestUser,
  type User,
} from "@/lib/db/services";
import {
  getActionLabel,
  getCreditCost,
  getCreditDescription,
  getCreditTransactionType,
  type CreditAction,
  type PricingContext,
} from "./pricing";

type GuestUsageType = "generate" | "refine";

type ActionRule = {
  allowGuest: boolean;
  guestUsageType?: GuestUsageType;
  guestLimit?: number;
};

const ACTION_RULES: Record<CreditAction, ActionRule> = {
  "prompt.create": { allowGuest: true, guestUsageType: "generate", guestLimit: 1 },
  "prompt.refine": { allowGuest: true, guestUsageType: "refine", guestLimit: 1 },
  "prompt.template": { allowGuest: true, guestUsageType: "generate", guestLimit: 1 },
  "prompt.registry": { allowGuest: true, guestUsageType: "generate", guestLimit: 1 },
  "prompt.vercelTemplate": { allowGuest: true, guestUsageType: "generate", guestLimit: 1 },
  "deploy.preview": { allowGuest: false },
  "deploy.production": { allowGuest: false },
  "audit.basic": { allowGuest: false },
  "audit.advanced": { allowGuest: false },
};

const AUTH_REQUIRED_MESSAGES: Partial<Record<CreditAction, string>> = {
  "audit.basic": "Du måste vara inloggad för att använda audit-funktionen.",
  "audit.advanced": "Du måste vara inloggad för att använda audit-funktionen.",
  "deploy.preview": "Du måste vara inloggad för att deploya.",
  "deploy.production": "Du måste vara inloggad för att deploya.",
};

const GUEST_LIMIT_MESSAGES: Record<GuestUsageType, string> = {
  generate: "Du har använt din gratis generation. Skapa ett konto för att fortsätta bygga!",
  refine: "Du har använt din gratis förfining. Skapa ett konto för att fortsätta förfina!",
};

export type CreditsEvaluation = {
  allowed: boolean;
  cost: number;
  reason: string | null;
  user: User | null;
  isTest: boolean;
  sessionId: string | null;
  guestUsageType: GuestUsageType | null;
  guest?: {
    generationsUsed: number;
    refinesUsed: number;
    canGenerate: boolean;
    canRefine: boolean;
  } | null;
  failureType?: "auth" | "insufficient" | "guest_limit" | "session_missing";
  currentBalance?: number;
};

export async function evaluateCredits(
  req: Request,
  action: CreditAction,
  context: PricingContext = {},
  options: { sessionId?: string | null } = {},
): Promise<CreditsEvaluation> {
  const cost = getCreditCost(action, context);
  const user = await getCurrentUser(req);
  const sessionId = options.sessionId ?? getSessionIdFromRequest(req);

  if (user) {
    const isTest = isTestUser(user);
    const canProceed = isTest || user.diamonds >= cost;
    return {
      allowed: canProceed,
      cost,
      reason: canProceed
        ? null
        : `Du behöver minst ${cost} credits för ${getActionLabel(action)}. Du har ${user.diamonds} credits.`,
      user,
      isTest,
      sessionId,
      guestUsageType: null,
      guest: null,
      failureType: canProceed ? undefined : "insufficient",
      currentBalance: user.diamonds,
    };
  }

  const rule = ACTION_RULES[action];
  if (!rule.allowGuest) {
    return {
      allowed: false,
      cost,
      reason: AUTH_REQUIRED_MESSAGES[action] || "Du måste vara inloggad för att fortsätta.",
      user: null,
      isTest: false,
      sessionId,
      guestUsageType: null,
      guest: null,
      failureType: "auth",
    };
  }

  if (!sessionId) {
    return {
      allowed: false,
      cost,
      reason: "Session saknas. Ladda om sidan och försök igen.",
      user: null,
      isTest: false,
      sessionId: null,
      guestUsageType: rule.guestUsageType || null,
      guest: null,
      failureType: "session_missing",
    };
  }

  const guestUsage = await getOrCreateGuestUsage(sessionId);
  const guestUsageType = rule.guestUsageType || null;
  const guestLimit = rule.guestLimit ?? 0;
  const usedCount =
    guestUsageType === "generate" ? guestUsage.generations_used : guestUsage.refines_used;
  const guestBlocked = guestLimit > 0 && usedCount >= guestLimit;

  return {
    allowed: !guestBlocked,
    cost,
    reason: guestBlocked && guestUsageType ? GUEST_LIMIT_MESSAGES[guestUsageType] : null,
    user: null,
    isTest: false,
    sessionId,
    guestUsageType,
    guest: {
      generationsUsed: guestUsage.generations_used,
      refinesUsed: guestUsage.refines_used,
      canGenerate: guestUsage.generations_used < 1,
      canRefine: guestUsage.refines_used < 1,
    },
    failureType: guestBlocked ? "guest_limit" : undefined,
  };
}

export type PreparedCredits =
  | {
      ok: true;
      cost: number;
      action: CreditAction;
      context: PricingContext;
      user: User | null;
      isTest: boolean;
      sessionId: string | null;
      guestUsageType: GuestUsageType | null;
      commit: () => Promise<void>;
    }
  | { ok: false; cost: number; response: Response };

export async function prepareCredits(
  req: Request,
  action: CreditAction,
  context: PricingContext = {},
  options: { sessionId?: string | null } = {},
): Promise<PreparedCredits> {
  const evaluation = await evaluateCredits(req, action, context, options);

  if (!evaluation.allowed) {
    const status =
      evaluation.failureType === "auth"
        ? 401
        : evaluation.failureType === "session_missing"
          ? 400
          : 402;
    const response = NextResponse.json(
      {
        success: false,
        error: evaluation.reason || "Du kan inte fortsätta.",
        requiresAuth: evaluation.failureType === "auth" || evaluation.failureType === "guest_limit",
        insufficientCredits: evaluation.failureType === "insufficient",
        required: evaluation.failureType === "insufficient" ? evaluation.cost : undefined,
        current: evaluation.currentBalance,
      },
      { status },
    );
    return { ok: false, cost: evaluation.cost, response };
  }

  const commit = async () => {
    if (evaluation.user) {
      if (evaluation.isTest || evaluation.cost <= 0) return;
      await createTransaction(
        evaluation.user.id,
        getCreditTransactionType(action),
        -evaluation.cost,
        getCreditDescription(action, context),
      );
      return;
    }

    if (evaluation.guestUsageType && evaluation.sessionId) {
      await incrementGuestUsage(evaluation.sessionId, evaluation.guestUsageType);
    }
  };

  return {
    ok: true,
    cost: evaluation.cost,
    action,
    context,
    user: evaluation.user,
    isTest: evaluation.isTest,
    sessionId: evaluation.sessionId,
    guestUsageType: evaluation.guestUsageType,
    commit,
  };
}
