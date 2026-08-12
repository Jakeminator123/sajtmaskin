import type { ScaffoldManifest } from "@/lib/gen/scaffolds/types";
import { normalizePlanArtifact, serializePlanForPrompt } from "./schema";

function inferPlanSiteType(planData: Record<string, unknown>): string | undefined {
  const existing = typeof planData.siteType === "string" ? planData.siteType.trim() : "";
  if (existing) return existing;

  const pages = Array.isArray(planData.pages) ? planData.pages : [];
  const pageNames = pages
    .map((page) =>
      page && typeof page === "object" ? String((page as { name?: unknown }).name ?? "") : "",
    )
    .filter(Boolean);
  const scope = Array.isArray(planData.scope) ? planData.scope.map((item) => String(item)) : [];
  const haystack = [...pageNames, ...scope].join(" ").toLowerCase();

  if (/(dashboard|portal|workspace|konto|admin|app)\b/.test(haystack)) {
    return "app-shell";
  }

  const pageCount = Math.max(pages.length, scope.length);
  if (pageCount <= 1) return "one-page";
  if (pageCount <= 5) return "brochure";
  return "content-heavy";
}

export function enrichPlanArtifactForReview(
  planData: Record<string, unknown> | null,
  options: {
    resolvedScaffold: ScaffoldManifest | null;
    scaffoldMode: "auto" | "manual" | "off";
  },
): Record<string, unknown> | null {
  if (!planData) return null;

  const nextPlan: Record<string, unknown> = { ...planData };
  const inferredSiteType = inferPlanSiteType(nextPlan);
  if (inferredSiteType && typeof nextPlan.siteType !== "string") {
    nextPlan.siteType = inferredSiteType;
  }

  const { resolvedScaffold, scaffoldMode } = options;
  if (resolvedScaffold) {
    const existingScaffold =
      nextPlan.scaffold && typeof nextPlan.scaffold === "object"
        ? (nextPlan.scaffold as Record<string, unknown>)
        : {};
    nextPlan.scaffold = {
      id: resolvedScaffold.id,
      label:
        (typeof existingScaffold.label === "string" && existingScaffold.label) ||
        resolvedScaffold.label,
      reason:
        (typeof existingScaffold.reason === "string" && existingScaffold.reason) ||
        (scaffoldMode === "manual"
          ? "Användaren valde denna scaffold i buildern före planering."
          : "Builderns scaffold-matcher valde denna scaffold före planering."),
      source: scaffoldMode === "manual" ? "manual" : "auto",
    };

    const existingRecommendations = Array.isArray(nextPlan.templateRecommendations)
      ? nextPlan.templateRecommendations
      : [];
    if (existingRecommendations.length === 0) {
      nextPlan.templateRecommendations =
        resolvedScaffold.research?.referenceTemplates.slice(0, 4).map((template) => ({
          id: template.id,
          title: template.title,
          categorySlug: template.categorySlug,
          qualityScore: template.qualityScore,
          reason: `Referensmall kopplad till scaffolden ${resolvedScaffold.label}.`,
        })) ?? [];
    }
  }

  return nextPlan;
}

export function buildPlanSummaryMessage(
  planData: Record<string, unknown> | null,
  awaitingInput: boolean,
): string {
  const plan = normalizePlanArtifact(planData);
  if (!plan) {
    return awaitingInput
      ? "Planen innehåller frågor som måste besvaras innan byggfasen kan starta."
      : "Plan skapad och redo för granskning.";
  }

  if (awaitingInput) {
    const firstQuestion = plan.blockers.find((blocker) => !blocker.resolved)?.question;
    return firstQuestion
      ? `Planen kräver svar innan bygg: ${firstQuestion}`
      : "Planen innehåller frågor som måste besvaras innan byggfasen kan starta.";
  }

  const pageCount = plan.pages.length;
  const integrationCount = plan.contracts?.integrations.length ?? 0;
  const siteType = plan.siteType ? ` (${plan.siteType})` : "";
  return `Plan skapad${siteType}: ${pageCount || plan.scope.length} sida/sidor och ${integrationCount} integration(er) är redo för granskning.`;
}

export function buildPlanUiPart(
  planData: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const plan = normalizePlanArtifact(planData);
  if (!plan) return null;

  return {
    type: "plan",
    plan: {
      title: plan.goal || "Plan",
      description: plan.scope.join(", "),
      steps: plan.steps.map((step) => {
        if (typeof step === "string") return step;
        return {
          title: step.title ?? "",
          description: step.description ?? "",
          status: step.status ?? "build",
        };
      }),
      blockers: plan.blockers,
      assumptions: plan.assumptions,
      raw: planData ?? plan,
    },
  };
}

/**
 * "Riktig plan"-predikatet för persist-beslutet. `normalizePlanArtifact`
 * defaultar `goal` till "Plan" och returnerar ett objekt även för `{}`, så
 * "gick att parsa som JSON" räcker inte — ett substanslöst objekt får inte
 * äta upp planner-prosan vid reload. Substans = minst ett normaliserat steg,
 * en blockerare (clarification-fråga — awaiting-input-planer förblir planer),
 * en sida eller en scope-rad; summeringen och plan-kortet bygger på exakt de
 * fälten. Jfr klientens check i `stream-handlers.ts`.
 */
export function planArtifactHasSubstance(
  planData: Record<string, unknown> | null,
): boolean {
  const plan = normalizePlanArtifact(planData);
  if (!plan) return false;
  return (
    plan.steps.length > 0 ||
    plan.blockers.length > 0 ||
    plan.pages.length > 0 ||
    plan.scope.length > 0
  );
}

/** Vilken gren som byggde plan-lägets persisterade assistentrad. */
export type PlanModeAssistantMessageKind =
  | "plan"
  | "planner-text"
  | "planner-error"
  | "planner-empty";

export type PlanModeAssistantMessage = {
  content: string;
  uiParts: Record<string, unknown>[] | undefined;
  kind: PlanModeAssistantMessageKind;
};

/** Tak för persisterad planner-prosa — historiken behåller senaste svaret ordagrant. */
const MAX_PLANNER_TEXT_CHARS = 8_000;

/**
 * Bygg assistentraden för en planner-tur — även när utdatan INTE är en plan.
 *
 * Plan-läget persisterade tidigare alltid `buildPlanSummaryMessage`, som för en
 * icke-plan-utdata föll tillbaka på "Plan skapad …" medan den riktiga prosan
 * bara fanns i SSE-strömmen och försvann vid reload (prod chat `785c8d7a`,
 * 2026-07-30). Raden ska spegla vad turen faktiskt producerade, så en tur utan
 * plan lämnar antingen svarstexten eller en tydlig förklaring efter sig.
 */
export function buildPlanModeAssistantMessage(params: {
  planData: Record<string, unknown> | null;
  hasBlockers: boolean;
  /**
   * True när turen löste ut ett plan-artifact MED substans (tool-call eller
   * parsad JSON som passerar `planArtifactHasSubstance`).
   */
  hasPlanArtifact: boolean;
  /** Ackumulerad `content`-text från planner-strömmen. */
  plannerText: string;
  upstreamErrorMessage?: string | null;
}): PlanModeAssistantMessage {
  const { planData, hasBlockers, hasPlanArtifact, plannerText, upstreamErrorMessage } = params;

  if (hasPlanArtifact) {
    const planPart = buildPlanUiPart(planData);
    return {
      content: buildPlanSummaryMessage(planData, hasBlockers),
      uiParts: planPart ? [planPart] : undefined,
      kind: "plan",
    };
  }

  const text = plannerText.trim();
  if (text) {
    return {
      content:
        text.length > MAX_PLANNER_TEXT_CHARS
          ? `${text.slice(0, MAX_PLANNER_TEXT_CHARS)}…`
          : text,
      uiParts: undefined,
      kind: "planner-text",
    };
  }

  const errorMessage = upstreamErrorMessage?.trim();
  if (errorMessage) {
    return {
      content: `Planeringen kunde inte slutföras: ${errorMessage}`,
      uiParts: undefined,
      kind: "planner-error",
    };
  }

  return {
    content: "Planeraren returnerade inget svar. Skicka meddelandet igen.",
    uiParts: undefined,
    kind: "planner-empty",
  };
}

export function buildApprovedPlanExecutionPrompt(rawPlan: Record<string, unknown>): string {
  const normalized = normalizePlanArtifact(rawPlan);
  if (!normalized) {
    return [
      "Den tidigare planen är godkänd.",
      "Utför nu byggfasen och generera implementationen direkt.",
      "Returnera kodfiler, inte en ny plan.",
    ].join("\n\n");
  }

  return [
    "Den här buildplanen är nu godkänd av användaren.",
    "Utför BUILD-fasen nu.",
    "Generera implementationen direkt utifrån planen nedan.",
    "Returnera kodfiler, inte en ny plan.",
    "",
    serializePlanForPrompt(normalized),
  ].join("\n");
}
