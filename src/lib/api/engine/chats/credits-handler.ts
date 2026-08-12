import type { prepareCredits } from "@/lib/credits/server";

type CreditCheck = Awaited<ReturnType<typeof prepareCredits>> & { ok: true };

export type GenerationChargeTarget = {
  chatId: string;
  versionId: string;
};

/**
 * Wraps a credit check's commit function so it can only fire once.
 * Both the create-chat and follow-up handlers use this exact pattern.
 */
export function createCommitCreditsOnce(creditCheck: CreditCheck) {
  let charged = false;
  return async (target?: GenerationChargeTarget) => {
    if (charged) return;
    charged = true;
    if (target) {
      const { attachVersionToPendingUsageAsync, getLlmUsageContext } =
        await import("@/lib/observability/llm-usage");
      const { establishGenerationBilling, settleGenerationBilling } =
        await import("@/lib/db/services/generation-billing");
      const claimKey = getLlmUsageContext().claimKey;

      // Finalize owns the first durable completion marker. It is the only
      // billing write that must succeed before the client may see `done`.
      // Attribution and settlement may degrade to the persisted admin retry.
      let markerError: unknown = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await establishGenerationBilling({
            chatId: target.chatId,
            versionId: target.versionId,
            userId: creditCheck.user.id,
            isTest: creditCheck.isTest,
            claimKey,
          });
          markerError = null;
          break;
        } catch (error) {
          markerError = error;
        }
      }
      if (markerError) {
        console.error(
          "[generation-billing] Kunde inte spara completion-markören:",
          markerError,
        );
        throw markerError;
      }

      try {
        await attachVersionToPendingUsageAsync(target.chatId, target.versionId, claimKey);
      } catch (attachmentError) {
        // Do not settle a partial snapshot. The pending marker retains the
        // claim key so admin reconciliation can retry exact attribution.
        console.error("[generation-billing] Kunde inte efterstämpla usage:", attachmentError);
        return;
      }

      let settlementError: unknown = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await settleGenerationBilling({
            chatId: target.chatId,
            versionId: target.versionId,
            userId: creditCheck.user.id,
            isTest: creditCheck.isTest,
          });
          settlementError = null;
          break;
        } catch (error) {
          settlementError = error;
        }
      }
      if (settlementError) {
        console.error("[generation-billing] Kunde inte debitera completion-markören:", settlementError);
      }
      return;
    }

    try {
      await creditCheck.commit();
    } catch (error) {
      console.error("[credits] Failed to charge:", error);
    }
  };
}
