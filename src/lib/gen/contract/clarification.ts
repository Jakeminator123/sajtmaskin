import type { BuildIntent } from "@/lib/builder/build-intent";
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
): Record<string, unknown> {
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
    },
  };
}

function hasUnresolved(
  context: PreGenerationContractContext,
  kind: "database" | "auth" | "payment" | "integration" | "env",
): boolean {
  return context.unresolvedDecisions.some((entry) => entry.kind === kind);
}

/**
 * Build a blocking clarification question if unresolved contract decisions exist.
 *
 * `previewFirst` (default `true`): preview-first target — always return `null`
 * so first generation is never blocked by contract questions.  Blocking questions
 * are only emitted when `previewFirst === false` (explicit production mode).
 */
export function buildContractClarificationQuestion(params: {
  buildIntent: BuildIntent;
  context: PreGenerationContractContext;
  /** When true (default), skip all blocking questions — preview-first. */
  previewFirst?: boolean;
}): ContractClarificationQuestion | null {
  const { buildIntent, context, previewFirst = true } = params;
  if (previewFirst) return null;
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
      options: [
        "Mockad data först",
        "Supabase",
        "Postgres / DATABASE_URL",
        "Annat / vet inte än",
      ],
      blocking: true,
      reason: "Prompten tyder på verklig persistence men databas/provider är inte vald ännu.",
    };
  }

  if (
    hasUnresolved(context, "integration") &&
    (buildIntent === "app" || contracts.dataMode === "persisted" || contracts.dataMode === "mixed")
  ) {
    return {
      kind: "integration",
      question: "Ska vi bygga den externa integrationen som mockad först eller koppla mot en riktig tjänst redan nu?",
      options: ["Mockad först", "Riktig tjänst nu", "Osäker / behöver välja senare"],
      blocking: true,
      reason: "Prompten antyder extern integration men provider eller setup är fortfarande oklar.",
    };
  }

  if (hasUnresolved(context, "env")) {
    return null;
  }

  return null;
}
