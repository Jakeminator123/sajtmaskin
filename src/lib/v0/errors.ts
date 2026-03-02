export type V0ErrorInfo = {
  status: number;
  code: string;
  message: string;
  retryAfter?: number | null;
};

function asNumber(value: unknown): number | null {
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

/**
 * Extract a meaningful HTTP status code from a v0 SDK error.
 * Falls back to 500 if no status can be determined.
 */
export function extractV0StatusCode(err: unknown): number {
  if (!err || typeof err !== "object") return 500;
  const status = getStatusCode(err);
  if (status) return status;
  const msg = getErrorMessage(err).toLowerCase();
  if (msg.includes("401") || msg.includes("unauthorized")) return 401;
  if (msg.includes("403") || msg.includes("forbidden")) return 403;
  if (msg.includes("404") || msg.includes("not found")) return 404;
  if (msg.includes("429") || msg.includes("rate limit")) return 429;
  return 500;
}

export function normalizeV0Error(err: unknown): V0ErrorInfo {
  const statusHint = getStatusCode(err);
  const retryAfter = getRetryAfterSeconds(err);
  const rawMessage = getErrorMessage(err);
  const normalized = rawMessage.toLowerCase();

  if (
    statusHint === 429 ||
    normalized.includes("rate limit") ||
    normalized.includes("429") ||
    normalized.includes("too many requests")
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
    normalized.includes("quota") ||
    normalized.includes("billing") ||
    normalized.includes("plan")
  ) {
    return {
      status: 402,
      code: "quota_exceeded",
      message: "Kvoten är slut för AI-tjänsten. Kontrollera plan/billing.",
      retryAfter,
    };
  }

  if (
    statusHint === 401 ||
    normalized.includes("unauthorized") ||
    normalized.includes("api key") ||
    normalized.includes("401")
  ) {
    const isV0Key =
      normalized.includes("v0") ||
      normalized.includes("platform") ||
      normalized.includes("model api");
    const setup = isV0Key
      ? "Kontrollera V0_API_KEY i miljövariabler."
      : "Kontrollera API-nycklar i miljövariabler.";
    return {
      status: 401,
      code: "unauthorized",
      message: rawMessage
        ? `${rawMessage} – ${setup}`
        : `API-nyckel saknas eller är ogiltig. ${setup}`,
      retryAfter,
    };
  }

  if (statusHint === 403 || normalized.includes("forbidden") || normalized.includes("403")) {
    return {
      status: 403,
      code: "forbidden",
      message: "Åtkomst nekad av AI-tjänsten (403). Kontrollera behörigheter.",
      retryAfter,
    };
  }

  return {
    status: statusHint ?? 500,
    code: "error",
    message: rawMessage || "Okänt fel",
    retryAfter,
  };
}
