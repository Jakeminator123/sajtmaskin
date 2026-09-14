/**
 * Presentation helpers for the customer account page.
 *
 * Login method is derived from `users.provider` (email | google). The page
 * must not invent a subscription, plan, or invoice — those do not exist yet.
 */

export function loginMethodLabel(provider: string | null | undefined): string {
  if (provider === "google") return "Google";
  return "E-post och lösenord";
}

export function transactionLabel(input: {
  description: string | null | undefined;
  type: string;
}): string {
  const description = input.description?.trim();
  if (description) return description;
  if (input.type === "purchase") return "Köp av credits";
  return input.type;
}

export const KONTO_HISTORY_DEFAULT_LIMIT = 50;
export const KONTO_HISTORY_MAX_LIMIT = 50;
export const KONTO_SIGNED_OUT_TITLE = "Du måste vara inloggad";
export const KONTO_LOAD_OLDER_LABEL = "Visa äldre";

/** Apply a /api/konto response only when it still belongs to the visible user. */
export function shouldApplyKontoResponse(
  requestUserId: string | null | undefined,
  currentUserId: string | null | undefined,
): boolean {
  return Boolean(requestUserId) && requestUserId === currentUserId;
}

export function parseKontoHistoryQuery(searchParams: URLSearchParams): {
  limit: number;
  offset: number;
} {
  const rawLimit = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const rawOffset = Number.parseInt(searchParams.get("offset") ?? "", 10);
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, KONTO_HISTORY_MAX_LIMIT)
      : KONTO_HISTORY_DEFAULT_LIMIT;
  const offset = Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0;
  return { limit, offset };
}

export function sliceKontoHistory<T>(
  rows: T[],
  limit: number,
): { rows: T[]; hasMore: boolean } {
  const hasMore = rows.length > limit;
  return {
    rows: hasMore ? rows.slice(0, limit) : rows,
    hasMore,
  };
}

export function mergeKontoTransactions<T extends { id: string }>(
  current: T[],
  incoming: T[],
): T[] {
  const seen = new Set(current.map((row) => row.id));
  return [...current, ...incoming.filter((row) => !seen.has(row.id))];
}

export function kontoOlderHistoryNotice(shown: number): string {
  return `Visar de ${shown} senaste. Äldre poster finns.`;
}
