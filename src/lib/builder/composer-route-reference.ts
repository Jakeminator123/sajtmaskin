import type { OpenClawBuilderTarget } from "@/lib/openclaw/builder-target";
import type { OpenClawMessage } from "@/lib/openclaw/openclaw-store";
import {
  AGENT_INTERNAL_TURN_PREFIXES,
  classifyAgentMessage,
} from "@/lib/openclaw/agent-message-kind";
import { uWordRegex } from "@/lib/utils/unicode-word-boundary";
import { isSingleAgentProposalReference } from "./composer-route";

export type AgentProposalReference = {
  agentMessageId: string;
  selectedPart: string;
  instruction: string;
  builderTarget: { chatId: string; versionId: string };
};

type ProposalResolution =
  { kind: "resolved"; reference: AgentProposalReference } | { kind: "clarify"; message: string };

const NUMBER_WORDS: Readonly<Record<string, string>> = {
  ett: "1",
  en: "1",
  två: "2",
  tva: "2",
  tre: "3",
  fyra: "4",
  fem: "5",
  sex: "6",
  sju: "7",
  åtta: "8",
  atta: "8",
  nio: "9",
  tio: "10",
};

const SELECTED_POINT = uWordRegex(
  "(?:punkt(?:en)?|förslag(?:et)?|forslag(?:et)?|alternativ(?:et)?|suggestion|proposal|item|point) (?:nummer )?([0-9]+|ett|en|två|tva|tre|fyra|fem|sex|sju|åtta|atta|nio|tio)",
  "giu",
);

function pointNumber(value: string): string | null {
  const word = NUMBER_WORDS[value.toLowerCase()];
  if (word) return word;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? String(number) : null;
}

type NumberedPoint = { number: string | null; text: string };

/** Preserve the selected wording; fenced-code numbers and nested lists are not choices. */
function numberedPoints(content: string): NumberedPoint[] {
  const lines = content.split("\n");
  const markers: { line: number; indent: number; number: string | null; body: string }[] = [];
  let fence: string | null = null;
  for (let line = 0; line < lines.length; line++) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/u.exec(lines[line]);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const match = /^([ \t]*)(?:\*\*)?([0-9]+)[.)](?:\*\*)?[ \t]+([^\n]*)$/u.exec(lines[line]);
    if (match)
      markers.push({
        line,
        indent: match[1].length,
        number: pointNumber(match[2]),
        body: match[3],
      });
  }
  if (!markers.length) return [];
  const indent = Math.min(...markers.map((marker) => marker.indent));
  const topLevel = markers.filter((marker) => marker.indent === indent);
  return topLevel.map((marker, index) => {
    const end = topLevel[index + 1]?.line ?? lines.length;
    // Never shorten a point at a blank line: later paragraphs may contain constraints.
    const continuation = lines.slice(marker.line + 1, end);
    return { number: marker.number, text: [marker.body, ...continuation].join("\n").trim() };
  });
}

function isChatRecommendation(message: OpenClawMessage): boolean {
  return (
    message.role === "assistant" &&
    classifyAgentMessage(message) === "chat" &&
    !AGENT_INTERNAL_TURN_PREFIXES.some((prefix) =>
      message.content.trimStart().startsWith(prefix),
    ) &&
    message.delivery !== "streaming" &&
    message.delivery !== "interrupted" &&
    // Even malformed/incomplete actions and quoted tool payloads cannot supply advice.
    !/<\/?(?:openclaw-action|tool(?:_call|_result)?|function_call|function_result)(?:[\s>])/iu.test(
      message.content,
    )
  );
}

/** Resolve advice only; the result carries no permission to execute a build. */
export function resolveAgentProposalReference(input: {
  text: string;
  messages: readonly OpenClawMessage[];
  target: OpenClawBuilderTarget | null;
}): ProposalResolution {
  const clarify = (message: string): ProposalResolution => ({ kind: "clarify", message });
  if (!input.target?.chatId.trim() || !input.target.versionId.trim()) {
    return clarify("Öppna den chatt och version som förslaget gäller först.");
  }
  const selections = [...input.text.replace(/\s+/gu, " ").matchAll(SELECTED_POINT)];
  if (!isSingleAgentProposalReference(input.text) || selections.length !== 1) {
    return clarify("Ange exakt en numrerad punkt från Sajtagentens senaste förslag.");
  }
  const selectedPart = pointNumber(selections[0][1]);
  if (!selectedPart) return clarify("Ange ett giltigt punktnummer från förslaget.");

  for (let index = input.messages.length - 1; index >= 0; index--) {
    const source = input.messages[index];
    if (!isChatRecommendation(source)) continue;
    const points = numberedPoints(source.content);
    if (!points.length) continue;
    // Select the latest advice before checking its target: stale advice never falls back.
    if (
      source.builderTarget?.chatId !== input.target.chatId ||
      source.builderTarget.versionId !== input.target.versionId
    )
      return clarify(
        "Det senaste förslaget gäller en annan chatt eller version. Be om ett nytt förslag.",
      );
    const matches = points.filter((point) => point.number === selectedPart);
    if (matches.length !== 1) {
      return clarify(
        "Punkten saknas eller är tvetydig i det senaste förslaget. Be om ett tydligare förslag.",
      );
    }
    const instruction = matches[0].text;
    if (!source.id.trim() || !instruction || instruction.length > 4000) {
      return clarify("Punkten är tom eller för lång. Be om en kortare, komplett instruktion.");
    }
    return {
      kind: "resolved",
      reference: {
        agentMessageId: source.id,
        selectedPart,
        instruction,
        builderTarget: { ...input.target },
      },
    };
  }
  return clarify("Jag hittar inget numrerat förslag. Be Sajtagenten om tydliga punkter först.");
}
