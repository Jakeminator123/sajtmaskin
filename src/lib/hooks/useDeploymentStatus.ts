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

    /* eslint-disable react-hooks/set-state-in-effect -- reset UI when subscribing to a new deployment stream */
    setStatus("pending");
    setUrl(null);
    setInspectorUrl(null);
    /* eslint-enable react-hooks/set-state-in-effect */

    const endpoint = `/api/v0/deployments/${deploymentId}/events`;
    const maxReconnectAttempts = 3;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let streamCompleted = false;
    let isEffectActive = true;

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const closeCurrentStream = () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (!isEffectActive || streamCompleted || reconnectTimer) return;
      if (reconnectAttempts >= maxReconnectAttempts) {
        closeCurrentStream();
        return;
      }
      const delayMs = 2_000 * 2 ** reconnectAttempts;
      reconnectAttempts += 1;
      closeCurrentStream();
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delayMs);
    };

    const connect = () => {
      if (!isEffectActive || streamCompleted) return;
      closeCurrentStream();

      const es = new EventSource(endpoint);
      esRef.current = es;

      es.onopen = () => {
        reconnectAttempts = 0;
      };

      es.onmessage = (event) => {
        try {
          const data: DeploymentStatusEvent = JSON.parse(event.data);
          setStatus(data.status);
          setUrl(data.url ?? null);
          setInspectorUrl(data.inspectorUrl ?? null);

          if (["ready", "error", "cancelled"].includes(data.status)) {
            streamCompleted = true;
            clearReconnectTimer();
            closeCurrentStream();
          }
        } catch (err) {
          console.warn("[useDeploymentStatus] Failed to parse SSE message:", err);
        }
      };

      es.onerror = () => {
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      isEffectActive = false;
      clearReconnectTimer();
      closeCurrentStream();
    };
  }, [deploymentId]);

  const disconnect = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  return { status, url, inspectorUrl, disconnect };
}
