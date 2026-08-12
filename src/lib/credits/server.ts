import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { createTransaction } from "@/lib/db/services/transactions";
import { isTestUser } from "@/lib/db/services/users";
import type { User } from "@/lib/db/services/shared";
import {
  getActionLabel,
  getCreditCost,
  getCreditDescription,
  getCreditTransactionType,
  type CreditAction,
  type PricingContext,
} from "./pricing";

const VERSION_SETTLED_GENERATION_ACTIONS = new Set<CreditAction>([
  "prompt.create",
  "prompt.refine",
]);

const AUTH_REQUIRED_MESSAGES: Partial<Record<CreditAction, string>> = {
  "prompt.create":
    "Skapa ett konto eller logga in för att generera. Ditt konto får en kostnadsfri första generering.",
  "prompt.refine":
    "Logga in för att fortsätta bygga. Ditt konto får en kostnadsfri första generering.",
  "prompt.template": "Skapa ett konto eller logga in för att använda mallen.",
  "prompt.registry": "Skapa ett konto eller logga in för att generera från komponenten.",
  "prompt.vercelTemplate": "Skapa ett konto eller logga in för att använda mallen.",
  "wizard.enrich": "Du måste vara inloggad för att använda wizard-läget.",
  "audit.basic": "Du måste vara inloggad för att använda audit-funktionen.",
  "audit.advanced": "Du måste vara inloggad för att använda audit-funktionen.",
  "deploy.preview": "Du måste vara inloggad för att deploya.",
  "deploy.production": "Du måste vara inloggad för att deploya.",
  "openclaw.tip": "Du måste vara inloggad för att använda AI-tips.",
};

export type CreditsEvaluation = {
  allowed: boolean;
  cost: number;
  reason: string | null;
  user: User | null;
  isTest: boolean;
  usingFreeGeneration: boolean;
  failureType?: "auth" | "insufficient";
  currentBalance?: number;
};

async function evaluateCredits(
  req: Request,
  action: CreditAction,
  context: PricingContext = {},
  options: { sessionId?: string | null; allowFreeGeneration?: boolean } = {},
): Promise<CreditsEvaluation> {
  const cost = getCreditCost(action, context);
  const user = await getCurrentUser(req);

  if (user) {
    const isTest = isTestUser(user);
    // This is a preliminary request gate, not the authoritative entitlement
    // claim. Version settlement locks the user row, grants the entitlement to
    // at most one completed version, and rejects a concurrent paid loser when
    // the freshly locked balance cannot cover its calculated usage.
    const usingFreeGeneration =
      !isTest &&
      options.allowFreeGeneration === true &&
      VERSION_SETTLED_GENERATION_ACTIONS.has(action) &&
      user.free_generation_available;
    const canProceed = isTest || usingFreeGeneration || user.diamonds >= cost;
    return {
      allowed: canProceed,
      cost,
      reason: canProceed
        ? null
        : `Du behöver minst ${cost} credits för ${getActionLabel(action)}. Du har ${user.diamonds} credits.`,
      user,
      isTest,
      usingFreeGeneration,
      failureType: canProceed ? undefined : "insufficient",
      currentBalance: user.diamonds,
    };
  }

  return {
    allowed: false,
    cost,
    reason: AUTH_REQUIRED_MESSAGES[action] || "Du måste vara inloggad för att fortsätta.",
    user: null,
    isTest: false,
    usingFreeGeneration: false,
    failureType: "auth",
  };
}

export type PreparedCredits =
  | {
      ok: true;
      cost: number;
      action: CreditAction;
      context: PricingContext;
      user: User;
      isTest: boolean;
      usingFreeGeneration: boolean;
      /**
       * Charge the credits. Pass `{ rejectIfNegative: true }` from charge-FIRST
       * call sites so a raced/insufficient debit throws `InsufficientCreditsError`
       * (before anything is delivered) instead of writing a negative balance.
       * Charge-AFTER call sites should omit it (overdraft-tolerant, so an
       * already-delivered charge is never silently dropped).
       */
      commit: (options?: { rejectIfNegative?: boolean }) => Promise<void>;
      /** Reverse a previously committed fixed charge. */
      refund: () => Promise<void>;
    }
  | { ok: false; cost: number; response: Response };

export async function prepareCredits(
  req: Request,
  action: CreditAction,
  context: PricingContext = {},
  options: { sessionId?: string | null; allowFreeGeneration?: boolean } = {},
): Promise<PreparedCredits> {
  const evaluation = await evaluateCredits(req, action, context, options);

  if (!evaluation.allowed) {
    const status = evaluation.failureType === "auth" ? 401 : 402;
    const response = NextResponse.json(
      {
        success: false,
        error: evaluation.reason || "Du kan inte fortsätta.",
        requiresAuth: evaluation.failureType === "auth",
        insufficientCredits: evaluation.failureType === "insufficient",
        required: evaluation.failureType === "insufficient" ? evaluation.cost : undefined,
        current: evaluation.currentBalance,
      },
      { status },
    );
    return { ok: false, cost: evaluation.cost, response };
  }

  const commit = async (commitOptions?: { rejectIfNegative?: boolean }) => {
    if (evaluation.isTest || evaluation.usingFreeGeneration || evaluation.cost <= 0) return;
    await createTransaction(
      evaluation.user!.id,
      getCreditTransactionType(action),
      -evaluation.cost,
      getCreditDescription(action, context),
      undefined,
      undefined,
      commitOptions,
    );
  };

  const refund = async () => {
    if (evaluation.isTest || evaluation.usingFreeGeneration || evaluation.cost <= 0) return;
    await createTransaction(
      evaluation.user!.id,
      `${getCreditTransactionType(action)}_refund`,
      evaluation.cost,
      `Återbetalning: ${getCreditDescription(action, context)}`,
    );
  };

  return {
    ok: true,
    cost: evaluation.cost,
    action,
    context,
    user: evaluation.user!,
    isTest: evaluation.isTest,
    usingFreeGeneration: evaluation.usingFreeGeneration,
    commit,
    refund,
  };
}
