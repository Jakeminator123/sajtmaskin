import type { MessageOptions } from "./types";

function normalizePrompt(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/** Extra fields so two distinct create jobs never share the same sessionStorage dedupe key. */
export type CreateChatKeyJobFields = {
  scaffoldMode?: string | null;
  scaffoldId?: string | null;
  buildMethod?: string | null;
  buildIntent?: string | null;
  planMode?: boolean;
  promptAssistMode?: string | null;
  promptAssistModel?: string | null;
  promptAssistDeep?: boolean;
  /** Serialized palette / theme snapshot (caller passes stable JSON-able value). */
  paletteState?: unknown;
  /** Byggval: structured page-count hint — distinct hints are distinct jobs. */
  pageCountHint?: number | null;
  /** Byggval: structured style keywords — distinct hints are distinct jobs. */
  styleKeywordsHint?: string[] | null;
};

function stablePaletteFingerprint(paletteState: unknown): string {
  if (paletteState === undefined || paletteState === null) return "";
  try {
    return JSON.stringify(paletteState);
  } catch {
    return String(paletteState);
  }
}

export function buildCreateChatKey(
  message: string,
  options: MessageOptions,
  modelId: string,
  imageGenerations: boolean,
  systemPrompt?: string,
  job?: CreateChatKeyJobFields,
): string {
  const normalizedMessage = normalizePrompt(message);
  const normalizedSystem = normalizePrompt(systemPrompt ?? "");
  const attachmentSignature = (options.attachments ?? [])
    .map((attachment) => {
      const url = typeof attachment.url === "string" ? attachment.url.trim() : "";
      const filename = typeof attachment.filename === "string" ? attachment.filename.trim() : "";
      return url || filename || "";
    })
    .filter((value) => value.length > 0)
    .map((value) => encodeURIComponent(value))
    .join("|");
  const attachmentPrompt = normalizePrompt(options.attachmentPrompt ?? "");
  const planMode = job?.planMode ?? options.planMode ?? false;
  const fingerprint = [
    normalizedMessage,
    `model:${modelId}`,
    `images:${imageGenerations ? "1" : "0"}`,
    `system:${normalizedSystem}`,
    `attachments:${attachmentSignature}`,
    `attachmentPrompt:${attachmentPrompt}`,
    `scaffoldMode:${job?.scaffoldMode ?? ""}`,
    `scaffoldId:${job?.scaffoldId ?? ""}`,
    `buildMethod:${job?.buildMethod ?? ""}`,
    `buildIntent:${job?.buildIntent ?? ""}`,
    `planMode:${planMode ? "1" : "0"}`,
    `promptAssistMode:${job?.promptAssistMode ?? ""}`,
    `promptAssistModel:${job?.promptAssistModel ?? ""}`,
    `promptAssistDeep:${job?.promptAssistDeep ? "1" : "0"}`,
    `palette:${stablePaletteFingerprint(job?.paletteState)}`,
    `pageCountHint:${job?.pageCountHint ?? ""}`,
    `styleKeywordsHint:${(job?.styleKeywordsHint ?? []).join("|")}`,
  ].join("::");
  return hashString(fingerprint);
}
