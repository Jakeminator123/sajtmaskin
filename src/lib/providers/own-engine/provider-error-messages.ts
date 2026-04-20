/**
 * Map provider (OpenAI / Anthropic / etc.) error codes to user-facing
 * Swedish messages, so the chat UI shows actionable text instead of the
 * generic "Stream error" / "Engine generation failed" string.
 *
 * Background: SAJ-8 (handoff FIXA — B3). Before this helper, "Stream error"
 * masked provider failures that the user would have understood
 * (insufficient_quota → "OpenAI-kvoten slut", etc.).
 *
 * The helper is intentionally small — it covers the codes the team has
 * observed in production. Unknown codes fall back to the original message.
 */

export type ProviderErrorClassification = {
  /** User-facing Swedish message. Always set. */
  userMessage: string;
  /** Best-effort provider error code, if extractable. */
  code: string | null;
  /** True when the error is permanent for this generation (no retry will help). */
  permanent: boolean;
};

const CODE_TO_USER_MESSAGE: Record<string, { sv: string; permanent: boolean }> = {
  insufficient_quota: { sv: "OpenAI-kvoten slut. Fyll på i ditt OpenAI-konto.", permanent: true },
  rate_limit_exceeded: { sv: "OpenAI rate limit — för många anrop just nu, prova igen om en stund.", permanent: false },
  context_length_exceeded: { sv: "För lång prompt — kontexten överskrider modellens gräns.", permanent: true },
  invalid_api_key: { sv: "Ogiltig OpenAI API-nyckel.", permanent: true },
  permission_denied: { sv: "Saknar behörighet hos provider.", permanent: true },
  model_not_found: { sv: "Modellen är otillgänglig — välj en annan tier eller modell.", permanent: true },
  server_error: { sv: "Tillfälligt fel hos provider — försök igen.", permanent: false },
  service_unavailable: { sv: "Provider-tjänsten är överbelastad — försök igen.", permanent: false },
};

const STATUS_TO_USER_MESSAGE: Record<number, { sv: string; permanent: boolean }> = {
  401: { sv: "Ogiltig API-nyckel hos provider.", permanent: true },
  402: { sv: "Provider-konto saknar betalning eller är inaktivt.", permanent: true },
  403: { sv: "Saknar behörighet hos provider.", permanent: true },
  413: { sv: "Förfrågan för stor — minska prompt eller filer.", permanent: true },
  500: { sv: "Tillfälligt fel hos provider — försök igen.", permanent: false },
  503: { sv: "Provider-tjänsten är överbelastad — försök igen.", permanent: false },
};

/**
 * Extract a likely provider error code from arbitrary error shapes
 * (AI SDK wraps differently per provider). Returns null when none found.
 */
function extractProviderCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const e = err as {
    code?: unknown;
    error?: { code?: unknown };
    data?: { error?: { code?: unknown } };
    cause?: { code?: unknown; error?: { code?: unknown } };
  };
  const candidates = [
    e.code,
    e.error?.code,
    e.data?.error?.code,
    e.cause?.code,
    e.cause?.error?.code,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

function extractStatus(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
  for (const v of [e.status, e.statusCode, e.response?.status]) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function extractMessage(err: unknown, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === "string") return err.trim() || fallback;
  if (typeof err === "object") {
    const e = err as { message?: unknown };
    if (typeof e.message === "string" && e.message.trim()) return e.message.trim();
  }
  return fallback;
}

/**
 * Classify an error from a provider call into a user-facing Swedish
 * message + retry hint. Falls back to the raw provider message when no
 * mapping matches — preserves prior behaviour for unknown errors.
 */
export function classifyProviderError(
  err: unknown,
  fallback = "Engine generation failed",
): ProviderErrorClassification {
  const rawMessage = extractMessage(err, fallback);
  const code = extractProviderCode(err);
  if (code) {
    const mapped = CODE_TO_USER_MESSAGE[code];
    if (mapped) {
      return { userMessage: mapped.sv, code, permanent: mapped.permanent };
    }
  }
  const status = extractStatus(err);
  if (status !== null) {
    const mapped = STATUS_TO_USER_MESSAGE[status];
    if (mapped) {
      return { userMessage: mapped.sv, code, permanent: mapped.permanent };
    }
  }
  return { userMessage: rawMessage, code, permanent: false };
}
