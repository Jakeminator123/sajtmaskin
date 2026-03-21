import type { BuildIntent } from "@/lib/builder/build-intent";
import { MAX_CONTRACT_CLARIFICATION_ROUNDS } from "@/lib/gen/contract-clarification-policy";
import type { PreGenerationContractContext } from "./pre-generation-contracts";

export interface ContractClarificationQuestion {
  kind: "integration" | "env" | "database" | "auth" | "payment" | "unclear" | "scope";
  question: string;
  options: string[];
  blocking: boolean;
  reason: string;
}

export function buildStoredContractClarificationUiPart(
  clarification: ContractClarificationQuestion,
  roundMeta?: { roundIndex: number; maxRounds?: number },
): Record<string, unknown> {
  const maxRounds = roundMeta?.maxRounds ?? MAX_CONTRACT_CLARIFICATION_ROUNDS;
  const roundIndex = roundMeta?.roundIndex ?? 1;
  return {
    type: "tool:awaiting-input",
    toolName: "Klargörande fråga",
    state: "approval-requested",
    output: {
      question: clarification.question,
      options: clarification.options,
      kind: clarification.kind,
      blocking: clarification.blocking,
      reason: clarification.reason,
      awaitingInput: true,
      contractClarification: true,
      clarificationRound: roundIndex,
      clarificationMaxRounds: maxRounds,
    },
  };
}

function hasUnresolved(
  context: PreGenerationContractContext,
  kind: "database" | "auth" | "payment" | "integration" | "env",
): boolean {
  return context.unresolvedDecisions.some((entry) => entry.kind === kind);
}

export function buildContractClarificationQuestion(params: {
  buildIntent: BuildIntent;
  context: PreGenerationContractContext;
}): ContractClarificationQuestion | null {
  const { buildIntent, context } = params;
  const { contracts } = context;

  if (hasUnresolved(context, "auth")) {
    return {
      kind: "auth",
      question: "Vilken autentisering ska vi bygga mot innan vi går vidare?",
      options: ["Ingen auth ännu", "Clerk", "NextAuth / Auth.js", "Annat / vet inte än"],
      blocking: true,
      reason: "Auth krävs men provider är inte vald ännu.",
    };
  }

  if (hasUnresolved(context, "payment")) {
    return {
      kind: "payment",
      question: "Vilken betal-/checkout-lösning ska användas i första bygget?",
      options: ["Ingen ännu / placeholder", "Stripe", "Annat / vet inte än"],
      blocking: true,
      reason: "Betalflöde krävs men provider är inte vald ännu.",
    };
  }

  if (hasUnresolved(context, "database") && (contracts.dataMode === "persisted" || contracts.dataMode === "mixed")) {
    return {
      kind: "database",
      question: "Vilken datalagring ska vi bygga mot nu?",
      options: ["Mockad data först", "Supabase", "Postgres / DATABASE_URL", "Annat / vet inte än"],
      blocking: true,
      reason: "Prompten tyder på verklig persistence men databas/provider är inte vald ännu.",
    };
  }

  // Integration uncertainty should no longer block the first build pass.
  // We surface it later in readiness/deploy setup instead.

  return null;
}
