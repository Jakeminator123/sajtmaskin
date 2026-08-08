import type { ToolUIPart } from "ai";
import type { ToolQuestionPrompt } from "./types";

export function isPlanAwaitingInput(
  tool: Partial<ToolUIPart> & {
    input?: unknown;
    output?: unknown;
    type?: string;
    toolName?: string;
  },
) {
  const outputObj =
    tool.output && typeof tool.output === "object" ? (tool.output as Record<string, unknown>) : null;
  if (Array.isArray(outputObj?.planBlockers)) return true;
  const toolName = typeof tool.toolName === "string" ? tool.toolName.toLowerCase() : "";
  return toolName.includes("plan");
}

function getToolQuestionPrompt(
  tool: Partial<ToolUIPart> & {
    input?: unknown;
    output?: unknown;
    type?: string;
    approval?: unknown;
  },
): ToolQuestionPrompt | null {
  const fromApproval = extractQuestionPrompt(tool.approval);
  if (fromApproval) return fromApproval;
  const fromOutput = extractQuestionPrompt(tool.output);
  if (fromOutput) return fromOutput;
  const fromInput = extractQuestionPrompt(tool.input);
  if (fromInput) return fromInput;

  const type = typeof tool.type === "string" ? tool.type.toLowerCase() : "";
  const toolWithName = tool as { name?: string; toolName?: string };
  const name = `${toolWithName.name ?? ""} ${toolWithName.toolName ?? ""}`.toLowerCase();
  const hasQuestionHint =
    type.includes("question") ||
    type.includes("clarif") ||
    type.includes("approval") ||
    name.includes("question") ||
    name.includes("clarif") ||
    name.includes("approval");
  if (!hasQuestionHint) return null;

  return {
    question: "Välj ett svar för att fortsätta.",
    options: [],
  };
}

export function getActionPrompt(
  tool: Partial<ToolUIPart> & {
    input?: unknown;
    output?: unknown;
    type?: string;
    approval?: unknown;
  },
  state: ToolUIPart["state"],
): ToolQuestionPrompt | null {
  const explicitPrompt = getToolQuestionPrompt(tool);
  const isActionableState =
    state === "approval-requested" ||
    ((state === "input-available" || state === "input-streaming") && Boolean(explicitPrompt));
  if (!isActionableState) return null;

  if (explicitPrompt) {
    const normalizedPrompt = {
      question: normalizeQuestionText(explicitPrompt.question),
      options: explicitPrompt.options.map(normalizeApprovalOptionLabel),
    };
    if (normalizedPrompt.options.length === 0) {
      const shouldUseSyntheticApprovalOptions =
        state === "approval-requested" || looksLikeApprovalQuestion(normalizedPrompt.question);
      return {
        question: normalizedPrompt.question,
        options: shouldUseSyntheticApprovalOptions
          ? ["Godkänn förslag", "Avvisa förslag", "Annat"]
          : [],
      };
    }
    return normalizedPrompt;
  }

  const approvalOptions = extractApprovalOptions(tool);
  return {
    question: "AI väntar på ditt svar innan nästa steg kan fortsätta.",
    options:
      approvalOptions.length > 0
        ? approvalOptions.map(normalizeApprovalOptionLabel)
        : ["Godkänn förslag", "Avvisa förslag", "Annat"],
  };
}

export function normalizeQuestionText(value: string): string {
  return value
    .replace(/\bv0\b/gi, "AI")
    .replace(
      /needs your answer before the next version can be generated\.?/gi,
      "behöver ditt svar innan nästa version kan genereras.",
    )
    .replace(
      /needs your answer to a follow-up question before the next version can be generated\.?/gi,
      "behöver ditt svar på en följdfråga innan nästa version kan genereras.",
    )
    .replace(
      /pick an option in chat or reply with free text\.?/gi,
      "Välj ett alternativ i chatten eller svara med fri text.",
    );
}

function looksLikeApprovalQuestion(question: string): boolean {
  const normalized = question.trim().toLowerCase();
  if (!normalized) return false;
  return [
    "approve",
    "approval",
    "confirm",
    "continue",
    "proceed",
    "accept",
    "reject",
    "deny",
    "godkänn",
    "godkanna",
    "bekräfta",
    "bekrafta",
    "fortsätt",
    "fortsatt",
    "fortsätta",
    "avvisa",
    "tillåt",
    "tillat",
    "tillåta",
  ].some((token) => normalized.includes(token));
}

export function normalizeApprovalOptionLabel(value: string): string {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "approve plan") return "Godkänn förslag";
  if (lower === "deny plan") return "Avvisa förslag";
  if (lower === "other") return "Annat";
  return trimmed.replace(/\bv0\b/gi, "AI");
}

export function extractQuestionPrompt(value: unknown, depth = 0): ToolQuestionPrompt | null {
  if (depth > 4) return null;
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const question =
    (typeof obj.question === "string" && obj.question.trim()) ||
    (typeof obj.prompt === "string" && obj.prompt.trim()) ||
    (typeof obj.title === "string" && obj.title.trim()) ||
    (typeof obj.message === "string" && obj.message.trim()) ||
    (typeof obj.text === "string" && obj.text.trim()) ||
    (typeof obj.description === "string" && obj.description.trim()) ||
    (typeof obj.label === "string" && obj.label.trim()) ||
    null;

  const options = readQuestionOptions(
    obj.options ??
      obj.choices ??
      obj.answers ??
      obj.buttons ??
      obj.values ??
      obj.items ??
      obj.questions,
  );
  if (question || options.length > 0) {
    return {
      question: question || "Choose an answer to continue.",
      options,
    };
  }

  const nestedValues = [obj.input, obj.output, obj.data, obj.payload, obj.approval];
  for (const nested of nestedValues) {
    const nestedPrompt = extractQuestionPrompt(nested, depth + 1);
    if (nestedPrompt) return nestedPrompt;
  }

  return null;
}

function readQuestionOptions(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        if (typeof item === "string") return [item];
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          const candidate =
            (typeof obj.label === "string" && obj.label) ||
            (typeof obj.title === "string" && obj.title) ||
            (typeof obj.text === "string" && obj.text) ||
            (typeof obj.value === "string" && obj.value) ||
            null;
          return candidate ? [candidate] : [];
        }
        return [];
      })
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "object") {
    return readQuestionOptions(Object.values(value as Record<string, unknown>));
  }
  return [];
}

function extractApprovalOptions(
  tool: Partial<ToolUIPart> & {
    approval?: unknown;
    input?: unknown;
    output?: unknown;
  },
): string[] {
  const values = [tool.approval, tool.output, tool.input];
  for (const value of values) {
    const prompt = extractQuestionPrompt(value);
    if (prompt?.options.length) return prompt.options;
  }
  return [];
}
