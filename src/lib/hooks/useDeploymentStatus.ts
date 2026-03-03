"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type DeploymentStatus = "pending" | "building" | "ready" | "error" | "cancelled";

type DeploymentStatusEvent = {
  status: DeploymentStatus;
  url: string | null;
  inspectorUrl: string | null;
};

export function useDeploymentStatus(deploymentId: string | null) {
  const [status, setStatus] = useState<DeploymentStatus>("pending");
  const [url, setUrl] = useState<string | null>(null);
  const [inspectorUrl, setInspectorUrl] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!deploymentId) return;

    setStatus("pending");
    setUrl(null);
    setInspectorUrl(null);

    const es = new EventSource(`/api/v0/deployments/${deploymentId}/events`);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: DeploymentStatusEvent = JSON.parse(event.data);
        setStatus(data.status);
        if (data.url) setUrl(data.url);
        if (data.inspectorUrl) setInspectorUrl(data.inspectorUrl);

        if (["ready", "error", "cancelled"].includes(data.status)) {
          es.close();
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [deploymentId]);

  const disconnect = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  return { status, url, inspectorUrl, disconnect };
}
