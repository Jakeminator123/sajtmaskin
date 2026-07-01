import { OPENCLAW } from "@/lib/config";
import type { CodeFile } from "@/lib/gen/parser";
import type { QuickEditOp } from "@/lib/gen/quick-edit";
import { buildEditOpsPrompt } from "./prompt";
import { parseOpenClawEditOps } from "./ops-schema";

export type RequestEditOpsResult =
  | {
      ok: true;
      ops: QuickEditOp[];
      summary?: string;
      includedPaths: string[];
      truncated: boolean;
    }
  | { ok: false; error: string; status?: number };

const GATEWAY_TIMEOUT_MS = 60_000;

/**
 * Extract the assistant text from an OpenAI-compatible (non-streamed) chat
 * completion, tolerating both `message.content` and legacy `text`.
 */
function extractCompletionText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as { message?: { content?: unknown }; text?: unknown };
  const content = first?.message?.content ?? first?.text;
  return typeof content === "string" ? content : null;
}

/**
 * Server-side LLM step: ask the OpenClaw gateway to translate a natural-language
 * instruction into deterministic quick-edit ops, given the exact current files.
 * The gateway is OpenAI-compatible; we request a NON-streamed completion and
 * parse strict JSON. No DB writes and no persistence here — the caller feeds the
 * ops to `runQuickEdit`, which owns all persistence + preview patching.
 */
export async function requestQuickEditOps(params: {
  instruction: string;
  files: CodeFile[];
  maxFileChars?: number;
  signal?: AbortSignal;
}): Promise<RequestEditOpsResult> {
  const gatewayUrl = OPENCLAW.gatewayUrl;
  const gatewayToken = OPENCLAW.gatewayToken;
  if (!gatewayUrl) {
    return { ok: false, error: "OpenClaw gateway is not configured." };
  }

  const prompt = buildEditOpsPrompt({
    instruction: params.instruction,
    files: params.files,
    maxFileChars: params.maxFileChars,
  });

  let res: Response;
  try {
    res = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(gatewayToken ? { Authorization: `Bearer ${gatewayToken}` } : {}),
      },
      body: JSON.stringify({
        model: "openclaw:sajtagenten",
        stream: false,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      }),
      signal: params.signal ?? AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });
  } catch (e) {
    return {
      ok: false,
      error: `Gateway unreachable: ${e instanceof Error ? e.message : "unknown"}`,
    };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return {
      ok: false,
      status: res.status,
      error: `Gateway error ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, error: "Gateway returned a non-JSON response." };
  }

  const content = extractCompletionText(payload);
  if (!content) {
    return { ok: false, error: "Gateway returned an empty completion." };
  }

  const parsed = parseOpenClawEditOps(content);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  if (parsed.ops.length === 0) {
    // The model declined: surface its stated reason rather than a silent no-op.
    return {
      ok: false,
      error: parsed.summary?.trim() || "Ingen ändring kunde härledas ur prompten.",
    };
  }

  return {
    ok: true,
    ops: parsed.ops,
    summary: parsed.summary,
    includedPaths: prompt.includedPaths,
    truncated: prompt.truncated,
  };
}
