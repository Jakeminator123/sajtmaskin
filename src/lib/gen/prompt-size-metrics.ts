import { estimateTokens } from "./tokens";
import {
  SYSTEM_PROMPT_SEPARATOR,
  getSystemPromptLengths,
  type DynamicContextBlockTrace,
  type DynamicContextPruning,
} from "./system-prompt";

export interface PromptSizePartMetric {
  chars: number;
  estimatedTokens: number;
}

export interface PromptSizeBlockMetric extends PromptSizePartMetric {
  key: string;
  title: string;
  priority: number;
  required: boolean;
  kept: boolean;
}

export interface PromptSizeMetrics {
  total: PromptSizePartMetric;
  staticCore: PromptSizePartMetric;
  separator: PromptSizePartMetric;
  dynamicContext: PromptSizePartMetric;
  dynamicBudget: {
    budgetTokens: number;
    usedTokens: number;
    keptBlocks: number;
    droppedBlocks: number;
    droppedBlockKeys: string[];
  };
  blocks: {
    total: number;
    kept: number;
    dropped: number;
    largest: PromptSizeBlockMetric[];
  };
}

const LARGEST_BLOCK_LIMIT = 10;

function part(chars: number): PromptSizePartMetric {
  return {
    chars,
    estimatedTokens: estimateTokens("x".repeat(Math.max(0, chars))),
  };
}

export function buildPromptSizeMetrics(params: {
  engineSystemPrompt: string;
  dynamicContext: string;
  dynamicContextPruning: DynamicContextPruning;
  dynamicContextBlocks: DynamicContextBlockTrace[];
}): PromptSizeMetrics {
  const lengths = getSystemPromptLengths(params.engineSystemPrompt);
  const keptBlocks = params.dynamicContextBlocks.filter((block) => block.kept).length;
  const droppedBlocks = params.dynamicContextBlocks.length - keptBlocks;
  const largest = [...params.dynamicContextBlocks]
    .sort((a, b) => {
      if (b.chars !== a.chars) return b.chars - a.chars;
      return b.estimatedTokens - a.estimatedTokens;
    })
    .slice(0, LARGEST_BLOCK_LIMIT)
    .map((block) => ({
      key: block.key,
      title: block.title,
      priority: block.priority,
      required: block.required,
      kept: block.kept,
      chars: block.chars,
      estimatedTokens: block.estimatedTokens,
    }));

  return {
    total: part(lengths.total),
    staticCore: part(lengths.static),
    separator: part(SYSTEM_PROMPT_SEPARATOR.length),
    dynamicContext: {
      chars: params.dynamicContext.length,
      estimatedTokens: estimateTokens(params.dynamicContext),
    },
    dynamicBudget: {
      budgetTokens: params.dynamicContextPruning.budgetTokens,
      usedTokens: params.dynamicContextPruning.usedTokens,
      keptBlocks,
      droppedBlocks,
      droppedBlockKeys: params.dynamicContextPruning.droppedBlockKeys,
    },
    blocks: {
      total: params.dynamicContextBlocks.length,
      kept: keptBlocks,
      dropped: droppedBlocks,
      largest,
    },
  };
}
