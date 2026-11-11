export type ProviderErrorInfo = {
  status: number;
  code: string;
  message: string;
  retryAfter?: number | null;
};

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getRetryAfterSeconds(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const obj = err as Record<string, unknown>;
  const direct = asNumber(obj.retryAfter ?? obj.retry_after);
  if (direct !== null) return direct;
  const cause = obj.cause as Record<string, unknown> | undefined;
  const fromCause = asNumber(cause?.retryAfter ?? cause?.retry_after);
  return fromCause ?? null;
}

function getStatusCode(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const obj = err as Record<string, unknown>;
  return (
    asNumber(obj.status) ??
    asNumber(obj.statusCode) ??
    asNumber(obj.status_code) ??
    asNumber((obj.response as Record<string, unknown> | undefined)?.status)
  );
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.error === "string") return obj.error;
  }
  return "Okänt fel";
}

export function normalizeProviderError(err: unknown): ProviderErrorInfo {
  const statusHint = getStatusCode(err);
  const retryAfter = getRetryAfterSeconds(err);
  const rawMessage = getErrorMessage(err);
  const obj = err && typeof err === "object" ? err as Record<string, unknown> : null;
  const nested = obj?.error && typeof obj.error === "object"
    ? obj.error as Record<string, unknown> : null;
  const code = typeof (obj?.code ?? nested?.code) === "string"
    ? String(obj?.code ?? nested?.code).toLowerCase() : "";

  if (
    statusHint === 429 ||
    code === "rate_limit_exceeded" || code === "rate_limit"
  ) {
    const suffix = retryAfter ? ` Försök igen om ${retryAfter}s.` : "";
    return {
      status: 429,
      code: "rate_limit",
      message: `Rate limit mot AI-tjänsten.${suffix}`,
      retryAfter,
    };
  }

  if (
    statusHint === 402 ||
    code === "insufficient_quota" || code === "credit_balance_exhausted"
  ) {
    return {
      status: 402,
      code: "quota_exceeded",
      message: "Kvoten är slut för AI-tjänsten. Kontrollera plan eller billing.",
      retryAfter,
    };
  }

  if (
    statusHint === 401 ||
    code === "invalid_api_key" || code === "unauthorized"
  ) {
    const setup = "Kontrollera API-nycklar i miljövariabler.";
    return {
      status: 401,
      code: "unauthorized",
      message: `API-nyckel saknas eller är ogiltig. ${setup}`,
      retryAfter,
    };
  }

  if (statusHint === 403 || code === "permission_denied" || code === "forbidden") {
    return {
      status: 403,
      code: "forbidden",
      message: "Åtkomst nekad av AI-tjänsten (403). Kontrollera behörigheter.",
      retryAfter,
    };
  }

  const status = statusHint ?? 500;
  return {
    status,
    code: "error",
    message:
      status >= 500
        ? "Ett oväntat fel uppstod. Försök igen."
        : rawMessage || "Ogiltig begäran.",
    retryAfter,
  };
}
