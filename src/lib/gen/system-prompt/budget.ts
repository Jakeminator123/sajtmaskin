/**
 * Dynamic-context block budgeting: split the rendered context into
 * priority-ranked `## heading` blocks so the token-budget pass
 * (`buildBudgetedSystemPrompt`) knows which sections are required and which
 * can be dropped when the budget is tight.
 *
 * Split out of `system-prompt.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import { estimateTokens } from "../tokens";
import type { DynamicContextBlock } from "./types";

export const DEFAULT_DYNAMIC_CONTEXT_BUDGET_TOKENS = 30_000;

const CONTEXT_BLOCK_PRIORITY_RULES: Array<{
  match: RegExp;
  priority: number;
  required?: boolean;
}> = [
  { match: /^generation mode:/i, priority: 100, required: true },
  { match: /^generation stage:/i, priority: 96, required: true },
  { match: /^custom instructions/i, priority: 100, required: true },
  { match: /^build intent:/i, priority: 95, required: true },
  { match: /^brief-locked design values$/i, priority: 94, required: true },
  { match: /^generation profile$/i, priority: 92, required: true },
  { match: /^file surface budget$/i, priority: 91, required: true },
  { match: /^scaffold variant \(this generation\)$/i, priority: 91 },
  { match: /^design priority$/i, priority: 89, required: true },
  { match: /^scaffold$/i, priority: 90, required: true },
  { match: /^scaffold:\s/i, priority: 90, required: true },
  { match: /^layout & theme files/i, priority: 85 },
  { match: /^import reference/i, priority: 75 },
  { match: /^route plan$/i, priority: 90, required: true },
  { match: /^scaffold-default files$/i, priority: 90, required: true },
  { match: /^required imports checklist$/i, priority: 83 },
  { match: /^your toolkit$/i, priority: 85, required: true },
  { match: /^available dossiers$/i, priority: 87 },
  { match: /^selected dossier instructions$/i, priority: 84 },
  // AI-SDK v4-drift guardrail (Task 5a): only rendered when an AI dossier
  // (ai-chat / ai-tool-calling / rag-chat) is selected, and then it MUST
  // survive budget pruning — dropping it under a tight budget silently
  // reintroduces the CoreMessage/maxSteps/textDelta build breaks it exists
  // to prevent.
  { match: /^ai sdk version contract/i, priority: 88, required: true },
  { match: /^dossier files to emit verbatim$/i, priority: 92, required: true },
  { match: /^pre-generation contracts$/i, priority: 90, required: true },
  { match: /^project context$/i, priority: 88, required: true },
  { match: /^pages & sections$/i, priority: 82 },
  { match: /^media catalog$/i, priority: 80 },
  { match: /^visual identity$/i, priority: 78 },
  { match: /^design references$/i, priority: 72 },
  { match: /^ui recipes$/i, priority: 80 },
  { match: /^component references$/i, priority: 80 },
  { match: /^critical scaffold files$/i, priority: 86, required: true },
  { match: /^scaffold file tree$/i, priority: 84, required: true },
  { match: /^scaffold research priorities$/i, priority: 70 },
  { match: /^domain inference$/i, priority: 77 },
  { match: /^structure hints$/i, priority: 76 },
  { match: /^contract.*backend.*hints$/i, priority: 75 },
  { match: /^coding direction$/i, priority: 76 },
  { match: /^color system$/i, priority: 73 },
  { match: /^art direction/i, priority: 73 },
  { match: /^typography/i, priority: 72 },
  { match: /^visual polish$/i, priority: 71 },
  { match: /^charts$/i, priority: 65 },
  { match: /^interaction.+motion$/i, priority: 68 },
  { match: /^quality bar$/i, priority: 74 },
  { match: /^component palette$/i, priority: 72 },
  { match: /^spec file$/i, priority: 78 },
  { match: /^current project files$/i, priority: 80 },
  { match: /^imagery/i, priority: 66 },
  { match: /^seo$/i, priority: 62 },
];

function normalizeContextBlockKey(title: string, index: number): string {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || `context_block_${index + 1}`;
}

function resolveContextBlockPriority(title: string): { priority: number; required: boolean } {
  for (const rule of CONTEXT_BLOCK_PRIORITY_RULES) {
    if (rule.match.test(title)) {
      return {
        priority: rule.priority,
        required: Boolean(rule.required),
      };
    }
  }
  return { priority: 60, required: false };
}

export function splitContextIntoBudgetBlocks(context: string): DynamicContextBlock[] {
  if (!context.trim()) return [];

  const blocks: Array<{ title: string; content: string }> = [];
  const lines = context.split("\n");
  let currentTitle = "preamble";
  let currentLines: string[] = [];

  const flush = () => {
    const content = currentLines.join("\n").trim();
    if (!content) return;
    blocks.push({ title: currentTitle, content });
  };

  for (const line of lines) {
    const headingMatch = /^##\s+(.+)$/.exec(line);
    if (headingMatch) {
      flush();
      currentTitle = headingMatch[1].trim();
      currentLines = [line];
      continue;
    }
    currentLines.push(line);
  }
  flush();

  const duplicateCounts = new Map<string, number>();

  return blocks.map((block, index) => {
    const { priority, required } = resolveContextBlockPriority(block.title);
    const baseKey = normalizeContextBlockKey(block.title, index);
    const seen = duplicateCounts.get(baseKey) ?? 0;
    duplicateCounts.set(baseKey, seen + 1);
    const key = seen === 0 ? baseKey : `${baseKey}_${seen + 1}`;
    return {
      key,
      text: block.content,
      title: block.title,
      priority,
      required,
      estimatedTokens: estimateTokens(block.content),
    };
  });
}
