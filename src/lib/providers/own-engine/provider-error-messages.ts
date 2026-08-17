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
  /**
   * True when the failure is OUR account's or the provider's — an invalid key,
   * an exhausted quota, a missing permission, a capacity/outage response. The
   * model never produced anything the user asked for, and nothing the user
   * could write would have changed the outcome, so a run that ends this way
   * must not spend the user's credits (`generation-stream.ts`).
   *
   * Deliberately false for request-shape failures (too long a prompt): the
   * model did run against real input, and the user can act on it.
   */
  providerFault: boolean;
};

type Mapping = { sv: string; permanent: boolean; providerFault?: boolean };

const CODE_TO_USER_MESSAGE: Record<string, Mapping> = {
  insufficient_quota: { sv: "OpenAI-kvoten slut. Fyll på i ditt OpenAI-konto.", permanent: true, providerFault: true },
  // OpenAI's Responses API reports an empty prepaid balance with this code and
  // `type: insufficient_quota`; only `code` is read here, so it needs its own row.
  credit_balance_exhausted: { sv: "OpenAI-krediten är slut. Fyll på i ditt OpenAI-konto.", permanent: true, providerFault: true },
  rate_limit_exceeded: { sv: "OpenAI rate limit — för många anrop just nu, prova igen om en stund.", permanent: false, providerFault: true },
  context_length_exceeded: { sv: "För lång prompt — kontexten överskrider modellens gräns.", permanent: true },
  invalid_api_key: { sv: "Ogiltig OpenAI API-nyckel.", permanent: true, providerFault: true },
  permission_denied: { sv: "Saknar behörighet hos provider.", permanent: true, providerFault: true },
  model_not_found: { sv: "Modellen är otillgänglig — välj en annan tier eller modell.", permanent: true, providerFault: true },
  server_error: { sv: "Tillfälligt fel hos provider — försök igen.", permanent: false, providerFault: true },
  service_unavailable: { sv: "Provider-tjänsten är överbelastad — försök igen.", permanent: false, providerFault: true },
};

const STATUS_TO_USER_MESSAGE: Record<number, Mapping> = {
  401: { sv: "Ogiltig API-nyckel hos provider.", permanent: true, providerFault: true },
  402: { sv: "Provider-konto saknar betalning eller är inaktivt.", permanent: true, providerFault: true },
  403: { sv: "Saknar behörighet hos provider.", permanent: true, providerFault: true },
  413: { sv: "Förfrågan för stor — minska prompt eller filer.", permanent: true },
  429: { sv: "Provider rate limit — för många anrop just nu, prova igen om en stund.", permanent: false, providerFault: true },
  500: { sv: "Tillfälligt fel hos provider — försök igen.", permanent: false, providerFault: true },
  502: { sv: "Provider svarade med ett gateway-fel — försök igen.", permanent: false, providerFault: true },
  503: { sv: "Provider-tjänsten är överbelastad — försök igen.", permanent: false, providerFault: true },
  504: { sv: "Provider svarade inte i tid — försök igen.", permanent: false, providerFault: true },
};

/**
 * Every error object worth inspecting: the error itself plus its `cause`
 * chain, depth-capped so a self-referencing cause cannot spin.
 *
 * The chain matters because the AI SDK wraps. A provider `401` arrives as an
 * `AI_APICallError` nested inside `NoOutputGeneratedError`, whose own message
 * is the useless "No output generated. Check the stream for errors." Reading
 * only the outer error is why a revoked prod key surfaced to users as a
 * generic empty-output warning (prod, 2026-07-28).
 */
function errorChain(err: unknown, maxDepth = 5): object[] {
  const chain: object[] = [];
  let current = err;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current) && chain.length < maxDepth) {
    seen.add(current);
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
}

/**
 * Every provider error code in the chain, outermost first.
 *
 * A list rather than the first hit: the outer wrapper often carries a transport
 * code of its own (`UND_ERR_SOCKET`, `ECONNRESET`), and returning that would
 * hide a mapped `insufficient_quota` sitting one `cause` deeper — the run would
 * then be billed as a normal failure instead of a provider fault.
 */
function providerCodeCandidates(err: unknown): string[] {
  const codes: string[] = [];
  for (const node of errorChain(err)) {
    const e = node as {
      code?: unknown;
      error?: { code?: unknown };
      data?: { error?: { code?: unknown } };
    };
    for (const c of [e.code, e.error?.code, e.data?.error?.code]) {
      if (typeof c === "string" && c.trim()) codes.push(c.trim());
    }
  }
  return codes;
}

/** Same reasoning as {@link providerCodeCandidates}, for HTTP statuses. */
function providerStatusCandidates(err: unknown): number[] {
  const statuses: number[] = [];
  for (const node of errorChain(err)) {
    const e = node as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
    for (const v of [e.status, e.statusCode, e.response?.status]) {
      if (typeof v === "number" && Number.isFinite(v)) statuses.push(v);
    }
  }
  return statuses;
}

/**
 * `Object.hasOwn`, never a bare index: a provider code of `constructor` or
 * `toString` would otherwise hit `Object.prototype` and return a truthy
 * non-mapping, so `mapped.sv` would be `undefined` and the user would lose the
 * message entirely while the type claimed a string.
 */
function lookupMapping<K extends string | number>(
  table: Record<K, Mapping>,
  key: K | null,
): Mapping | null {
  if (key === null) return null;
  return Object.hasOwn(table, key) ? table[key] : null;
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

  // Prefer a code we can actually map over merely the first one found, then
  // fall back to the outermost code for reporting.
  const codes = providerCodeCandidates(err);
  const mappedCode = codes.find((c) => Object.hasOwn(CODE_TO_USER_MESSAGE, c)) ?? null;
  const code = mappedCode ?? codes[0] ?? null;

  const codeMapping = lookupMapping(CODE_TO_USER_MESSAGE, mappedCode);
  if (codeMapping) {
    return {
      userMessage: codeMapping.sv,
      code,
      permanent: codeMapping.permanent,
      providerFault: codeMapping.providerFault === true,
    };
  }

  const statuses = providerStatusCandidates(err);
  const mappedStatus = statuses.find((s) => Object.hasOwn(STATUS_TO_USER_MESSAGE, s)) ?? null;
  const statusMapping = lookupMapping(STATUS_TO_USER_MESSAGE, mappedStatus);
  if (statusMapping) {
    return {
      userMessage: statusMapping.sv,
      code,
      permanent: statusMapping.permanent,
      providerFault: statusMapping.providerFault === true,
    };
  }

  return { userMessage: rawMessage, code, permanent: false, providerFault: false };
}
