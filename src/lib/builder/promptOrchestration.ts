import type { BuildIntent, BuildMethod } from "@/lib/builder/build-intent";
import {
  SCOPE_MARKERS,
  DESIGN_TOKENS,
  REQUIREMENT_MARKERS,
  countTokenHits,
} from "./prompt-heuristics";
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

export type PromptStrategy = "direct" | "phase_plan_build_refine" | "preserved";
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
  attachmentsCount?: number;
  hardCap?: number;
  promptSourceKind?: string | null;
  promptSourceTechnical?: boolean;
  promptSourcePreservePayload?: boolean;
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
  designKeywordCount: number;
};

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

function looksTechnicalMessage(message: string, input?: Pick<OrchestratePromptInput, "promptSourceTechnical">): boolean {
  if (input?.promptSourceTechnical) return true;
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

const TECHNICAL_DIRECT_TRIGGERS = [
  "auto-fix request",
  "auto-fix",
  "npm run build",
  "npm run typecheck",
  "npm run lint",
  "typeerror:",
  "syntaxerror:",
  "referenceerror:",
  "failed to compile",
  "eslint",
  "stack trace",
  "error ts",
];
const TECHNICAL_DIRECT_PATTERNS = [/\bTS\d{4}\b/];

function mustPreserveTechnicalContent(message: string): boolean {
  const lower = toSafeLower(message);
  if (TECHNICAL_DIRECT_TRIGGERS.some((t) => lower.includes(t))) return true;
  if (TECHNICAL_DIRECT_PATTERNS.some((p) => p.test(message))) return true;
  return false;
}

/** Exported for follow-up context policy and file-context heuristics. */
export function looksDesignHeavyMessage(message: string): boolean {
  return countTokenHits(message, DESIGN_TOKENS) >= 3;
}

function shouldPreserveRegistryPayload(
  message: string,
  input?: Pick<OrchestratePromptInput, "promptSourcePreservePayload">,
): boolean {
  if (input?.promptSourcePreservePayload) return true;
  const lower = toSafeLower(message);
  const normalized = lower.replace(/\u2011/g, "-");
  const hasRegistrySignals =
    normalized.includes("registry files") ||
    normalized.includes("registry dependencies") ||
    normalized.includes("add the shadcn/ui block") ||
    normalized.includes("add the shadcn/ui component") ||
    normalized.includes("ui-element");
  const hasStructuredPayload = hasCodeFence(message) || message.includes("---");
  return hasRegistrySignals && hasStructuredPayload;
}

function detectPromptType(input: OrchestratePromptInput, normalizedMessage: string): PromptType {
  const method = toSafeLower(input.buildMethod);
  const intent = toSafeLower(input.buildIntent);

  // Follow-ups are detected first so the buildMethod-derived branches below
  // (audit / wizard / freeform / template) do not short-circuit a follow-up
  // into a first-prompt-shaped budget. Before SAJ-12 (handoff B4), freeform
  // and kostnadsfri buildMethods always returned "freeform" — meaning every
  // follow-up to a freeform-launched chat skipped the
  // ORCHESTRATION_SOFT_TARGET_FOLLOWUP_CHARS budget and was treated as a
  // freeform first-prompt. The same drift would happen for audit/wizard
  // follow-ups, just less common in practice.
  if (!input.isFirstPrompt) {
    return looksTechnicalMessage(normalizedMessage, input) ? "followup_technical" : "followup_general";
  }

  if (method === "audit") return "audit";
  if (method === "wizard") return "wizard";
  if (method === "freeform" || method === "kostnadsfri") return "freeform";
  if (method === "category" || intent === "template") return "template";

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
  const sectionMarkerCount = countTokenHits(joinedLower, SCOPE_MARKERS);
  const urlCount = (message.match(/https?:\/\/[^\s)]+/g) || []).length;
  const requirementKeywordCount = countTokenHits(joinedLower, REQUIREMENT_MARKERS);
  const designKeywordCount = countTokenHits(joinedLower, DESIGN_TOKENS);

  return {
    lineCount: lines.length,
    bulletCount,
    headingLikeCount,
    sectionMarkerCount,
    urlCount,
    requirementKeywordCount,
    designKeywordCount,
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
  if (signals.designKeywordCount > 4) score += 1;
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

/**
 * Legacy lossy summary — kept only for emergency fallback when the prompt exceeds
 * hardCap and section-aware compression still fails (should be extremely rare).
 */
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

/**
 * Best-effort preservation when the prompt exceeds hardCap: keep start + end so
 * constraints and closing instructions survive; avoid dropping 80%+ of prose like summarize did.
 */
export function buildSectionAwareHandoff(message: string, maxChars: number): string {
  if (message.length <= maxChars) return message;
  const reserve = 280;
  const usable = Math.max(4_000, maxChars - reserve);
  const headChars = Math.floor(usable * 0.52);
  const tailChars = usable - headChars;
  const head = message.slice(0, headChars);
  const tail = message.slice(Math.max(0, message.length - tailChars));
  const omitted = message.length - headChars - tailChars;
  const bridge =
    `\n\n---\n\n[System: Middle truncated, ${omitted} characters omitted. Prioritize the beginning and end below.]\n\n---\n\n`;
  let out = head + bridge + tail;
  if (out.length > maxChars) {
    out = summarizeMessage(message, Math.max(1200, maxChars - 200));
  }
  return out;
}

function bodyForPhaseOrPreserved(normalizedMessage: string, hardCap: number): string {
  if (normalizedMessage.length <= hardCap) return normalizedMessage;
  return buildSectionAwareHandoff(normalizedMessage, hardCap);
}

function buildPhasedMessage(userRequestBody: string, promptType: PromptType): string {
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
    "Full user request (preserve requirements; do not invent scope beyond it):",
    userRequestBody,
  ].join("\n");
}

/** Bytes/chars budget for the user body inside a phased wrapper so total <= hardCap. */
function maxCharsForPhasedInnerBody(hardCap: number, promptType: PromptType): number {
  const overhead = buildPhasedMessage("", promptType).length;
  return Math.max(1_500, hardCap - overhead - 80);
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
  const isDesignHeavy = looksDesignHeavyMessage(normalizedMessage);
  const preserveRegistryPayload = shouldPreserveRegistryPayload(normalizedMessage, input);

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

  const forceDirect =
    input.promptSourcePreservePayload || mustPreserveTechnicalContent(normalizedMessage);

  if (normalizedMessage.length === 0) {
    reason = "empty_prompt";
    strategy = "direct";
  } else if (preserveRegistryPayload) {
    strategy = "direct";
    reason = "preserve_registry_payload";
  } else if (forceDirect) {
    strategy = "direct";
    reason = "technical_content_preserved";
  } else if (!exceedsBudget) {
    strategy = "direct";
    reason = "within_budget";
  } else if (forcePhase || isComplex) {
    strategy = "phase_plan_build_refine";
    reason = forcePhase ? "force_phase_threshold" : "high_complexity";
    phaseHints = [...PHASE_HINTS];
    const innerCap = maxCharsForPhasedInnerBody(hardCap, promptType);
    const preservedBody = bodyForPhaseOrPreserved(normalizedMessage, innerCap);
    optimizedMessage = buildPhasedMessage(preservedBody, promptType);
  } else {
    strategy = "preserved";
    reason = isDesignHeavy
      ? "over_soft_target_full_handoff_design_heavy"
      : "over_soft_target_full_handoff";
    const body = bodyForPhaseOrPreserved(normalizedMessage, hardCap);
    optimizedMessage =
      body === normalizedMessage
        ? `[Prompt handoff: Full text preserved (${originalLength} chars). Soft orchestration target ~${budgetTarget} chars — honor every requirement below.]\n\n${normalizedMessage}`
        : body;
  }

  if (optimizedMessage.length > hardCap && !forceDirect) {
    if (strategy === "phase_plan_build_refine") {
      const innerCap = maxCharsForPhasedInnerBody(hardCap, promptType);
      const inner = buildSectionAwareHandoff(normalizedMessage, innerCap);
      optimizedMessage = buildPhasedMessage(inner, promptType);
    } else {
      optimizedMessage = buildSectionAwareHandoff(normalizedMessage, hardCap);
    }
    if (optimizedMessage.length > hardCap) {
      const emergencyTarget = Math.max(1200, Math.min(hardCap - 200, budgetTarget));
      optimizedMessage = summarizeMessage(optimizedMessage, emergencyTarget);
      if (optimizedMessage.length > hardCap) {
        optimizedMessage = trimToTargetByLines(optimizedMessage.split("\n"), hardCap);
      }
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
