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

const MAX_DETAIL_CHARS = 400;

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

/**
 * Parse an OpenAI-compatible SSE stream into content deltas, stopping at the
 * first error envelope. Malformed chunks are skipped, as before — but an
 * `error` chunk is a deliberate upstream signal and is reported, not dropped.
 */
export async function* parseGatewayStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<GatewayStreamEvent> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;

      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;

      let json: unknown;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }

      const gatewayError = describeGatewayError(json);
      if (gatewayError) {
        yield { type: "error", description: gatewayError };
        return;
      }

      const delta = (json as { choices?: Array<{ delta?: { content?: unknown } }> })
        .choices?.[0]?.delta?.content;
      if (typeof delta === "string") {
        yield { type: "delta", text: delta };
      }
    }
  }
}
