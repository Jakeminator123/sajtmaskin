import type { BuildIntent, BuildMethod } from "@/lib/builder/build-intent";
import {
  MAX_CHAT_MESSAGE_CHARS,
  ORCHESTRATION_PHASE_FORCE_AUDIT_CHARS,
  ORCHESTRATION_PHASE_FORCE_CHARS,
  ORCHESTRATION_SOFT_TARGET_APP_CHARS,
  ORCHESTRATION_SOFT_TARGET_AUDIT_CHARS,
  ORCHESTRATION_SOFT_TARGET_FOLLOWUP_CHARS,
  ORCHESTRATION_SOFT_TARGET_FREEFORM_CHARS,
  ORCHESTRATION_SOFT_TARGET_TECHNICAL_CHARS,
  ORCHESTRATION_SOFT_TARGET_TEMPLATE_CHARS,
  ORCHESTRATION_SOFT_TARGET_WIZARD_CHARS,
} from "@/lib/builder/promptLimits";

export type PromptStrategy = "direct" | "summarize" | "phase_plan_build_polish";
export type PromptType =
  | "audit"
  | "wizard"
  | "freeform"
  | "template"
  | "followup_general"
  | "followup_technical"
  | "unknown";

export type PromptStrategyMeta = {
  strategy: PromptStrategy;
  promptType: PromptType;
  budgetTarget: number;
  originalLength: number;
  optimizedLength: number;
  reductionRatio: number;
  reason: string;
  phaseHints: string[];
  complexityScore: number;
  wasChanged: boolean;
};

export type OrchestratePromptInput = {
  message: string;
  buildMethod?: BuildMethod | null | string;
  buildIntent?: BuildIntent | null | string;
  isFirstPrompt: boolean;
  planModeFirstPromptEnabled?: boolean;
  attachmentsCount?: number;
  hardCap?: number;
};

export type OrchestratePromptResult = {
  finalMessage: string;
  strategyMeta: PromptStrategyMeta;
};

type ComplexitySignals = {
  lineCount: number;
  bulletCount: number;
  headingLikeCount: number;
  sectionMarkerCount: number;
  urlCount: number;
  requirementKeywordCount: number;
};

const SECTION_MARKERS = [
  "mal",
  "goal",
  "sektion",
  "section",
  "constraint",
  "requirements",
  "design direction",
  "scope",
  "problem",
  "forbattring",
  "improvement",
  "audit",
];

const REQUIREMENT_MARKERS = [
  "must",
  "ska",
  "behover",
  "need to",
  "required",
  "do not",
  "avoid",
  "wcag",
  "accessibility",
  "seo",
  "performance",
  "responsive",
];

const PHASE_HINTS = [
  "Phase 1: Plan",
  "Phase 2: Build core",
  "Phase 3: Polish and validate",
];

function normalizeMessage(input: string): string {
  return String(input || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function normalizeLineKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`*_>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSafeLower(value: unknown): string {
  return String(value || "").toLowerCase();
}

function hasCodeFence(message: string): boolean {
  return message.includes("```");
}

function looksTechnicalMessage(message: string): boolean {
  const lower = toSafeLower(message);
  return (
    hasCodeFence(message) ||
    lower.includes("shadcn") ||
    lower.includes("registry files") ||
    lower.includes("auto-fix request") ||
    lower.includes("fix the issues") ||
    lower.includes("typescript") ||
    lower.includes("tsx")
  );
}

function detectPromptType(input: OrchestratePromptInput, normalizedMessage: string): PromptType {
  const method = toSafeLower(input.buildMethod);
  const intent = toSafeLower(input.buildIntent);

  if (method === "audit") return "audit";
  if (method === "wizard") return "wizard";
  if (method === "freeform" || method === "kostnadsfri") return "freeform";
  if (method === "category" || intent === "template") return "template";

  if (!input.isFirstPrompt) {
    return looksTechnicalMessage(normalizedMessage) ? "followup_technical" : "followup_general";
  }

  return "unknown";
}

function resolveSoftTarget(promptType: PromptType, buildIntent?: string | null): number {
  if (promptType === "audit") return ORCHESTRATION_SOFT_TARGET_AUDIT_CHARS;
  if (promptType === "wizard") return ORCHESTRATION_SOFT_TARGET_WIZARD_CHARS;
  if (promptType === "template") return ORCHESTRATION_SOFT_TARGET_TEMPLATE_CHARS;
  if (promptType === "followup_technical") return ORCHESTRATION_SOFT_TARGET_TECHNICAL_CHARS;
  if (promptType === "followup_general") return ORCHESTRATION_SOFT_TARGET_FOLLOWUP_CHARS;
  if (toSafeLower(buildIntent) === "app") return ORCHESTRATION_SOFT_TARGET_APP_CHARS;
  return ORCHESTRATION_SOFT_TARGET_FREEFORM_CHARS;
}

function analyzeComplexity(message: string): ComplexitySignals {
  const lines = message
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const joinedLower = toSafeLower(message);

  const bulletCount = lines.filter((line) => /^([-*•]|\d+[.)])\s+/.test(line)).length;
  const headingLikeCount = lines.filter((line) => line.endsWith(":") || /^[A-Z0-9_ ]{8,}$/.test(line))
    .length;
  const sectionMarkerCount = SECTION_MARKERS.reduce((count, marker) => {
    return count + (joinedLower.includes(marker) ? 1 : 0);
  }, 0);
  const urlCount = (message.match(/https?:\/\/[^\s)]+/g) || []).length;
  const requirementKeywordCount = REQUIREMENT_MARKERS.reduce((count, marker) => {
    return count + (joinedLower.includes(marker) ? 1 : 0);
  }, 0);

  return {
    lineCount: lines.length,
    bulletCount,
    headingLikeCount,
    sectionMarkerCount,
    urlCount,
    requirementKeywordCount,
  };
}

function scoreComplexity(signals: ComplexitySignals, attachmentsCount: number): number {
  let score = 0;
  if (signals.lineCount > 40) score += 1;
  if (signals.lineCount > 80) score += 1;
  if (signals.bulletCount > 10) score += 1;
  if (signals.headingLikeCount > 6) score += 1;
  if (signals.sectionMarkerCount > 3) score += 1;
  if (signals.requirementKeywordCount > 5) score += 1;
  if (signals.urlCount > 3) score += 1;
  if (attachmentsCount > 4) score += 1;
  return score;
}

function firstParagraph(message: string): string {
  const chunks = message
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  return chunks[0] || message.trim();
}

function pickImportantLines(message: string): string[] {
  const seen = new Set<string>();
  const lines = message
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const selected: string[] = [];
  lines.forEach((line) => {
    const key = normalizeLineKey(line);
    if (!key || seen.has(key)) return;

    const lower = key.toLowerCase();
    const isBullet = /^([-*•]|\d+[.)])\s+/.test(line);
    const isHeading = line.endsWith(":");
    const hasUrl = /https?:\/\/[^\s)]+/.test(line);
    const looksConstraint = REQUIREMENT_MARKERS.some((marker) => lower.includes(marker));

    if (isHeading || isBullet || hasUrl || looksConstraint) {
      seen.add(key);
      selected.push(line);
    }
  });

  return selected.slice(0, 24);
}

function trimToTargetByLines(lines: string[], target: number): string {
  if (lines.length === 0) return "";
  const next = [...lines];
  let text = next.join("\n");
  while (next.length > 2 && text.length > target) {
    next.pop();
    text = next.join("\n");
  }
  return text.length > target ? text.slice(0, target).trim() : text;
}

function summarizeMessage(message: string, target: number): string {
  const intro = firstParagraph(message);
  const important = pickImportantLines(message);
  const urls = Array.from(new Set((message.match(/https?:\/\/[^\s)]+/g) || []))).slice(0, 8);

  const sections: string[] = [];
  sections.push("Primary request:");
  sections.push(intro);

  if (important.length > 0) {
    sections.push("", "Key requirements:");
    important.slice(0, 14).forEach((line) => {
      sections.push(line.startsWith("-") ? line : `- ${line.replace(/^[-*•]\s*/, "")}`);
    });
  }

  if (urls.length > 0) {
    sections.push("", "References:");
    urls.forEach((url) => sections.push(`- ${url}`));
  }

  const merged = trimToTargetByLines(sections, target);
  if (merged.length > 0) return merged;
  return intro.length > target ? intro.slice(0, target).trim() : intro;
}

function buildPhasedMessage(summary: string, promptType: PromptType): string {
  const intro =
    promptType === "audit"
      ? "Large audit context detected. Execute in phases to reduce prompt bloat."
      : "Large prompt detected. Execute in phases for stability and better output quality.";

  return [
    intro,
    "",
    "Execution mode: Plan -> Build -> Polish",
    "1) PLAN: produce a concise implementation plan with assumptions and priorities.",
    "2) BUILD: implement core structure and highest-priority requirements first.",
    "3) POLISH: improve accessibility, performance, copy quality, and consistency.",
    "",
    "If details conflict, prioritize explicit user requirements.",
    "",
    "Condensed source request:",
    summary,
  ].join("\n");
}

function reductionRatio(original: number, optimized: number): number {
  if (original <= 0) return 0;
  const ratio = 1 - optimized / original;
  return Number(Math.max(0, Math.min(1, ratio)).toFixed(4));
}

export function orchestratePromptMessage(input: OrchestratePromptInput): OrchestratePromptResult {
  const normalizedMessage = normalizeMessage(input.message);
  const originalLength = normalizedMessage.length;
  const promptType = detectPromptType(input, normalizedMessage);
  const budgetTarget = resolveSoftTarget(promptType, input.buildIntent);
  const hardCap = Math.max(2_000, Math.min(input.hardCap ?? MAX_CHAT_MESSAGE_CHARS, MAX_CHAT_MESSAGE_CHARS));
  const attachmentsCount = Math.max(0, input.attachmentsCount ?? 0);
  const complexitySignals = analyzeComplexity(normalizedMessage);
  const complexityScore = scoreComplexity(complexitySignals, attachmentsCount);

  let strategy: PromptStrategy = "direct";
  let reason = "within_budget";
  let optimizedMessage = normalizedMessage;
  let phaseHints: string[] = [];

  const phaseForceThreshold =
    promptType === "audit" ? ORCHESTRATION_PHASE_FORCE_AUDIT_CHARS : ORCHESTRATION_PHASE_FORCE_CHARS;
  const exceedsBudget = originalLength > budgetTarget;
  const forcePhase = originalLength >= phaseForceThreshold;
  const isComplex =
    complexityScore >= 4 ||
    (promptType === "audit" && originalLength > Math.round(budgetTarget * 1.15)) ||
    (input.isFirstPrompt && toSafeLower(input.buildIntent) === "app" && originalLength > budgetTarget);
  const prefersPhaseForPlanMode =
    input.isFirstPrompt &&
    Boolean(input.planModeFirstPromptEnabled) &&
    originalLength > Math.round(budgetTarget * 1.15);

  if (normalizedMessage.length === 0) {
    reason = "empty_prompt";
    strategy = "direct";
  } else if (!exceedsBudget) {
    strategy = "direct";
    reason = "within_budget";
  } else if (forcePhase || isComplex || prefersPhaseForPlanMode) {
    strategy = "phase_plan_build_polish";
    reason = forcePhase ? "force_phase_threshold" : prefersPhaseForPlanMode ? "plan_mode_large_prompt" : "high_complexity";
    phaseHints = [...PHASE_HINTS];
    const summary = summarizeMessage(normalizedMessage, Math.max(1200, Math.round(budgetTarget * 0.85)));
    optimizedMessage = buildPhasedMessage(summary, promptType);
  } else {
    strategy = "summarize";
    reason = "over_budget_summarized";
    optimizedMessage = summarizeMessage(normalizedMessage, budgetTarget);
  }

  if (optimizedMessage.length > hardCap) {
    const emergencyTarget = Math.max(1200, Math.min(hardCap - 200, budgetTarget));
    optimizedMessage = summarizeMessage(optimizedMessage, emergencyTarget);
    if (optimizedMessage.length > hardCap) {
      optimizedMessage = trimToTargetByLines(optimizedMessage.split("\n"), hardCap);
    }
    reason = `${reason}_hard_cap`;
  }

  const optimizedLength = optimizedMessage.length;
  const meta: PromptStrategyMeta = {
    strategy,
    promptType,
    budgetTarget,
    originalLength,
    optimizedLength,
    reductionRatio: reductionRatio(originalLength, optimizedLength),
    reason,
    phaseHints,
    complexityScore,
    wasChanged: optimizedMessage !== normalizedMessage,
  };

  return {
    finalMessage: optimizedMessage || normalizedMessage,
    strategyMeta: meta,
  };
}
