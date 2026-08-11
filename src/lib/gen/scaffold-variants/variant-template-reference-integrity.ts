import { selectVariantTemplateReference } from "./template-inspiration";
import { resolveVariantTemplateAddendum } from "./variant-template-addendum";

export type VariantTemplateReferenceIntegrityIssue = {
  code:
    "no-runtime-selectable-template" | "missing-addendum" | "stale-addendum" | "invalid-addendum";
  templateId?: string;
  detail: string;
};

export type VariantTemplateReferenceIntegrityResult = {
  selectedTemplateId: string | null;
  issues: VariantTemplateReferenceIntegrityIssue[];
};

/**
 * The shared decision boundary for variant template references.
 *
 * Backoffice save flows and the committed variant-integrity gate must agree on
 * both parts of the contract: at least one cited Blob template is selectable
 * by the runtime, and every citation has a current (or explicitly disabled)
 * addendum. Keep category eligibility and addendum parsing in their canonical
 * owners; this helper only composes their answers.
 */
export function validateVariantTemplateReferences(
  sourceTemplateIds: readonly string[],
): VariantTemplateReferenceIntegrityResult {
  const normalizedIds = sourceTemplateIds.map((value) => value.trim()).filter(Boolean);
  const selected = selectVariantTemplateReference({ sourceTemplateIds: normalizedIds });
  const issues: VariantTemplateReferenceIntegrityIssue[] = [];

  if (!selected) {
    issues.push({
      code: "no-runtime-selectable-template",
      detail: "No sourceTemplateIds entry is runtime-selectable by selectVariantTemplateReference.",
    });
  }

  for (const templateId of new Set(normalizedIds)) {
    const addendum = resolveVariantTemplateAddendum(templateId);
    if (addendum.state === "hit" || addendum.state === "disabled") continue;
    const addendumDetail = "detail" in addendum ? addendum.detail : undefined;

    issues.push({
      code:
        addendum.state === "missing"
          ? "missing-addendum"
          : addendum.state === "stale"
            ? "stale-addendum"
            : "invalid-addendum",
      templateId,
      detail: `${templateId}: ${addendum.state} variant-template addendum${
        addendumDetail ? ` (${addendumDetail})` : ""
      }`,
    });
  }

  return {
    selectedTemplateId: selected?.templateId ?? null,
    issues,
  };
}
