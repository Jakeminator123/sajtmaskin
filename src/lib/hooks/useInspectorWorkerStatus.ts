import { useEffect, useRef, useState } from "react";

export type InspectorWorkerStatus = "unknown" | "healthy" | "unhealthy" | "disabled";

const POLL_INTERVAL_MS = 30_000;

export function useInspectorWorkerStatus() {
  const [status, setStatus] = useState<InspectorWorkerStatus>("unknown");
  const [message, setMessage] = useState<string | null>(null);
  const settledDisabled = useRef(false);

  useEffect(() => {
    let isActive = true;
    let timer: number | null = null;

    const check = async () => {
      if (settledDisabled.current) return;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      try {
        const res = await fetch("/api/inspector-worker-status", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => null)) as {
          status?: InspectorWorkerStatus;
          message?: string;
        } | null;
        if (!isActive) return;
        const newStatus = data?.status || "unhealthy";
        setStatus(newStatus);
        setMessage(data?.message || null);

        if (newStatus === "disabled") {
          settledDisabled.current = true;
          if (timer) window.clearInterval(timer);
        }
      } catch {
        if (!isActive) return;
        setStatus("unhealthy");
        setMessage("Inspector worker status kunde inte hämtas.");
      } finally {
        clearTimeout(timeoutId);
      }
    };

    check();
    timer = window.setInterval(check, POLL_INTERVAL_MS);
    return () => {
      isActive = false;
      if (timer) window.clearInterval(timer);
    };
  }, []);

  return { inspectorWorkerStatus: status, inspectorWorkerMessage: message };
}
