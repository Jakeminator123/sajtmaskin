"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const WIZARD_RUN_STORAGE_KEY = "sajtmaskin:prompt-wizard-run-id";

/** 409 from a wizard route means the stored run is expired or completed. */
export function isStaleWizardRunResponse(response: Pick<Response, "status">): boolean {
  return response.status === 409;
}

/**
 * Obtains a server-owned wizard run id. The client never invents a UUID —
 * start creates or resumes the run and charges 11 credits at most once per
 * active run. The modal stays mounted (`isOpen=false` → `return null`), so
 * this hook calls start on every open: the server reuses a live run, or
 * mints a new one after expiry/complete. 409 from lookup/enrich/complete
 * takes the same path via `restartRun`.
 */
export function useWizardRun({
  isOpen,
  isAuthenticated,
  isInitialized,
}: {
  isOpen: boolean;
  isAuthenticated: boolean;
  isInitialized: boolean;
}) {
  const [wizardRunId, setWizardRunId] = useState("");
  const [startError, setStartError] = useState<string | null>(null);
  const [restartToken, setRestartToken] = useState(0);
  const skipStartRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      skipStartRef.current = false;
      return;
    }
    if (!isInitialized || !isAuthenticated || skipStartRef.current) return;
    const controller = new AbortController();
    fetch("/api/wizard/start", { method: "POST", signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          wizardRunId?: unknown;
          error?: unknown;
        };
        if (!response.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Kunde inte starta wizarden.",
          );
        }
        if (typeof data.wizardRunId !== "string" || !data.wizardRunId) {
          throw new Error("Ogiltigt svar från wizard-start.");
        }
        return data.wizardRunId;
      })
      .then((id) => {
        if (controller.signal.aborted) return;
        setStartError(null);
        setWizardRunId(id);
        window.localStorage.setItem(WIZARD_RUN_STORAGE_KEY, id);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStartError(error instanceof Error ? error.message : "Kunde inte starta wizarden.");
      });
    return () => controller.abort();
  }, [isOpen, isAuthenticated, isInitialized, restartToken]);

  const restartRun = useCallback(() => {
    if (skipStartRef.current) return;
    setWizardRunId("");
    window.localStorage.removeItem(WIZARD_RUN_STORAGE_KEY);
    setRestartToken((token) => token + 1);
  }, []);

  const completeRun = useCallback(async () => {
    skipStartRef.current = true;
    const id = wizardRunId;
    setWizardRunId("");
    window.localStorage.removeItem(WIZARD_RUN_STORAGE_KEY);
    if (!id) return;
    try {
      await fetch("/api/wizard/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wizardRunId: id }),
      });
    } catch {
      // Best-effort: start will resume an unfinished active run, or charge
      // a new one after expiry. Do not block the builder handoff.
    }
  }, [wizardRunId]);

  return { wizardRunId, startError, completeRun, restartRun };
}
