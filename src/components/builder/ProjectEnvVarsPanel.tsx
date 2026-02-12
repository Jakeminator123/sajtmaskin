"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type EnvVarItem = {
  id?: string;
  key: string;
  value?: string | null;
  sensitive?: boolean;
  updatedAt?: string | null;
};

type EnvVarsResponse = {
  success?: boolean;
  envVars?: EnvVarItem[];
  error?: string;
};

type MarketplaceIntegrationOption = {
  id: string;
  label: string;
  installUrl: string;
};

type MarketplaceStrategyResponse = {
  success?: boolean;
  strategy?: {
    key?: string;
    ownershipModel?: string;
    billingOwner?: string;
  };
  supportedIntegrations?: MarketplaceIntegrationOption[];
  error?: string;
};

type MarketplaceRecord = {
  id: string;
  integration_type: string;
  status: string;
  install_url?: string | null;
  updated_at?: string | null;
};

type MarketplaceRecordsResponse = {
  success?: boolean;
  records?: MarketplaceRecord[];
  error?: string;
};

type McpPriorityItem = {
  id: string;
  label: string;
  phase: number;
  priority: "high" | "medium" | "low";
  readiness: "ready" | "needs_env_setup";
  missingEnv?: string[];
};

type McpPrioritiesResponse = {
  success?: boolean;
  priorities?: McpPriorityItem[];
  error?: string;
};

interface ProjectEnvVarsPanelProps {
  projectId: string | null;
}

export function ProjectEnvVarsPanel({ projectId }: ProjectEnvVarsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [envVars, setEnvVars] = useState<EnvVarItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newSensitive, setNewSensitive] = useState(true);
  const [strategy, setStrategy] = useState<MarketplaceStrategyResponse["strategy"] | null>(null);
  const [integrationOptions, setIntegrationOptions] = useState<MarketplaceIntegrationOption[]>([]);
  const [selectedIntegration, setSelectedIntegration] = useState("neon");
  const [marketplaceRecords, setMarketplaceRecords] = useState<MarketplaceRecord[]>([]);
  const [isStartingInstall, setIsStartingInstall] = useState(false);
  const [mcpPriorities, setMcpPriorities] = useState<McpPriorityItem[]>([]);

  const envVarCount = envVars.length;

  const loadEnvVars = useCallback(async () => {
    if (!projectId) {
      setEnvVars([]);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v0/projects/${encodeURIComponent(projectId)}/env-vars`);
      const data = (await response.json().catch(() => null)) as EnvVarsResponse | null;
      if (!response.ok || !data?.success) {
        setEnvVars([]);
        setError(data?.error || "Kunde inte hämta miljövariabler");
        return;
      }
      setEnvVars(Array.isArray(data.envVars) ? data.envVars : []);
    } catch (loadError) {
      setEnvVars([]);
      setError(loadError instanceof Error ? loadError.message : "Kunde inte hämta miljövariabler");
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const loadMarketplaceMetadata = useCallback(async () => {
    if (!projectId) {
      setStrategy(null);
      setIntegrationOptions([]);
      setMarketplaceRecords([]);
      return;
    }
    try {
      const [strategyRes, recordsRes, mcpRes] = await Promise.all([
        fetch("/api/integrations/marketplace/strategy"),
        fetch(`/api/integrations/marketplace/records?projectId=${encodeURIComponent(projectId)}`),
        fetch("/api/integrations/mcp/priorities"),
      ]);
      const strategyData = (await strategyRes.json().catch(() => null)) as
        | MarketplaceStrategyResponse
        | null;
      const recordsData = (await recordsRes.json().catch(() => null)) as
        | MarketplaceRecordsResponse
        | null;
      const mcpData = (await mcpRes.json().catch(() => null)) as McpPrioritiesResponse | null;

      if (strategyRes.ok && strategyData?.success) {
        setStrategy(strategyData.strategy ?? null);
        const options = Array.isArray(strategyData.supportedIntegrations)
          ? strategyData.supportedIntegrations
          : [];
        setIntegrationOptions(options);
        if (options.length > 0 && !options.some((item) => item.id === selectedIntegration)) {
          setSelectedIntegration(options[0].id);
        }
      }

      if (recordsRes.ok && recordsData?.success) {
        setMarketplaceRecords(Array.isArray(recordsData.records) ? recordsData.records : []);
      } else if (recordsRes.status !== 401) {
        setMarketplaceRecords([]);
      }

      if (mcpRes.ok && mcpData?.success) {
        setMcpPriorities(Array.isArray(mcpData.priorities) ? mcpData.priorities : []);
      } else {
        setMcpPriorities([]);
      }
    } catch {
      // Best-effort metadata loading; keep env var panel functional.
      setMcpPriorities([]);
    }
  }, [projectId, selectedIntegration]);

  const handleStartMarketplaceInstall = useCallback(async () => {
    if (!projectId || !selectedIntegration || isStartingInstall) return;
    setIsStartingInstall(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/marketplace/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrationType: selectedIntegration,
          projectId,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { success?: boolean; installUrl?: string; error?: string }
        | null;
      if (!response.ok || !data?.success || !data.installUrl) {
        setError(data?.error || "Kunde inte starta Marketplace-flödet");
        return;
      }
      window.open(data.installUrl, "_blank", "noopener,noreferrer");
      await loadMarketplaceMetadata();
    } catch (startError) {
      setError(
        startError instanceof Error ? startError.message : "Kunde inte starta Marketplace-flödet",
      );
    } finally {
      setIsStartingInstall(false);
    }
  }, [projectId, selectedIntegration, isStartingInstall, loadMarketplaceMetadata]);

  useEffect(() => {
    if (!expanded) return;
    void loadEnvVars();
    void loadMarketplaceMetadata();
  }, [expanded, loadEnvVars, loadMarketplaceMetadata]);

  const canAdd = useMemo(() => {
    const key = newKey.trim().toUpperCase();
    return /^[A-Z][A-Z0-9_]*$/.test(key) && newValue.length > 0;
  }, [newKey, newValue]);

  const handleAddEnvVar = useCallback(async () => {
    if (!projectId || !canAdd || isSaving) return;
    const key = newKey.trim().toUpperCase();
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/v0/projects/${encodeURIComponent(projectId)}/env-vars`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vars: [{ key, value: newValue, sensitive: newSensitive }],
          upsert: true,
        }),
      });
      const data = (await response.json().catch(() => null)) as EnvVarsResponse | null;
      if (!response.ok || !data?.success) {
        setError(data?.error || "Kunde inte spara miljövariabel");
        return;
      }
      setEnvVars(Array.isArray(data.envVars) ? data.envVars : []);
      setNewKey("");
      setNewValue("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunde inte spara miljövariabel");
    } finally {
      setIsSaving(false);
    }
  }, [projectId, canAdd, isSaving, newKey, newValue, newSensitive]);

  const handleDeleteEnvVar = useCallback(
    async (item: EnvVarItem) => {
      if (!projectId || isSaving) return;
      setIsSaving(true);
      setError(null);
      try {
        const payload = item.id ? { ids: [item.id] } : { keys: [item.key] };
        const response = await fetch(`/api/v0/projects/${encodeURIComponent(projectId)}/env-vars`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await response.json().catch(() => null)) as EnvVarsResponse | null;
        if (!response.ok || !data?.success) {
          setError(data?.error || "Kunde inte ta bort miljövariabel");
          return;
        }
        setEnvVars(Array.isArray(data.envVars) ? data.envVars : []);
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : "Kunde inte ta bort miljövariabel");
      } finally {
        setIsSaving(false);
      }
    },
    [projectId, isSaving],
  );

  return (
    <div className="border-border bg-muted/10 border-b px-3 py-2 text-xs">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-gray-300" />
          <span className="font-medium text-gray-200">Projektmiljövariabler</span>
        </div>
        <span className="flex items-center gap-1 text-gray-400">
          {projectId ? `${envVarCount} nycklar` : "ingen v0-projektkoppling"}
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {!projectId && (
            <div className="text-muted-foreground rounded-md border border-dashed p-2 text-xs">
              Skapa eller öppna en chat först så att projektet får ett riktigt v0-projectId.
            </div>
          )}

          {projectId && (
            <>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                <Input
                  value={newKey}
                  onChange={(event) => setNewKey(event.target.value.toUpperCase())}
                  placeholder="OPENAI_API_KEY"
                  className="h-8 text-xs"
                />
                <Input
                  value={newValue}
                  onChange={(event) => setNewValue(event.target.value)}
                  placeholder="value"
                  className="h-8 text-xs"
                />
                <Button size="sm" onClick={handleAddEnvVar} disabled={!canAdd || isSaving}>
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                </Button>
              </div>

              <label className="text-muted-foreground flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={newSensitive}
                  onChange={(event) => setNewSensitive(event.target.checked)}
                />
                Markera som känslig (rekommenderas)
              </label>

              {isLoading ? (
                <div className="text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Hämtar miljövariabler...
                </div>
              ) : envVars.length === 0 ? (
                <div className="text-muted-foreground rounded-md border border-dashed p-2">
                  Inga miljövariabler ännu.
                </div>
              ) : (
                <div className="space-y-1">
                  {envVars.map((item) => (
                    <div
                      key={item.id || item.key}
                      className="border-border flex items-center justify-between rounded-md border p-2"
                    >
                      <div className="min-w-0">
                        <div className="text-foreground flex items-center gap-2 truncate font-medium">
                          <span className="truncate">{item.key}</span>
                          {item.sensitive && (
                            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">
                              sensitive
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground truncate">
                          {item.value ? "value available" : "värde dolt av provider"}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteEnvVar(item)}
                        disabled={isSaving}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-border mt-2 rounded-md border p-2">
                <div className="text-foreground text-xs font-medium">
                  Marketplace-integrering (Vercel)
                </div>
                {strategy && (
                  <div className="text-muted-foreground mt-1 text-[11px]">
                    Modell: {strategy.ownershipModel || "user_vercel_account"} • Billing:{" "}
                    {strategy.billingOwner || "user"}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={selectedIntegration}
                    onChange={(event) => setSelectedIntegration(event.target.value)}
                    className="border-border bg-background h-8 min-w-[160px] rounded-md border px-2 text-xs"
                  >
                    {integrationOptions.length === 0 && (
                      <option value="neon">Neon Postgres</option>
                    )}
                    {integrationOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleStartMarketplaceInstall}
                    disabled={isStartingInstall}
                  >
                    {isStartingInstall ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Starta i Marketplace"
                    )}
                  </Button>
                </div>
                {marketplaceRecords.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {marketplaceRecords.slice(0, 4).map((record) => (
                      <div
                        key={record.id}
                        className="border-border flex items-center justify-between rounded-md border px-2 py-1"
                      >
                        <span className="text-foreground text-[11px]">{record.integration_type}</span>
                        <span className="text-muted-foreground text-[11px]">{record.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-border mt-2 rounded-md border p-2">
                <div className="text-foreground text-xs font-medium">MCP-prioritering</div>
                {mcpPriorities.length === 0 ? (
                  <div className="text-muted-foreground mt-1 text-[11px]">
                    Ingen prioriteringsdata tillgänglig.
                  </div>
                ) : (
                  <div className="mt-2 space-y-1">
                    {mcpPriorities.slice(0, 5).map((item) => (
                      <div
                        key={item.id}
                        className="border-border flex flex-col gap-1 rounded-md border px-2 py-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-foreground text-[11px]">
                            Fas {item.phase}: {item.label}
                          </span>
                          <span
                            className={`text-[10px] ${
                              item.readiness === "ready" ? "text-emerald-300" : "text-amber-300"
                            }`}
                          >
                            {item.readiness === "ready" ? "redo" : "kräver env"}
                          </span>
                        </div>
                        {item.missingEnv && item.missingEnv.length > 0 && (
                          <div className="text-muted-foreground text-[10px]">
                            Saknas: {item.missingEnv.join(", ")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {error && <div className="text-xs text-red-400">{error}</div>}
        </div>
      )}
    </div>
  );
}
