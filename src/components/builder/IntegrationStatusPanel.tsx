"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";

type IntegrationItem = {
  id: string;
  label: string;
  enabled: boolean;
  required: boolean;
  requiredEnv: string[];
  affects: string;
  notes?: string;
};

type IntegrationStatus = {
  updatedAt: string;
  items: IntegrationItem[];
};

export function IntegrationStatusPanel() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOpen = () => {
      setExpanded(true);
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("integrations-panel-open", handleOpen as EventListener);
    return () => window.removeEventListener("integrations-panel-open", handleOpen as EventListener);
  }, []);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await fetch("/api/integrations/status", { signal: controller.signal });
        const data = (await res.json().catch(() => null)) as IntegrationStatus | null;
        if (!isActive) return;
        if (res.ok && data) {
          setStatus(data);
          setError(false);
        } else {
          setError(true);
        }
      } catch (error) {
        if (!isActive) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setError(true);
      }
    };
    load();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, []);

  const summary = useMemo(() => {
    if (!status) return null;
    const missingRequired = status.items.filter((item) => item.required && !item.enabled);
    const missingOptional = status.items.filter((item) => !item.required && !item.enabled);
    return { missingRequired, missingOptional };
  }, [status]);

  if (error) {
    return (
      <div className="border-border bg-muted/20 border-b px-3 py-2 text-xs text-gray-400">
        Kunde inte hämta integrationsstatus.
      </div>
    );
  }

  if (!status || !summary) {
    return (
      <div className="border-border bg-muted/20 border-b px-3 py-2 text-xs text-gray-400">
        Laddar integrationsstatus...
      </div>
    );
  }

  const { missingRequired, missingOptional } = summary;
  const hasIssues = missingRequired.length > 0;

  return (
    <div
      ref={panelRef}
      id="integrations-panel"
      className="border-border bg-muted/10 border-b px-3 py-2 text-xs"
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2">
          {hasIssues ? (
            <AlertCircle className="h-4 w-4 text-red-400" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-green-400" />
          )}
          <span className="font-medium text-gray-200">Integrationer</span>
        </div>
        <span className="flex items-center gap-1 text-gray-400">
          {missingRequired.length} kritiska, {missingOptional.length} valfria
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {status.items.map((item) => {
            const stateLabel = item.enabled ? "OK" : item.required ? "Saknas" : "Valfri";
            const stateColor = item.enabled
              ? "text-green-400"
              : item.required
                ? "text-red-400"
                : "text-yellow-400";
            return (
              <div key={item.id} className="border-border rounded-md border p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-200">{item.label}</span>
                  <span className={stateColor}>{stateLabel}</span>
                </div>
                <div className="text-muted-foreground mt-1">{item.affects}</div>
                {!item.enabled && item.requiredEnv.length > 0 && (
                  <div className="text-muted-foreground mt-1">
                    Saknas: {item.requiredEnv.join(", ")}
                  </div>
                )}
                {item.notes && <div className="text-muted-foreground mt-1">Info: {item.notes}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
