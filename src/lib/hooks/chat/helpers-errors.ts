function toNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getRetryAfterSeconds(
  response: Response | null,
  errorData: Record<string, unknown> | null,
): number | null {
  const direct = toNumber(errorData?.retryAfter ?? errorData?.retry_after);
  if (direct !== null) return direct;
  const header = response?.headers.get("Retry-After");
  return header ? toNumber(header) : null;
}

function looksLikeUnsupportedModelError(message: string | null | undefined): boolean {
  const normalized = String(message ?? "").toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("model") &&
    (normalized.includes("invalid") ||
      normalized.includes("unknown") ||
      normalized.includes("unsupported") ||
      normalized.includes("not allowed") ||
      normalized.includes("not supported"))
  );
}

export function buildApiErrorMessage(params: {
  response: Response;
  errorData: Record<string, unknown> | null;
  fallbackMessage: string;
}): string {
  const { response, errorData, fallbackMessage } = params;
  const status = response.status;
  const code = typeof errorData?.code === "string" ? errorData.code : "";
  const retryAfter = getRetryAfterSeconds(response, errorData);

  if (status === 429 || code === "rate_limit") {
    const suffix = retryAfter ? ` Prova igen om ${retryAfter}s.` : "";
    return `Rate limit: för många förfrågningar.${suffix}`;
  }
  if (status === 402) {
    const serverError =
      (typeof errorData?.error === "string" && errorData.error) ||
      (typeof errorData?.message === "string" && errorData.message) ||
      "";
    if (serverError) return serverError;
    return "Kvoten är slut för AI-tjänsten. Kontrollera plan/billing.";
  }
  if (code === "quota_exceeded") {
    return "Kvoten är slut för AI-tjänsten. Kontrollera plan/billing.";
  }
  if (status === 401 || code === "unauthorized") {
    return "API-nyckel saknas eller är ogiltig.";
  }
  if (status === 403 || code === "forbidden") {
    return "Åtkomst nekad av AI-tjänsten (403). Kontrollera behörigheter.";
  }
  if (status === 422 || code === "unprocessable_entity_error") {
    const nestedMsg =
      typeof (errorData?.error as Record<string, unknown>)?.message === "string"
        ? ((errorData!.error as Record<string, unknown>).message as string)
        : typeof errorData?.message === "string"
          ? errorData.message
          : null;
    if (nestedMsg?.toLowerCase().includes("attachment size")) {
      return "Bilagan är för stor (max 3 MB). Försök med en mindre fil.";
    }
    if (looksLikeUnsupportedModelError(nestedMsg)) {
      return `Model ID avvisades av AI-tjänsten: "${nestedMsg}". Byt till en giltig byggmodell (GPT-4.1, GPT-5.3 Codex, GPT-5.4 eller GPT-5.1 Codex Max).`;
    }
    return nestedMsg || "Ogiltigt anrop (422). Kontrollera bilagor och meddelande.";
  }

  const directMessage =
    (typeof errorData?.error === "string" && errorData.error) ||
    (typeof errorData?.message === "string" && errorData.message) ||
    "";
  if (looksLikeUnsupportedModelError(directMessage)) {
    return `Model ID avvisades av AI-tjänsten: "${directMessage}". Byt till en giltig byggmodell (GPT-4.1, GPT-5.3 Codex, GPT-5.4 eller GPT-5.1 Codex Max).`;
  }

  let message = directMessage || fallbackMessage;
  if (!message.includes("HTTP")) {
    message = `${message} (HTTP ${status})`;
  }
  return message;
}

/** User-facing copy when the create-chat SSE connection drops. Do not retry via POST /api/engine/chats. */
export const CREATE_CHAT_CONNECTION_BROKEN_MESSAGE =
  "Anslutningen bröts innan sajten hann byggas. Försök igen.";

export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    return /network|fetch|connection|reset/i.test(error.message);
  }
  return false;
}

export function isAbortLikeError(error: unknown): boolean {
  if (!error) return false;

  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }

  if (error instanceof Error) {
    return (
      error.name === "AbortError" ||
      /aborted|aborterror|bodystreambuffer was aborted/i.test(error.message)
    );
  }

  if (typeof error === "object" && error !== null) {
    const maybeName = "name" in error ? error.name : null;
    const maybeMessage = "message" in error ? error.message : null;
    return (
      maybeName === "AbortError" ||
      (typeof maybeMessage === "string" &&
        /aborted|aborterror|bodystreambuffer was aborted/i.test(maybeMessage))
    );
  }

  return false;
}

/**
 * Distinguishes a *client-initiated* abort (user pressed stop, route
 * change, hot-reload, etc.) from an abort-shaped error that surfaced
 * because the *server/provider* tore down the stream. We swallow the
 * former silently; we surface the latter as a toast so the user knows
 * the model didn't actually finish.
 *
 * Pass the AbortController whose signal was attached to the original
 * `fetch()`. When that controller's `.aborted` is true at the time of
 * the catch, the abort came from us.
 */
export function isClientInitiatedAbort(
  error: unknown,
  controller: AbortController | null | undefined,
): boolean {
  if (!isAbortLikeError(error)) return false;
  return Boolean(controller?.signal?.aborted);
}

export function buildStreamErrorMessage(errorData: Record<string, unknown> | null): string {
  const code = typeof errorData?.code === "string" ? errorData.code : "";
  const retryAfter = toNumber(errorData?.retryAfter ?? errorData?.retry_after);
  const rawMessage =
    (typeof errorData?.message === "string" && errorData.message) ||
    (typeof errorData?.error === "string" && errorData.error) ||
    "";

  if (code === "rate_limit") {
    const suffix = retryAfter ? ` Prova igen om ${retryAfter}s.` : "";
    return `Rate limit: för många förfrågningar.${suffix}`;
  }
  if (code === "quota_exceeded") {
    return "Kvoten är slut för AI-tjänsten. Kontrollera plan/billing.";
  }
  if (code === "unauthorized") {
    return "API-nyckel saknas eller är ogiltig.";
  }
  if (code === "forbidden") {
    return "Åtkomst nekad av AI-tjänsten (403). Kontrollera behörigheter.";
  }
  if (code === "preview_unavailable") {
    return "Preview-version kunde inte fastställas från streamen. Försök igen eller kör reparera preview.";
  }
  if (looksLikeUnsupportedModelError(rawMessage)) {
    return `Model ID avvisades av AI-tjänsten: "${rawMessage}". Byt till en giltig byggmodell (GPT-4.1, GPT-5.3 Codex, GPT-5.4 eller GPT-5.1 Codex Max).`;
  }
  if (rawMessage.toLowerCase().includes("no preview version was generated")) {
    return "Preview-version saknas efter streamen. Försök igen eller kör reparera preview.";
  }
  return rawMessage || "Stream error";
}
