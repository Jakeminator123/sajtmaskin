import type { ModelTier } from "@/lib/credits/pricing";

export type ScalarCreditField =
  | "wizard"
  | "auditBasic"
  | "auditAdvanced"
  | "deployPreview"
  | "deployProduction"
  | "openclawTip";

export type CreditFieldPatch = {
  promptCreate?: Partial<Record<ModelTier, number | null>>;
  promptRefine?: Partial<Record<ModelTier, number | null>>;
  wizard?: number | null;
  auditBasic?: number | null;
  auditAdvanced?: number | null;
  deployPreview?: number | null;
  deployProduction?: number | null;
  openclawTip?: number | null;
};

/**
 * En enda scalar-åtgärd. Saknade fält lämnas orörda av servern — skicka
 * därför aldrig resten av listan härifrån.
 */
export function scalarCreditPatch(
  field: ScalarCreditField,
  value: number | null,
): CreditFieldPatch {
  return { [field]: value };
}

/** En enda modelltier inuti generering eller follow-up. */
export function tierCreditPatch(
  group: "promptCreate" | "promptRefine",
  tier: ModelTier,
  value: number | null,
): CreditFieldPatch {
  return { [group]: { [tier]: value } };
}
