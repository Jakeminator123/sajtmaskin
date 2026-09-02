import type { BuildMethod } from "@/lib/builder/build-intent";

/**
 * Auto-start only the packaged kostnadsfri handoff (`promptId`).
 * A raw `?prompt=` query is attacker-controlled on a top-level GET
 * (SameSite=Lax sends the session cookie) and must not spend credits.
 */
export function canAutoStartKostnadsfriGeneration(input: {
  isAuthenticated: boolean;
  templateId: string | null;
  buildMethod: BuildMethod | null;
  resolvedPrompt: string | null;
  chatId: string | null;
  promptId: string | null;
  promptParam: string | null;
}): boolean {
  if (!input.isAuthenticated) return false;
  if (input.templateId) return false;
  if (input.buildMethod !== "kostnadsfri") return false;
  if (!input.resolvedPrompt?.trim()) return false;
  if (input.chatId) return false;
  if (!input.promptId?.trim()) return false;
  if (input.promptParam?.trim()) return false;
  return true;
}
