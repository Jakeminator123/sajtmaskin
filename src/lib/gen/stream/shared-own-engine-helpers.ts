import {
  detectIntegrations,
  type DetectedIntegration,
} from "@/lib/gen/detect-integrations";

import {
  EmptyGenerationError,
  finalizeAndSaveVersion,
  type FinalizeParams,
  type FinalizeResult,
} from "./finalize-version";

export function appendPreview(current: string, incoming: string, max = 320): string {
  if (!incoming) return current;
  const next = `${current}${incoming}`;
  return next.length > max ? next.slice(-max) : next;
}

export function looksLikeIncompleteJson(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  if (!(text.startsWith("{") || text.startsWith("[") || text.startsWith('"'))) return false;
  const openCurly = (text.match(/\{/g) || []).length;
  const closeCurly = (text.match(/\}/g) || []).length;
  const openSquare = (text.match(/\[/g) || []).length;
  const closeSquare = (text.match(/\]/g) || []).length;
  if (openCurly > closeCurly) return true;
  if (openSquare > closeSquare) return true;
  if (/\\$/.test(text)) return true;
  return false;
}

export function extractToolNames(parts: Array<Record<string, unknown>>): string[] {
  const names: string[] = [];
  for (const part of parts) {
    const type = typeof part.type === "string" ? part.type : "";
    if (!type.startsWith("tool")) continue;
    const name =
      (typeof part.toolName === "string" && part.toolName) ||
      (typeof part.name === "string" && part.name) ||
      (typeof part.type === "string" && part.type) ||
      "tool-call";
    names.push(name);
  }
  return Array.from(new Set(names));
}

export function getUnsignaledDetectedIntegrations(
  code: string,
  toolSignaledProviders: Set<string>,
): DetectedIntegration[] {
  return detectIntegrations(code).filter((item) => !toolSignaledProviders.has(item.key));
}

export interface FinalizeOrHandleEmptyGenerationParams {
  finalizeParams: FinalizeParams;
  emptyGenerationReason: string;
  handleEmptyGeneration: (
    reason: string,
    error: EmptyGenerationError,
  ) => Promise<void>;
}

export async function finalizeOrHandleEmptyGeneration({
  finalizeParams,
  emptyGenerationReason,
  handleEmptyGeneration,
}: FinalizeOrHandleEmptyGenerationParams): Promise<FinalizeResult | null> {
  try {
    return await finalizeAndSaveVersion(finalizeParams);
  } catch (error) {
    if (error instanceof EmptyGenerationError) {
      await handleEmptyGeneration(emptyGenerationReason, error);
      return null;
    }
    throw error;
  }
}
