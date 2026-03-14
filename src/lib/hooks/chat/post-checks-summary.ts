import { POST_CHECK_MARKER } from "./constants";
import type { SetMessages } from "./types";
import type { FileDiff } from "./post-checks-diff";

export function formatChangeSteps(
  label: string,
  items: string[],
  prefix: string,
  limit = 8,
) {
  if (items.length === 0) return [];
  const head = items.slice(0, limit).map((item) => `${prefix} ${item}`);
  const suffix = items.length > limit ? [`${label}: +${items.length - limit} till...`] : [];
  return [...head, ...suffix];
}

function isLikelyQuestionOrPrompt(content: string) {
  const lower = content.toLowerCase();
  if (content.includes("?")) return true;
  return [
    "vill du",
    "vill ni",
    "ska vi",
    "ska jag",
    "kan du",
    "kan ni",
    "kan jag",
    "behöver du",
    "behöver ni",
    "vill jag",
    "installera",
    "integrera",
    "supabase",
    "redis",
    "environment variable",
    "miljövariabel",
    "api-nyckel",
    "nyckel",
  ].some((token) => lower.includes(token));
}

function shouldAppendPostCheckSummary(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return true;
  if (isLikelyQuestionOrPrompt(trimmed)) return false;
  if (trimmed.endsWith(":")) return true;
  const tail = trimmed.slice(-160).toLowerCase();
  if (
    ["summera", "sammanfatta", "ändring", "changes", "summary"].some((token) =>
      tail.includes(token),
    )
  ) {
    return true;
  }
  return trimmed.length >= 24;
}

export function buildPostCheckSummary(params: {
  changes: FileDiff | null;
  warnings: string[];
  demoUrl: string | null;
  previewBlockingReason?: string | null;
  provisional?: boolean;
  qualityGatePending?: boolean;
  autoFixQueued?: boolean;
}) {
  const {
    changes,
    warnings,
    demoUrl,
    previewBlockingReason = null,
    provisional = false,
    qualityGatePending = false,
    autoFixQueued = false,
  } = params;
  const lines: string[] = [];

  if (changes) {
    lines.push(
      `${POST_CHECK_MARKER} Ändringar: +${changes.added.length} ~${changes.modified.length} -${changes.removed.length}`,
    );
    lines.push(...formatChangeSteps("Tillagda", changes.added, "+", 4));
    lines.push(...formatChangeSteps("Ändrade", changes.modified, "~", 4));
    lines.push(...formatChangeSteps("Borttagna", changes.removed, "-", 4));
  } else {
    lines.push(`${POST_CHECK_MARKER} Ingen tidigare version att jämföra.`);
  }

  if (!demoUrl) {
    lines.push(
      previewBlockingReason
        ? `Varning: Preview blockerades i preflight. ${previewBlockingReason}`
        : "Varning: Ingen preview-länk hittades för versionen.",
    );
  }

  if (autoFixQueued) {
    lines.push(
      "Obs: Den här versionen är preliminär eftersom autofix redan har köats efter efterkontrollerna.",
    );
  } else if (qualityGatePending) {
    lines.push("Obs: Quality gate körs fortfarande för den här versionen.");
  } else if (provisional) {
    lines.push(
      "Obs: Den här versionen är preliminär medan efterkontroller eller autofix fortfarande arbetar.",
    );
  }

  warnings.forEach((warning) => {
    lines.push(`Varning: ${warning}`);
  });

  return lines.length > 0 ? lines.join("\n") : "";
}

export function appendPostCheckSummaryToMessage(
  setMessages: SetMessages,
  messageId: string,
  summary: string,
) {
  if (!summary) return;
  setMessages((prev) =>
    prev.map((message) => {
      if (message.id !== messageId) return message;
      const content = message.content || "";
      if (content.includes(POST_CHECK_MARKER)) return message;
      if (!shouldAppendPostCheckSummary(content)) return message;
      const separator = content.trim() ? "\n" : "";
      return { ...message, content: `${content}${separator}${summary}`.trimEnd() };
    }),
  );
}
