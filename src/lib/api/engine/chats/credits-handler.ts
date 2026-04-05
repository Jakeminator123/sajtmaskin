import type { prepareCredits } from "@/lib/credits/server";

type CreditCheck = Awaited<ReturnType<typeof prepareCredits>> & { ok: true };

/**
 * Wraps a credit check's commit function so it can only fire once.
 * Both the create-chat and follow-up handlers use this exact pattern.
 */
export function createCommitCreditsOnce(creditCheck: CreditCheck) {
  let charged = false;
  return async () => {
    if (charged) return;
    charged = true;
    try {
      await creditCheck.commit();
    } catch (error) {
      console.error("[credits] Failed to charge:", error);
    }
  };
}
