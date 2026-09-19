/**
 * Readers for the OpenAI-compatible responses that the OpenClaw gateway
 * returns — both the SSE stream behind `/api/openclaw/chat` and the single
 * JSON body behind `/api/did/chat`.
 *
 * The gateway answers HTTP 200 with a well-formed stream even when every model
 * in the fallback chain failed; the only payload is then an `error` envelope
 * instead of assistant deltas. A caller that reads `choices[0].delta.content`
 * and nothing else therefore cannot tell a provider quota wall apart from a
 * genuinely silent model, and both surface to the user as an empty bubble.
 */

export type GatewayErrorKind = "rate_limit" | "auth" | "unknown";

export interface GatewayErrorDescription {
  kind: GatewayErrorKind;
  /** Short Swedish sentence safe to show an end user. */
  message: string;
  /**
   * Bounded upstream text, for SERVER-SIDE LOGGING ONLY — never render it to a
   * user. Provider diagnostics routinely name internal models, subscriptions
   * and accounts, which both leaks infrastructure and breaks the assistant's
   * own rule about never mentioning it. Empty when upstream said nothing.
   */
  detail: string;
}

export type GatewayStreamEvent =
  | { type: "delta"; text: string }
  | { type: "error"; description: GatewayErrorDescription };

/**
 * Which assistant-content shapes a stream actually carried. Logged after the
 * stream ends so a silent 200 can be split into: empty model output, a
 * leftover SSE fragment, a skipped array/message payload, or reasoning-only.
 */
export type GatewayContentForm =
  | "delta_string"
  | "delta_array"
  | "message_string"
  | "message_array"
  | "reasoning";

export interface GatewayStreamSummary {
  /** True when the byte stream closed or the parser saw `[DONE]`. */
  ended: boolean;
  sawDoneMarker: boolean;
  /**
   * Bytes left in the SSE buffer when the stream closed, recorded *before*
   * the flush. After the transport fix those bytes are parsed; the count
   * still tells us the last line arrived without a trailing newline.
   */
  leftoverChars: number;
  contentForms: GatewayContentForm[];
  errorKind: GatewayErrorKind | null;
}

export interface OpenClawChatStreamEndLog {
  accumulatedChars: number;
  visibleChars: number;
  hasIncompleteAction: boolean;
  leftoverChars: number;
  ended: boolean;
  sawDone: boolean;
  aborted: boolean;
  contentForms: readonly GatewayContentForm[];
  errorKind: GatewayErrorKind | null;
  /** Raw accumulated text — only a masked prefix is logged. */
  prefix: string;
}

const MAX_DETAIL_CHARS = 400;
const STREAM_PREFIX_CHARS = 40;

/** Terminal empty-state when a finished stream has nothing visible to show. */
export const OPENCLAW_EMPTY_REPLY_COPY = "Sajtagenten skickade inget synligt svar.";

const FRIENDLY_MESSAGE: Record<GatewayErrorKind, string> = {
  rate_limit:
    "Sajtagenten har tillfälligt slut på kapacitet hos sin modelleverantör. Försök igen om en stund.",
  auth: "Sajtagenten kunde inte autentisera mot sin modelleverantör. Det behöver åtgärdas i gatewayen.",
  unknown: "Sajtagenten kunde inte slutföra svaret.",
};

interface ErrorEnvelope {
  message: string;
  /** `type` and `code` joined, so classification can look at both. */
  labels: string;
}

function readErrorEnvelope(payload: unknown): ErrorEnvelope | null {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: unknown }).error;
  if (!error) return null;
  if (typeof error === "string") {
    return { message: error, labels: "" };
  }
  if (typeof error !== "object") return null;

  const message = (error as { message?: unknown }).message;
  const type = (error as { type?: unknown }).type;
  const code = (error as { code?: unknown }).code;

  return {
    message: typeof message === "string" ? message : "",
    labels: [
      typeof type === "string" ? type : "",
      typeof code === "string" ? code : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

function classify(envelope: ErrorEnvelope): GatewayErrorKind {
  const haystack = `${envelope.labels} ${envelope.message}`.toLowerCase();
  if (/rate.?limit|usage limit|quota|too many requests|\b429\b/.test(haystack)) {
    return "rate_limit";
  }
  if (
    /unauthor|forbidden|invalid api key|no api key|authenticat|credential|\b401\b|\b403\b/.test(
      haystack,
    )
  ) {
    return "auth";
  }
  return "unknown";
}

/**
 * Pull a user-facing description out of an OpenAI-compatible error envelope.
 * Returns null for anything that is not an error, so it is safe to run over
 * every chunk of a stream.
 */
export function describeGatewayError(
  payload: unknown,
): GatewayErrorDescription | null {
  const envelope = readErrorEnvelope(payload);
  if (!envelope) return null;

  const kind = classify(envelope);
  return {
    kind,
    message: FRIENDLY_MESSAGE[kind],
    detail: envelope.message.replace(/\s+/g, " ").trim().slice(0, MAX_DETAIL_CHARS),
  };
}

function readContentParts(
  value: unknown,
): { text: string; form: "string" | "array" } | null {
  if (typeof value === "string") return { text: value, form: "string" };
  if (!Array.isArray(value)) return null;

  const text = value
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const maybeText = (part as { text?: unknown }).text;
      return typeof maybeText === "string" ? maybeText : "";
    })
    .join("");
  return { text, form: "array" };
}

function hasReasoningField(choice: object): boolean {
  const delta = (choice as { delta?: Record<string, unknown> }).delta;
  const message = (choice as { message?: Record<string, unknown> }).message;
  const keys = ["reasoning", "reasoning_content", "reasoning_text"];
  for (const obj of [delta, message]) {
    if (!obj) continue;
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === "string" && value.length > 0) return true;
      if (Array.isArray(value) && value.length > 0) return true;
    }
  }
  return false;
}

/**
 * Same content shapes as `extractAssistantText` in `/api/did/chat`, plus the
 * streaming `delta.content` twin. Reasoning is recorded but never yielded —
 * it is not assistant-visible text.
 */
export function extractGatewayAssistantText(payload: unknown): {
  text: string;
  forms: GatewayContentForm[];
} {
  if (!payload || typeof payload !== "object") return { text: "", forms: [] };
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return { text: "", forms: [] };

  const first = choices[0];
  if (!first || typeof first !== "object") return { text: "", forms: [] };

  const forms: GatewayContentForm[] = [];
  const deltaContent = readContentParts(
    (first as { delta?: { content?: unknown } }).delta?.content,
  );
  const messageContent = readContentParts(
    (first as { message?: { content?: unknown } }).message?.content,
  );

  if (deltaContent) {
    forms.push(deltaContent.form === "string" ? "delta_string" : "delta_array");
  }
  if (messageContent) {
    forms.push(messageContent.form === "string" ? "message_string" : "message_array");
  }
  if (hasReasoningField(first)) forms.push("reasoning");

  // Prefer the streaming delta when both exist so a final `message` echo
  // cannot double the last token.
  const text = deltaContent ? deltaContent.text : (messageContent?.text ?? "");
  return { text, forms };
}

/**
 * Collapse whitespace, drop long token-like runs, then keep a short prefix.
 * Safe for client logs — never a full prompt, secret or raw stream body.
 */
export function maskOpenClawLogPrefix(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[A-Za-z0-9+/=_-]{24,}/g, "…")
    .slice(0, STREAM_PREFIX_CHARS);
}

/**
 * One `[openclaw/chat]` line after the stream settles. The fields are the
 * machine-readable split between empty, truncated, hung and aborted.
 */
export function formatOpenClawChatStreamEndLog(input: OpenClawChatStreamEndLog): string {
  const forms = input.contentForms.length > 0 ? input.contentForms.join(",") : "none";
  return (
    `[openclaw/chat] stream-end` +
    ` accumulatedChars=${input.accumulatedChars}` +
    ` visibleChars=${input.visibleChars}` +
    ` hasIncompleteAction=${input.hasIncompleteAction}` +
    ` leftoverChars=${input.leftoverChars}` +
    ` ended=${input.ended}` +
    ` sawDone=${input.sawDone}` +
    ` aborted=${input.aborted}` +
    ` contentForms=${forms}` +
    ` errorKind=${input.errorKind ?? "none"}` +
    ` prefix=${maskOpenClawLogPrefix(input.prefix)}`
  );
}

export function logOpenClawChatStreamEnd(input: OpenClawChatStreamEndLog): void {
  console.info(formatOpenClawChatStreamEndLog(input));
}

type SseLineResult =
  | { kind: "skip" }
  | { kind: "done" }
  | { kind: "error"; description: GatewayErrorDescription }
  | { kind: "delta"; text: string };

function interpretSseLine(
  line: string,
  forms: Set<GatewayContentForm>,
): SseLineResult {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith("data:")) return { kind: "skip" };

  const payload = trimmed.slice(5).trim();
  if (payload === "[DONE]") return { kind: "done" };

  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    return { kind: "skip" };
  }

  const gatewayError = describeGatewayError(json);
  if (gatewayError) {
    return { kind: "error", description: gatewayError };
  }

  const extracted = extractGatewayAssistantText(json);
  for (const form of extracted.forms) forms.add(form);
  if (extracted.text) return { kind: "delta", text: extracted.text };
  return { kind: "skip" };
}

/**
 * Parse an OpenAI-compatible SSE stream into content deltas, stopping at the
 * first error envelope. Malformed chunks are skipped, as before — but an
 * `error` chunk is a deliberate upstream signal and is reported, not dropped.
 *
 * The generator's return value is a summary for the end-of-stream log: leftover
 * buffer size (measured before flush), whether the byte stream actually ended,
 * and which content shapes were seen.
 */
export async function* parseGatewayStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<GatewayStreamEvent, GatewayStreamSummary> {
  const decoder = new TextDecoder();
  let buffer = "";
  let ended = false;
  let sawDoneMarker = false;
  let leftoverChars = 0;
  let errorKind: GatewayErrorKind | null = null;
  const contentForms = new Set<GatewayContentForm>();
  let stop = false;

  const finish = (): GatewayStreamSummary => ({
    ended,
    sawDoneMarker,
    leftoverChars,
    contentForms: [...contentForms],
    errorKind,
  });

  while (!stop) {
    const { done, value } = await reader.read();
    if (done) {
      ended = true;
      buffer += decoder.decode();
      leftoverChars = buffer.length;
      if (buffer.trim()) {
        const result = interpretSseLine(buffer, contentForms);
        if (result.kind === "done") {
          sawDoneMarker = true;
        } else if (result.kind === "error") {
          errorKind = result.description.kind;
          yield { type: "error", description: result.description };
        } else if (result.kind === "delta") {
          yield { type: "delta", text: result.text };
        }
      }
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const result = interpretSseLine(line, contentForms);
      if (result.kind === "done") {
        sawDoneMarker = true;
        ended = true;
        leftoverChars = buffer.length;
        stop = true;
        break;
      }
      if (result.kind === "error") {
        errorKind = result.description.kind;
        leftoverChars = buffer.length;
        yield { type: "error", description: result.description };
        stop = true;
        break;
      }
      if (result.kind === "delta") {
        yield { type: "delta", text: result.text };
      }
    }
  }

  return finish();
}

export async function consumeGatewayStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: GatewayStreamEvent) => void,
): Promise<GatewayStreamSummary> {
  const iterator = parseGatewayStream(reader);
  let next = await iterator.next();
  while (!next.done) {
    onEvent(next.value);
    next = await iterator.next();
  }
  return next.value;
}
