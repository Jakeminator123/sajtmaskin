import type { Message } from "@/lib/db/chat-repository-pg";
import type { ContractClarificationQuestion } from "./clarification";
import type { ConfirmedContractAnswer } from "./pre-generation-contracts";

type AwaitingInputOutput = {
  question?: unknown;
  options?: unknown;
  kind?: unknown;
  blocking?: unknown;
  reason?: unknown;
  contractClarification?: unknown;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => asString(entry)).filter(Boolean)
    : [];
}

function readContractClarification(message: Message): ContractClarificationQuestion | null {
  const parts = Array.isArray(message.ui_parts) ? message.ui_parts : [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const type = asString((part as { type?: unknown }).type);
    if (type !== "tool:awaiting-input") continue;
    const output = (part as { output?: AwaitingInputOutput }).output;
    if (!output || output.contractClarification !== true) continue;
    const kind = asString(output.kind);
    if (
      kind !== "integration" &&
      kind !== "env" &&
      kind !== "database" &&
      kind !== "auth" &&
      kind !== "payment" &&
      kind !== "unclear" &&
      kind !== "scope"
    ) {
      continue;
    }
    const question = asString(output.question);
    if (!question) continue;
    return {
      kind,
      question,
      options: asStringArray(output.options),
      blocking: output.blocking !== false,
      reason: asString(output.reason),
    };
  }
  return null;
}

export function collectConfirmedContractAnswers(
  messages: Message[],
  currentReply?: string | null,
): {
  confirmedAnswers: ConfirmedContractAnswer[];
  pendingQuestion: ContractClarificationQuestion | null;
  currentReplyWasConsumed: boolean;
  consumedReplyContext: {
    /**
     * The user request that caused the contract clarification. When the
     * current reply only answers the gate, intent-sensitive follow-up logic
     * must classify this source request instead of the short answer text.
     */
    sourceUserMessage: string;
    question: string;
  } | null;
} {
  const confirmedAnswers: ConfirmedContractAnswer[] = [];
  let pendingQuestion: ContractClarificationQuestion | null = null;
  let pendingQuestionSourceUserMessage: string | null = null;
  let lastUserMessageContent: string | null = null;
  let currentReplyWasConsumed = false;
  let consumedReplyContext: {
    sourceUserMessage: string;
    question: string;
  } | null = null;

  for (const message of messages) {
    if (message.role === "assistant") {
      const clarification = readContractClarification(message);
      if (clarification) {
        pendingQuestion = clarification;
        pendingQuestionSourceUserMessage = lastUserMessageContent;
      }
      continue;
    }

    if (message.role === "user" && pendingQuestion) {
      confirmedAnswers.push({
        kind: pendingQuestion.kind,
        question: pendingQuestion.question,
        answer: message.content.trim(),
        options: pendingQuestion.options,
        blocking: pendingQuestion.blocking,
        reason: pendingQuestion.reason,
      });
      pendingQuestion = null;
      pendingQuestionSourceUserMessage = null;
      lastUserMessageContent = message.content.trim();
      continue;
    }

    if (message.role === "user") {
      lastUserMessageContent = message.content.trim();
    }
  }

  const current = asString(currentReply);
  if (pendingQuestion && current) {
    if (pendingQuestionSourceUserMessage) {
      consumedReplyContext = {
        sourceUserMessage: pendingQuestionSourceUserMessage,
        question: pendingQuestion.question,
      };
    }
    confirmedAnswers.push({
      kind: pendingQuestion.kind,
      question: pendingQuestion.question,
      answer: current,
      options: pendingQuestion.options,
      blocking: pendingQuestion.blocking,
      reason: pendingQuestion.reason,
    });
    pendingQuestion = null;
    pendingQuestionSourceUserMessage = null;
    currentReplyWasConsumed = true;
  }

  return {
    confirmedAnswers,
    pendingQuestion,
    currentReplyWasConsumed,
    consumedReplyContext,
  };
}
