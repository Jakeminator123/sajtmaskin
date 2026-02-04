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
      message: `Rate limit mot v0.${suffix}`,
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
      message: "Kvoten är slut för v0. Kontrollera plan/billing.",
      retryAfter,
    };
  }

  if (
    statusHint === 401 ||
    normalized.includes("unauthorized") ||
    normalized.includes("api key") ||
    normalized.includes("401")
  ) {
    return {
      status: 401,
      code: "unauthorized",
      message: "V0_API_KEY saknas eller är ogiltig.",
      retryAfter,
    };
  }

  if (statusHint === 403 || normalized.includes("forbidden") || normalized.includes("403")) {
    return {
      status: 403,
      code: "forbidden",
      message: "Åtkomst nekad av v0 (403). Kontrollera behörigheter.",
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
