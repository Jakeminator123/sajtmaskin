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
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualDisconnectRef = useRef(false);

  useEffect(() => {
    if (!deploymentId) return;
    manualDisconnectRef.current = false;

    /* eslint-disable react-hooks/set-state-in-effect -- reset UI when subscribing to a new deployment stream */
    setStatus("pending");
    setUrl(null);
    setInspectorUrl(null);
    /* eslint-enable react-hooks/set-state-in-effect */

    const endpoint = `/api/v0/deployments/${deploymentId}/events`;
    const maxReconnectAttempts = 3;
    let reconnectAttempts = 0;
    let streamCompleted = false;
    let isEffectActive = true;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const closeCurrentStream = () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (!isEffectActive || streamCompleted || manualDisconnectRef.current || reconnectTimerRef.current) {
        return;
      }
      if (reconnectAttempts >= maxReconnectAttempts) {
        closeCurrentStream();
        return;
      }
      const delayMs = 2_000 * 2 ** reconnectAttempts;
      reconnectAttempts += 1;
      closeCurrentStream();
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delayMs);
    };

    const connect = () => {
      if (!isEffectActive || streamCompleted || manualDisconnectRef.current) return;
      closeCurrentStream();

      const es = new EventSource(endpoint);
      esRef.current = es;

      es.onmessage = (event) => {
        try {
          const data: DeploymentStatusEvent = JSON.parse(event.data);
          reconnectAttempts = 0;
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
      manualDisconnectRef.current = true;
      clearReconnectTimer();
      closeCurrentStream();
    };
  }, [deploymentId]);

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    esRef.current?.close();
    esRef.current = null;
  }, []);

  return { status, url, inspectorUrl, disconnect };
}
