/**
 * Tier-3 Integration Build Plan + Pre-Generation Contracts blocks.
 *
 * Split out of `system-prompt.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import {
  deriveTier3BuildSpec,
  renderTier3BuildPlanBlock,
} from "@/lib/integrations/tier3-build-spec";
import type { BuildSpec } from "../../build-spec";
import type { PreGenerationContractContext } from "../../contract/pre-generation-contracts";

export function renderTier3IntegrationBlock(params: {
  buildSpec: BuildSpec | null | undefined;
  preGenerationContracts: PreGenerationContractContext | null | undefined;
}): string[] {
  const { buildSpec, preGenerationContracts } = params;
  // ── Tier-3 Integration Build Plan (F3 only) ────────────────────────────
  // When previewPolicy is fidelity3 we render the structured tier-3 spec
  // derived from the contracts. This block tells the F3 LLM exactly which
  // env keys are guaranteed present and what wiring steps to perform.
  if (
    buildSpec?.previewPolicy !== "fidelity3" ||
    !preGenerationContracts ||
    preGenerationContracts.contracts.integrations.length === 0
  ) {
    return [];
  }
  try {
    const spec = deriveTier3BuildSpec(preGenerationContracts.contracts);
    const block = renderTier3BuildPlanBlock(spec);
    if (block) {
      return [block, ""];
    }
  } catch {
    // Never block prompt assembly on a tier-3 rendering error.
  }
  return [];
}

export function renderPreGenerationContractsBlock(
  preGenerationContracts: PreGenerationContractContext | null | undefined,
): string[] {
  if (!preGenerationContracts) return [];
  const { contracts, unresolvedDecisions } = preGenerationContracts;
  const hasContractSignal =
    contracts.dataMode !== "none" ||
    Boolean(contracts.databaseProvider) ||
    Boolean(contracts.authProvider) ||
    Boolean(contracts.paymentProvider) ||
    contracts.integrations.length > 0 ||
    contracts.envVars.length > 0 ||
    unresolvedDecisions.length > 0;
  if (!hasContractSignal) return [];

  const parts: string[] = ["## Pre-Generation Contracts", ""];
  parts.push(`- **Data mode:** ${contracts.dataMode}`);
  if (contracts.databaseProvider) parts.push(`- **Database:** ${contracts.databaseProvider}`);
  if (contracts.authProvider) parts.push(`- **Auth:** ${contracts.authProvider}`);
  if (contracts.paymentProvider) parts.push(`- **Payment:** ${contracts.paymentProvider}`);
  for (const integration of contracts.integrations.slice(0, 8)) {
    const envSuffix = integration.envVars?.length ? ` [${integration.envVars.join(", ")}]` : "";
    parts.push(
      `- **Integration (${integration.status}):** ${integration.name} — ${integration.reason}${envSuffix}`,
    );
  }
  if (contracts.envVars.length > 0) {
    parts.push("", "- **Environment variables:**");
    parts.push(
      ...contracts.envVars
        .slice(0, 10)
        .map((envVar) => `  - ${envVar.key} — ${envVar.reason}${envVar.required ? " (required)" : ""}`),
    );
  }
  parts.push(
    "",
    "- **Placeholder policy (mandatory for runnable preview):** If **Auth** is NextAuth/Auth.js, use **Credentials** (password/demo user) only — **no OAuth** providers unless the user explicitly asked for one by name. If **Stripe/payment** appears, use test-mode keys and/or `process.env` fallbacks so the app never throws at import time. The preview runtime merges non-secret placeholder `.env.local` values; your code must still run when those are absent.",
    "",
  );
  if (unresolvedDecisions.length > 0) {
    parts.push("", "- **Unresolved decisions:**");
    parts.push(...unresolvedDecisions.map((entry) => `  - ${entry.kind}: ${entry.reason}`));
    parts.push(
      "  - Prefer **non-blocking** defaults: Auth.js Credentials, SQLite or mock data, Stripe test placeholders. Do not stall generation on provider choice; ship runnable code first.",
    );
  }
  if (preGenerationContracts.confirmedAnswers.length > 0) {
    parts.push("", "- **Confirmed contract answers from the user:**");
    parts.push(
      ...preGenerationContracts.confirmedAnswers
        .slice(0, 6)
        .map((entry) => `  - ${entry.kind}: ${entry.answer}`),
    );
  }
  parts.push("");
  return parts;
}
