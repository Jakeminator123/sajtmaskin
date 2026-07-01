import { z } from "zod";
import type { QuickEditOp } from "@/lib/gen/quick-edit";

/**
 * Zod schema for the deterministic quick-edit ops the OpenClaw gateway is asked
 * to produce from a natural-language instruction. Mirrors the contract enforced
 * by POST /api/engine/chats/[chatId]/quick-edit so the ops can be handed
 * straight to `runQuickEdit` without translation. Kept local to the (isolated)
 * edit lib so the whole feature stays trivially removable.
 */
export const openClawQuickEditOpSchema = z.union([
  z.object({
    kind: z.literal("replace_content"),
    path: z.string().min(1),
    content: z.string(),
  }),
  z.object({
    kind: z.literal("replace_text"),
    path: z.string().min(1),
    find: z.string().min(1),
    replace: z.string(),
    occurrence: z.number().int().positive().optional(),
  }),
  z.object({
    kind: z.literal("delete_file"),
    path: z.string().min(1),
  }),
]);

/**
 * The full gateway payload. `ops` may be empty: that is the model's way of
 * declining ("I can't do this with the shown files") and is reported to the
 * caller with the `summary` as the reason — never a silent no-op.
 */
export const openClawEditOpsPayloadSchema = z.object({
  ops: z.array(openClawQuickEditOpSchema).max(50),
  summary: z.string().max(400).optional(),
});

export type ParseOpenClawEditOpsResult =
  | { ok: true; ops: QuickEditOp[]; summary?: string }
  | { ok: false; error: string };

/**
 * Extract the first balanced top-level JSON object from a model completion.
 * The gateway is instructed to return ONLY JSON, but models occasionally wrap
 * it in prose or a ```json fence; this pulls the object out without eval.
 * Returns null when no plausible object is found. String-aware so a `{` or `}`
 * inside a JSON string literal never throws off the brace depth.
 */
export function extractFirstJsonObject(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const start = raw.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Parse + validate a gateway completion into deterministic quick-edit ops.
 * Never guesses: any structural problem is a typed error the route surfaces
 * (instead of silently applying nothing). An empty-but-valid `ops` array is a
 * successful parse; the caller decides how to treat a decline.
 */
export function parseOpenClawEditOps(raw: string): ParseOpenClawEditOpsResult {
  const jsonText = extractFirstJsonObject(raw);
  if (!jsonText) {
    return { ok: false, error: "Gateway returned no JSON object." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "Gateway JSON could not be parsed." };
  }
  const result = openClawEditOpsPayloadSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: `Gateway ops failed validation: ${result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    };
  }
  return {
    ok: true,
    ops: result.data.ops as QuickEditOp[],
    summary: result.data.summary,
  };
}
