"use client";

/**
 * Thin POST helper for the admin action endpoints.
 *
 * Every `/api/admin/*` POST answers with `{ success, message?, error?, … }`.
 * This normalises that envelope (including non-JSON error pages) so sections can
 * do `const result = await postAdminAction(...)` and show one toast.
 */
export interface AdminActionResult<T = Record<string, unknown>> {
  ok: boolean;
  /** Human-readable outcome, always set. */
  message: string;
  /** Raw payload for callers that need counts. */
  payload: T | null;
}

async function postAdminAction<T = Record<string, unknown>>(
  url: string,
  body: Record<string, unknown>,
  fallbackError = "Åtgärden misslyckades",
): Promise<AdminActionResult<T>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await response.text();

    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (json === null) {
      return {
        ok: false,
        message: response.ok ? fallbackError : `${fallbackError} (HTTP ${response.status})`,
        payload: null,
      };
    }

    const envelope = json as { success?: boolean; message?: string; error?: string };
    const ok = response.ok && envelope.success !== false;

    return {
      ok,
      message: ok
        ? envelope.message || "Klart."
        : envelope.error || envelope.message || `${fallbackError} (HTTP ${response.status})`,
      payload: json as T,
    };
  } catch {
    return { ok: false, message: fallbackError, payload: null };
  }
}

/** `POST /api/admin/database` — every action shares one endpoint. */
export function postDatabaseAction<T = Record<string, unknown>>(
  action: string,
  extra: Record<string, unknown> = {},
) {
  return postAdminAction<T>("/api/admin/database", { action, ...extra });
}
