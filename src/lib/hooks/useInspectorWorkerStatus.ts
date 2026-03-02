import { useEffect, useState } from "react";

export type InspectorWorkerStatus = "unknown" | "healthy" | "unhealthy" | "disabled";

export function useInspectorWorkerStatus() {
  const [status, setStatus] = useState<InspectorWorkerStatus>("unknown");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const check = async () => {
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
        setStatus(data?.status || "unhealthy");
        setMessage(data?.message || null);
      } catch {
        if (!isActive) return;
        setStatus("unhealthy");
        setMessage("Inspector worker status kunde inte hämtas.");
      } finally {
        clearTimeout(timeoutId);
      }
    };

    check();
    const timer = window.setInterval(check, 30_000);
    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, []);

  return { inspectorWorkerStatus: status, inspectorWorkerMessage: message };
}
