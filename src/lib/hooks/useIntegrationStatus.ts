import { useEffect, useState } from "react";

type IntegrationItem = {
  id: string;
  label: string;
  enabled: boolean;
  required: boolean;
  requiredEnv: string[];
  affects: string;
  notes?: string;
};

export type IntegrationStatus = {
  updatedAt: string;
  items: IntegrationItem[];
};

export function useIntegrationStatus(demoUrl: string | null) {
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  const [integrationError, setIntegrationError] = useState(false);

  useEffect(() => {
    if (!demoUrl) return;
    let isActive = true;
    const controller = new AbortController();

    const load = async () => {
      try {
        const res = await fetch("/api/integrations/status", { signal: controller.signal });
        const data = (await res.json().catch(() => null)) as IntegrationStatus | null;
        if (!isActive) return;
        if (res.ok && data) {
          setIntegrationStatus(data);
          setIntegrationError(false);
        } else {
          setIntegrationError(true);
        }
      } catch (error) {
        if (!isActive) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setIntegrationError(true);
      }
    };

    load();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [demoUrl]);

  return { integrationStatus, integrationError };
}
