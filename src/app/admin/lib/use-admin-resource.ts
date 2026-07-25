"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AdminResource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Re-fetch on demand (refresh buttons). */
  reload: () => Promise<void>;
}

interface UseAdminResourceOptions<T, R = unknown> {
  /** Map the raw JSON envelope to the shape the section needs. */
  select?: (json: R) => T;
  /** Skip fetching until true (e.g. a project must be picked first). */
  enabled?: boolean;
  /** Fallback error copy when the API gives none. */
  errorMessage?: string;
}

/**
 * One small fetch primitive for every admin section.
 *
 * Replaces the old pattern where `src/app/admin/page.tsx` owned ~25 `useState`
 * fields plus one hand-written fetcher per endpoint and drilled all of it into
 * the tab components as props. Each section now owns its own data.
 *
 * Contract assumed by all `/api/admin/*` routes: JSON with `success: boolean`
 * and `error?: string`. A non-JSON body (e.g. an HTML 500 page) is reported as
 * a readable error instead of throwing a JSON parse error at the user.
 */
export function useAdminResource<T, R = unknown>(
  url: string | null,
  options: UseAdminResourceOptions<T, R> = {},
): AdminResource<T> {
  const { select, enabled = true, errorMessage = "Kunde inte hämta data" } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the latest `select`/`errorMessage` without making them fetch triggers —
  // an inline arrow function as `select` would otherwise re-run the effect on
  // every render and loop.
  const selectRef = useRef(select);
  selectRef.current = select;
  const errorMessageRef = useRef(errorMessage);
  errorMessageRef.current = errorMessage;

  const requestIdRef = useRef(0);

  const run = useCallback(async () => {
    if (!url || !enabled) return;

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(url, { headers: { accept: "application/json" } });
      const text = await response.text();

      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (requestId !== requestIdRef.current) return;

      if (json === null) {
        setError(
          response.ok
            ? errorMessageRef.current
            : `${errorMessageRef.current} (HTTP ${response.status})`,
        );
        return;
      }

      const envelope = json as { success?: boolean; error?: string };
      if (!response.ok || envelope.success === false) {
        setError(envelope.error || `${errorMessageRef.current} (HTTP ${response.status})`);
        return;
      }

      const mapper = selectRef.current;
      setData(mapper ? mapper(json as R) : (json as T));
    } catch {
      if (requestId !== requestIdRef.current) return;
      setError(errorMessageRef.current);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [url, enabled]);

  useEffect(() => {
    void run();
  }, [run]);

  return { data, loading, error, reload: run };
}
