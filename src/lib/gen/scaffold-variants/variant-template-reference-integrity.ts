import {
  classifyVariantTemplateCandidate,
  selectVariantTemplateReference,
} from "./template-inspiration";
import { resolveVariantTemplateAddendum } from "./variant-template-addendum";

export type VariantTemplateReferenceIntegrityIssue = {
  code:
    | "no-runtime-selectable-template"
    | "unknown-template"
    | "never-selectable-template"
    | "missing-addendum"
    | "stale-addendum"
    | "invalid-addendum";
  templateId?: string;
  detail: string;
};

export type VariantTemplateReferenceIntegrityResult = {
  selectedTemplateId: string | null;
  /**
   * Eligible candidates the curator has disabled. When every eligible
   * candidate is listed here the variant is deliberately curated off: runtime
   * returns no template inspiration and that is not an issue.
   */
  disabledCandidateIds: string[];
  issues: VariantTemplateReferenceIntegrityIssue[];
};

/**
 * The shared decision boundary for variant template references.
 *
 * Backoffice save flows and the committed variant-integrity gate must agree on
 * the contract: every citation is a real Blob template in a category the
 * runtime can select, every eligible citation has a current (or explicitly
 * disabled) addendum, and — unless the curator disabled every candidate — at
 * least one citation is actually selectable. Category eligibility and addendum
 * parsing stay in their canonical owners; this helper only composes their
 * answers.
 */
export function validateVariantTemplateReferences(
  sourceTemplateIds: readonly string[],
): VariantTemplateReferenceIntegrityResult {
  const normalizedIds = sourceTemplateIds.map((value) => value.trim()).filter(Boolean);
  const uniqueIds = [...new Set(normalizedIds)];
  const selected = selectVariantTemplateReference({ sourceTemplateIds: normalizedIds });
  const issues: VariantTemplateReferenceIntegrityIssue[] = [];
  const disabledCandidateIds: string[] = [];
  let eligibleCount = 0;

  for (const templateId of uniqueIds) {
    const eligibility = classifyVariantTemplateCandidate(templateId);
    if (eligibility === "unknown-template") {
      issues.push({
        code: "unknown-template",
        templateId,
        detail: `${templateId}: not in the Blob template manifest`,
      });
      continue;
    }
    if (eligibility === "never-selectable") {
      issues.push({
        code: "never-selectable-template",
        templateId,
        detail: `${templateId}: category is never runtime-selectable as variant inspiration (dead config)`,
      });
      continue;
    }
    eligibleCount += 1;

    const addendum = resolveVariantTemplateAddendum(templateId);
    if (addendum.state === "disabled") {
      disabledCandidateIds.push(templateId);
      continue;
    }
    if (addendum.state === "hit") continue;
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

  if (!selected && eligibleCount === 0) {
    issues.push({
      code: "no-runtime-selectable-template",
      detail: "No sourceTemplateIds entry is runtime-selectable by selectVariantTemplateReference.",
    });
  }

  return {
    selectedTemplateId: selected?.templateId ?? null,
    disabledCandidateIds,
    issues,
  };
}
