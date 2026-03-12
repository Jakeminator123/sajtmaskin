/**
 * Structured plan schema for the builder plan execution mode.
 *
 * When the user clicks "Plan", the planner pass produces a PlanArtifact
 * instead of code.  The executor then runs the plan in phases.
 */

export type PlanPhase = "plan" | "build" | "polish" | "verify" | "done";

export type PlanStepStatus = "pending" | "active" | "done" | "skipped";

export type PlanSiteType = "one-page" | "brochure" | "content-heavy" | "app-shell";

export type PlanStep = {
  id: string;
  title: string;
  description: string;
  status: PlanStepStatus;
  phase: PlanPhase;
};

export type PlanBlocker = {
  id: string;
  kind: "integration" | "env" | "database" | "auth" | "payment" | "unclear";
  question: string;
  options?: string[];
  resolved?: boolean;
  answer?: string;
};

export type PlanAssumption = {
  id: string;
  description: string;
  defaultValue: string;
};

export type PlanPage = {
  id: string;
  path: string;
  name: string;
  intent: string;
  sections: string[];
  primaryCta?: string;
  inNavigation?: boolean;
};

export type PlanIntegrationContract = {
  provider: string;
  name: string;
  reason: string;
  status: "chosen" | "unresolved" | "optional";
  envVars?: string[];
};

export type PlanEnvVarContract = {
  key: string;
  reason: string;
  required?: boolean;
};

export type PlanContracts = {
  dataMode: "none" | "mocked" | "persisted" | "mixed" | "unknown";
  databaseProvider?: string;
  authProvider?: string;
  paymentProvider?: string;
  integrations: PlanIntegrationContract[];
  envVars: PlanEnvVarContract[];
};

export type PlanScaffoldChoice = {
  id?: string;
  family?: string;
  label: string;
  reason?: string;
  source?: "planner" | "runtime" | "manual" | "auto";
};

export type PlanTemplateRecommendation = {
  id?: string;
  title: string;
  categorySlug?: string;
  reason?: string;
  qualityScore?: number;
};

export type PlanArtifact = {
  id: string;
  goal: string;
  siteType?: PlanSiteType;
  scope: string[];
  pages: PlanPage[];
  steps: PlanStep[];
  blockers: PlanBlocker[];
  assumptions: PlanAssumption[];
  contracts?: PlanContracts;
  scaffold?: PlanScaffoldChoice | null;
  templateRecommendations?: PlanTemplateRecommendation[];
  currentPhase: PlanPhase;
  createdAt: number;
  updatedAt: number;
};

export function createEmptyPlan(id: string, goal: string): PlanArtifact {
  return {
    id,
    goal,
    scope: [],
    pages: [],
    steps: [],
    blockers: [],
    assumptions: [],
    currentPhase: "plan",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function hasUnresolvedBlockers(plan: PlanArtifact): boolean {
  return plan.blockers.some((b) => !b.resolved);
}

export function unresolvedBlockers(plan: PlanArtifact): PlanBlocker[] {
  return plan.blockers.filter((b) => !b.resolved);
}

export function advancePhase(plan: PlanArtifact): PlanPhase {
  const order: PlanPhase[] = ["plan", "build", "polish", "verify", "done"];
  const idx = order.indexOf(plan.currentPhase);
  return idx < order.length - 1 ? order[idx + 1] : "done";
}

export function isPlanComplete(plan: PlanArtifact): boolean {
  return plan.currentPhase === "done";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => asString(item))
        .filter(Boolean)
    : [];
}

function coerceSiteType(value: unknown): PlanSiteType | undefined {
  return value === "one-page" ||
    value === "brochure" ||
    value === "content-heavy" ||
    value === "app-shell"
    ? value
    : undefined;
}

function normalizePage(value: unknown, index: number): PlanPage | null {
  if (!isRecord(value)) return null;
  const path = asString(value.path) || (index === 0 ? "/" : "");
  const name = asString(value.name) || `Page ${index + 1}`;
  const intent = asString(value.intent) || "";
  const sections = asStringArray(value.sections);
  if (!path) return null;
  return {
    id: asString(value.id) || `page-${index + 1}`,
    path,
    name,
    intent,
    sections,
    primaryCta: asString(value.primaryCta) || undefined,
    inNavigation: typeof value.inNavigation === "boolean" ? value.inNavigation : undefined,
  };
}

function normalizeIntegrationContract(value: unknown): PlanIntegrationContract | null {
  if (!isRecord(value)) return null;
  const statusValue = asString(value.status);
  const status =
    statusValue === "chosen" || statusValue === "unresolved" || statusValue === "optional"
      ? statusValue
      : "unresolved";
  const provider = asString(value.provider);
  const name = asString(value.name) || provider;
  const reason = asString(value.reason);
  if (!provider && !name) return null;
  return {
    provider: provider || name,
    name: name || provider,
    reason,
    status,
    envVars: asStringArray(value.envVars),
  };
}

function normalizeEnvVarContract(value: unknown): PlanEnvVarContract | null {
  if (!isRecord(value)) return null;
  const key = asString(value.key).toUpperCase();
  if (!key) return null;
  return {
    key,
    reason: asString(value.reason),
    required: typeof value.required === "boolean" ? value.required : undefined,
  };
}

function normalizeContracts(value: unknown): PlanContracts | undefined {
  if (!isRecord(value)) return undefined;
  const dataModeValue = asString(value.dataMode);
  const dataMode =
    dataModeValue === "none" ||
    dataModeValue === "mocked" ||
    dataModeValue === "persisted" ||
    dataModeValue === "mixed" ||
    dataModeValue === "unknown"
      ? dataModeValue
      : "unknown";
  return {
    dataMode,
    databaseProvider: asString(value.databaseProvider) || undefined,
    authProvider: asString(value.authProvider) || undefined,
    paymentProvider: asString(value.paymentProvider) || undefined,
    integrations: Array.isArray(value.integrations)
      ? value.integrations
          .map((item) => normalizeIntegrationContract(item))
          .filter((item): item is PlanIntegrationContract => Boolean(item))
      : [],
    envVars: Array.isArray(value.envVars)
      ? value.envVars
          .map((item) => normalizeEnvVarContract(item))
          .filter((item): item is PlanEnvVarContract => Boolean(item))
      : [],
  };
}

function normalizeScaffold(value: unknown): PlanScaffoldChoice | null {
  if (!isRecord(value)) return null;
  const label = asString(value.label);
  if (!label) return null;
  const sourceValue = asString(value.source);
  const source =
    sourceValue === "planner" ||
    sourceValue === "runtime" ||
    sourceValue === "manual" ||
    sourceValue === "auto"
      ? sourceValue
      : undefined;
  return {
    id: asString(value.id) || undefined,
    family: asString(value.family) || undefined,
    label,
    reason: asString(value.reason) || undefined,
    source,
  };
}

function normalizeTemplateRecommendation(value: unknown): PlanTemplateRecommendation | null {
  if (!isRecord(value)) return null;
  const title = asString(value.title);
  if (!title) return null;
  return {
    id: asString(value.id) || undefined,
    title,
    categorySlug: asString(value.categorySlug) || undefined,
    reason: asString(value.reason) || undefined,
    qualityScore:
      typeof value.qualityScore === "number" && Number.isFinite(value.qualityScore)
        ? value.qualityScore
        : undefined,
  };
}

export function normalizePlanArtifact(value: unknown): PlanArtifact | null {
  if (!isRecord(value)) return null;

  const goal = asString(value.goal) || asString(value.title) || "Plan";
  const scope = asStringArray(value.scope);
  const steps: PlanStep[] = [];
  if (Array.isArray(value.steps)) {
    for (let index = 0; index < value.steps.length; index += 1) {
      const item = value.steps[index];
      if (!isRecord(item)) continue;
      const title = asString(item.title);
      const description = asString(item.description);
      const phaseValue = asString(item.phase);
      const phase =
        phaseValue === "plan" ||
        phaseValue === "build" ||
        phaseValue === "polish" ||
        phaseValue === "verify" ||
        phaseValue === "done"
          ? (phaseValue as PlanPhase)
          : null;
      if (!title || !description || !phase) continue;
      steps.push({
        id: asString(item.id) || `step-${index + 1}`,
        title,
        description,
        status: "pending",
        phase,
      });
    }
  }

  const blockers: PlanBlocker[] = [];
  if (Array.isArray(value.blockers)) {
    for (let index = 0; index < value.blockers.length; index += 1) {
      const item = value.blockers[index];
      if (!isRecord(item)) continue;
      const kindValue = asString(item.kind);
      const kind =
        kindValue === "integration" ||
        kindValue === "env" ||
        kindValue === "database" ||
        kindValue === "auth" ||
        kindValue === "payment" ||
        kindValue === "unclear"
          ? kindValue
          : null;
      const question = asString(item.question);
      if (!kind || !question) continue;
      blockers.push({
        id: asString(item.id) || `blocker-${index + 1}`,
        kind,
        question,
        options: asStringArray(item.options),
        resolved: typeof item.resolved === "boolean" ? item.resolved : undefined,
        answer: asString(item.answer) || undefined,
      });
    }
  }
  const assumptions = Array.isArray(value.assumptions)
    ? value.assumptions
        .map((item, index) => {
          if (!isRecord(item)) return null;
          const description = asString(item.description);
          const defaultValue = asString(item.defaultValue);
          if (!description) return null;
          return {
            id: asString(item.id) || `assumption-${index + 1}`,
            description,
            defaultValue,
          };
        })
        .filter((item): item is PlanAssumption => Boolean(item))
    : [];
  const pages = Array.isArray(value.pages)
    ? value.pages
        .map((item, index) => normalizePage(item, index))
        .filter((item): item is PlanPage => Boolean(item))
    : [];
  const currentPhaseValue = asString(value.currentPhase);
  const currentPhase =
    currentPhaseValue === "plan" ||
    currentPhaseValue === "build" ||
    currentPhaseValue === "polish" ||
    currentPhaseValue === "verify" ||
    currentPhaseValue === "done"
      ? currentPhaseValue
      : "plan";

  return {
    id: asString(value.id) || `plan-${Date.now()}`,
    goal,
    siteType: coerceSiteType(value.siteType),
    scope,
    pages,
    steps,
    blockers,
    assumptions,
    contracts: normalizeContracts(value.contracts),
    scaffold: normalizeScaffold(value.scaffold),
    templateRecommendations: Array.isArray(value.templateRecommendations)
      ? value.templateRecommendations
          .map((item) => normalizeTemplateRecommendation(item))
          .filter((item): item is PlanTemplateRecommendation => Boolean(item))
      : [],
    currentPhase,
    createdAt:
      typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
        ? value.createdAt
        : Date.now(),
    updatedAt:
      typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt)
        ? value.updatedAt
        : Date.now(),
  };
}

/**
 * Serialize a plan artifact into a compact context string that can be
 * injected into subsequent generation prompts.
 */
export function serializePlanForPrompt(plan: PlanArtifact): string {
  const normalizedPlan = normalizePlanArtifact(plan) ?? plan;
  const lines: string[] = [
    `## Plan: ${normalizedPlan.goal}`,
    "",
    "### Scope",
    ...normalizedPlan.scope.map((s) => `- ${s}`),
    "",
    "### Steps",
    ...normalizedPlan.steps.map(
      (s) => `- [${s.status}] (${s.phase}) ${s.title}: ${s.description}`,
    ),
  ];

  if (normalizedPlan.siteType) {
    lines.push("", "### Site Type", `- ${normalizedPlan.siteType}`);
  }

  if (normalizedPlan.pages.length > 0) {
    lines.push("", "### Planned pages");
    for (const page of normalizedPlan.pages) {
      const sections = page.sections.length > 0 ? ` [${page.sections.join(", ")}]` : "";
      const intent = page.intent ? ` — ${page.intent}` : "";
      const cta = page.primaryCta ? ` — CTA: ${page.primaryCta}` : "";
      lines.push(`- ${page.name} (${page.path})${intent}${cta}${sections}`);
    }
  }

  if (normalizedPlan.contracts) {
    lines.push("", "### Contracts");
    lines.push(`- Data mode: ${normalizedPlan.contracts.dataMode}`);
    if (normalizedPlan.contracts.databaseProvider) {
      lines.push(`- Database: ${normalizedPlan.contracts.databaseProvider}`);
    }
    if (normalizedPlan.contracts.authProvider) {
      lines.push(`- Auth: ${normalizedPlan.contracts.authProvider}`);
    }
    if (normalizedPlan.contracts.paymentProvider) {
      lines.push(`- Payment: ${normalizedPlan.contracts.paymentProvider}`);
    }
    for (const integration of normalizedPlan.contracts.integrations) {
      const envVars = integration.envVars?.length ? ` [${integration.envVars.join(", ")}]` : "";
      lines.push(
        `- Integration (${integration.status}): ${integration.name} — ${integration.reason}${envVars}`,
      );
    }
    for (const envVar of normalizedPlan.contracts.envVars) {
      lines.push(
        `- Env ${envVar.required === false ? "(optional)" : "(required)"}: ${envVar.key} — ${envVar.reason}`,
      );
    }
  }

  if (normalizedPlan.scaffold) {
    lines.push("", "### Scaffold");
    lines.push(
      `- ${normalizedPlan.scaffold.label}` +
        (normalizedPlan.scaffold.family ? ` [${normalizedPlan.scaffold.family}]` : "") +
        (normalizedPlan.scaffold.reason ? ` — ${normalizedPlan.scaffold.reason}` : ""),
    );
  }

  if (normalizedPlan.templateRecommendations && normalizedPlan.templateRecommendations.length > 0) {
    lines.push("", "### Template recommendations");
    for (const recommendation of normalizedPlan.templateRecommendations) {
      lines.push(
        `- ${recommendation.title}` +
          (recommendation.reason ? ` — ${recommendation.reason}` : ""),
      );
    }
  }

  if (normalizedPlan.assumptions.length > 0) {
    lines.push("", "### Assumptions (auto-resolved)");
    for (const a of normalizedPlan.assumptions) {
      lines.push(`- ${a.description} → ${a.defaultValue}`);
    }
  }

  const resolved = normalizedPlan.blockers.filter((b) => b.resolved);
  if (resolved.length > 0) {
    lines.push("", "### Resolved decisions");
    for (const b of resolved) {
      lines.push(`- ${b.question} → ${b.answer ?? "(accepted)"}`);
    }
  }

  return lines.join("\n");
}
