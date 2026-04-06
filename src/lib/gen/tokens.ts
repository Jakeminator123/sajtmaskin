export interface PromptBudgetBlock {
  key: string;
  text: string;
  priority: number;
  required?: boolean;
}

export interface BudgetedSystemPromptResult {
  systemPrompt: string;
  dynamicContext: string;
  droppedKeys: string[];
  keptKeys: string[];
  usedTokens: number;
  budgetTokens: number;
}

/**
 * Heuristic used to keep prompt budgeting deterministic without a model-specific tokenizer.
 * We can swap this for exact tokenization later without changing call-sites.
 */
const CHARS_PER_TOKEN_ESTIMATE = 3.2;
const MIN_TRUNCATED_BLOCK_TOKENS = 80;

export function estimateTokens(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / CHARS_PER_TOKEN_ESTIMATE));
}

export function estimateCharsForTokens(tokenCount: number): number {
  return Math.max(0, Math.ceil(tokenCount * CHARS_PER_TOKEN_ESTIMATE));
}

function truncateToTokenBudget(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return "";
  const maxChars = estimateCharsForTokens(maxTokens);
  if (text.length <= maxChars) return text;

  let truncated = text.slice(0, maxChars);
  const candidateBreak = Math.max(
    truncated.lastIndexOf("\n\n"),
    truncated.lastIndexOf("\n"),
    truncated.lastIndexOf(". "),
  );
  if (candidateBreak > maxChars * 0.65) {
    truncated = truncated.slice(0, candidateBreak);
  }

  return `${truncated.trimEnd()}\n\n_(Section truncated to fit token budget.)_`;
}

/**
 * Builds a system prompt from a static core + prioritized dynamic blocks.
 * Lower-priority blocks are dropped first when we exceed the dynamic token budget.
 */
export function buildBudgetedSystemPrompt(options: {
  staticCore: string;
  dynamicBlocks: PromptBudgetBlock[];
  dynamicBudgetTokens: number;
  separator?: string;
}): BudgetedSystemPromptResult {
  const separator = options.separator ?? "\n\n---\n\n";
  const budgetTokens = Math.max(0, Math.floor(options.dynamicBudgetTokens));

  const blocks = options.dynamicBlocks
    .map((block, index) => ({
      ...block,
      index,
      text: block.text.trim(),
    }))
    .filter((block) => block.text.length > 0);

  if (blocks.length === 0) {
    return {
      systemPrompt: options.staticCore,
      dynamicContext: "",
      droppedKeys: [],
      keptKeys: [],
      usedTokens: 0,
      budgetTokens,
    };
  }

  const sortedByPriority = [...blocks].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.index - b.index;
  });

  let remainingTokens = budgetTokens;
  const keptContentByIndex = new Map<number, string>();
  const keptKeys: string[] = [];

  for (const block of sortedByPriority) {
    const tokenCost = estimateTokens(block.text);

    if (tokenCost <= remainingTokens) {
      keptContentByIndex.set(block.index, block.text);
      keptKeys.push(block.key);
      remainingTokens -= tokenCost;
      continue;
    }

    if (block.required && remainingTokens >= MIN_TRUNCATED_BLOCK_TOKENS) {
      const truncated = truncateToTokenBudget(block.text, remainingTokens);
      if (truncated) {
        keptContentByIndex.set(block.index, truncated);
        keptKeys.push(block.key);
        remainingTokens = 0;
      }
    }
  }

  if (keptContentByIndex.size === 0 && budgetTokens > 0) {
    const fallbackBlock = sortedByPriority[0];
    const fallbackText = truncateToTokenBudget(fallbackBlock.text, budgetTokens);
    if (fallbackText) {
      keptContentByIndex.set(fallbackBlock.index, fallbackText);
      keptKeys.push(fallbackBlock.key);
    }
  }

  const dynamicContext = blocks
    .filter((block) => keptContentByIndex.has(block.index))
    .map((block) => keptContentByIndex.get(block.index) ?? "")
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const droppedKeys = blocks
    .filter((block) => !keptContentByIndex.has(block.index))
    .map((block) => block.key);

  const usedTokens = estimateTokens(dynamicContext);
  const staticCore = options.staticCore.trim();
  const systemPrompt =
    staticCore && dynamicContext
      ? `${staticCore}${separator}${dynamicContext}`
      : staticCore || dynamicContext;

  return {
    systemPrompt,
    dynamicContext,
    droppedKeys,
    keptKeys,
    usedTokens,
    budgetTokens,
  };
}
