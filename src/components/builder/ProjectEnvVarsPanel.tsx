"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Loader2,
  Plug,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { detectIntegrations, type DetectedIntegration } from "@/lib/gen/detect-integrations";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

type IntegrationStatusItem = {
  id: string;
  label: string;
  enabled: boolean;
  required: boolean;
  requiredEnv: string[];
  affects: string;
  notes?: string;
};

type IntegrationStatusResponse = {
  updatedAt: string;
  items: IntegrationStatusItem[];
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

interface ProjectSettingsPanelProps {
  v0ProjectId: string | null;
  appProjectId: string | null;
  chatId: string | null;
  activeVersionId: string | null;
}

type Tab = "integrations" | "env";

type ProjectEnvVarsOpenDetail = {
  envKeys?: string[];
};

type VersionFilesResponse = {
  versionId?: string | null;
  files?: Array<{
    name: string;
    content: string;
  }>;
  error?: string;
};

type SiteIntegrationItem = DetectedIntegration & {
  configuredEnvVars: string[];
  missingEnvVars: string[];
  statusLabel: string;
  isConfigured: boolean;
};

const SYNTHETIC_V0_PROJECT_PREFIXES = ["chat:", "registry:"];
function isSyntheticV0ProjectId(id: string): boolean {
  return SYNTHETIC_V0_PROJECT_PREFIXES.some((prefix) => id.startsWith(prefix));
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isValidEnvKey(value: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(value.trim());
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProjectEnvVarsPanel({
  v0ProjectId,
  appProjectId,
  chatId,
  activeVersionId,
}: ProjectSettingsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("integrations");
  const panelRef = useRef<HTMLDivElement | null>(null);

  // --- env vars state ---
  const [envVars, setEnvVars] = useState<EnvVarItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newSensitive, setNewSensitive] = useState(true);
  const [syntheticProject, setSyntheticProject] = useState(false);

  // --- integration state ---
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusResponse | null>(
    null,
  );
  const [integrationError, setIntegrationError] = useState(false);
  const [strategy, setStrategy] = useState<MarketplaceStrategyResponse["strategy"] | null>(null);
  const [integrationOptions, setIntegrationOptions] = useState<MarketplaceIntegrationOption[]>([]);
  const [selectedIntegration, setSelectedIntegration] = useState("neon");
  const [marketplaceRecords, setMarketplaceRecords] = useState<MarketplaceRecord[]>([]);
  const [isStartingInstall, setIsStartingInstall] = useState(false);
  const [mcpPriorities, setMcpPriorities] = useState<McpPriorityItem[]>([]);
  const [detectedIntegrations, setDetectedIntegrations] = useState<DetectedIntegration[]>([]);
  const [isLoadingDetectedIntegrations, setIsLoadingDetectedIntegrations] = useState(false);
  const [detectedIntegrationsError, setDetectedIntegrationsError] = useState<string | null>(null);

  const envVarCount = envVars.length;
  const hasRealV0Project = Boolean(v0ProjectId && !isSyntheticV0ProjectId(v0ProjectId));
  const hasSyntheticV0Project = Boolean(v0ProjectId && isSyntheticV0ProjectId(v0ProjectId));
  const effectiveEnvProjectId = hasRealV0Project ? v0ProjectId : appProjectId ?? v0ProjectId ?? null;
  const marketplaceProjectId = hasRealV0Project ? v0ProjectId : null;
  const hasProjectContext = Boolean(effectiveEnvProjectId);

  const applyPreferredEnvKeys = useCallback((preferredKeys: string[]) => {
    const firstKey = preferredKeys
      .map((key) => key.trim().toUpperCase())
      .find((key) => isValidEnvKey(key));
    if (firstKey) {
      setNewKey((current) => (current.trim().length > 0 ? current : firstKey));
    }
  }, []);

  const openEnvTab = useCallback(
    (preferredKeys: string[] = []) => {
      applyPreferredEnvKeys(preferredKeys);
      setActiveTab("env");
      setExpanded(true);
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [applyPreferredEnvKeys],
  );

  // --- data loaders ---

  const loadEnvVars = useCallback(async () => {
    if (!effectiveEnvProjectId) {
      setEnvVars([]);
      setError(null);
      setSyntheticProject(false);
      return;
    }
    if (hasSyntheticV0Project && !appProjectId) {
      setEnvVars([]);
      setError(null);
      setSyntheticProject(true);
      return;
    }
    setSyntheticProject(false);
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v0/projects/${encodeURIComponent(effectiveEnvProjectId)}/env-vars`,
      );
      const data = (await response.json().catch(() => null)) as EnvVarsResponse | null;
      if (!response.ok || !data?.success) {
        setEnvVars([]);
        setError(data?.error || "Kunde inte hämta miljövariabler");
        return;
      }
      setEnvVars(Array.isArray(data.envVars) ? data.envVars : []);
    } catch (loadError) {
      setEnvVars([]);
      setError(
        loadError instanceof Error ? loadError.message : "Kunde inte hämta miljövariabler",
      );
    } finally {
      setIsLoading(false);
    }
  }, [appProjectId, effectiveEnvProjectId, hasSyntheticV0Project]);

  const loadIntegrationStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/status");
      const data = (await res.json().catch(() => null)) as IntegrationStatusResponse | null;
      if (res.ok && data) {
        setIntegrationStatus(data);
        setIntegrationError(false);
      } else {
        setIntegrationError(true);
      }
    } catch {
      setIntegrationError(true);
    }
  }, []);

  const loadMarketplaceMetadata = useCallback(async () => {
    if (!marketplaceProjectId || isSyntheticV0ProjectId(marketplaceProjectId)) {
      setStrategy(null);
      setIntegrationOptions([]);
      setMarketplaceRecords([]);
      setMcpPriorities([]);
      return;
    }
    try {
      const [strategyRes, recordsRes, mcpRes] = await Promise.all([
        fetch("/api/integrations/marketplace/strategy"),
        fetch(
          `/api/integrations/marketplace/records?projectId=${encodeURIComponent(marketplaceProjectId)}`,
        ),
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
      setMcpPriorities([]);
    }
  }, [marketplaceProjectId, selectedIntegration]);

  const loadDetectedIntegrations = useCallback(async () => {
    if (!chatId || !activeVersionId) {
      setDetectedIntegrations([]);
      setDetectedIntegrationsError(null);
      setIsLoadingDetectedIntegrations(false);
      return;
    }
    setIsLoadingDetectedIntegrations(true);
    setDetectedIntegrationsError(null);
    try {
      const response = await fetch(
        `/api/v0/chats/${encodeURIComponent(chatId)}/files?versionId=${encodeURIComponent(activeVersionId)}`,
      );
      const data = (await response.json().catch(() => null)) as VersionFilesResponse | null;
      if (!response.ok) {
        setDetectedIntegrations([]);
        setDetectedIntegrationsError(data?.error || "Kunde inte analysera aktiv version");
        return;
      }
      const files = Array.isArray(data?.files) ? data.files : [];
      const combinedSource = files
        .filter((file) => typeof file?.name === "string" && typeof file?.content === "string")
        .map((file) => `// File: ${file.name}\n${file.content}`)
        .join("\n\n");
      setDetectedIntegrations(combinedSource ? detectIntegrations(combinedSource) : []);
    } catch (loadError) {
      setDetectedIntegrations([]);
      setDetectedIntegrationsError(
        loadError instanceof Error ? loadError.message : "Kunde inte analysera aktiv version",
      );
    } finally {
      setIsLoadingDetectedIntegrations(false);
    }
  }, [chatId, activeVersionId]);

  // --- actions ---

  const handleStartMarketplaceInstall = useCallback(async () => {
    if (!marketplaceProjectId || !selectedIntegration || isStartingInstall) return;
    setIsStartingInstall(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/marketplace/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationType: selectedIntegration, projectId: marketplaceProjectId }),
      });
      const data = (await response.json().catch(() => null)) as
        | { success?: boolean; installUrl?: string; error?: string }
        | null;
      if (!response.ok || !data?.success || !data.installUrl) {
        setError(data?.error || "Kunde inte starta installationsflödet");
        return;
      }
      window.open(data.installUrl, "_blank", "noopener,noreferrer");
      await loadMarketplaceMetadata();
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Kunde inte starta installationsflödet",
      );
    } finally {
      setIsStartingInstall(false);
    }
  }, [marketplaceProjectId, selectedIntegration, isStartingInstall, loadMarketplaceMetadata]);

  const canAdd = useMemo(() => {
    const key = newKey.trim().toUpperCase();
    return /^[A-Z][A-Z0-9_]*$/.test(key) && newValue.length > 0;
  }, [newKey, newValue]);

  const handleAddEnvVar = useCallback(async () => {
    if (!effectiveEnvProjectId || !canAdd || isSaving) return;
    const key = newKey.trim().toUpperCase();
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v0/projects/${encodeURIComponent(effectiveEnvProjectId)}/env-vars`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vars: [{ key, value: newValue, sensitive: newSensitive }],
            upsert: true,
          }),
        },
      );
      const data = (await response.json().catch(() => null)) as EnvVarsResponse | null;
      if (!response.ok || !data?.success) {
        setError(data?.error || "Kunde inte spara miljövariabel");
        return;
      }
      setEnvVars(Array.isArray(data.envVars) ? data.envVars : []);
      setNewKey("");
      setNewValue("");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Kunde inte spara miljövariabel",
      );
    } finally {
      setIsSaving(false);
    }
  }, [effectiveEnvProjectId, canAdd, isSaving, newKey, newValue, newSensitive]);

  const handleDeleteEnvVar = useCallback(
    async (item: EnvVarItem) => {
      if (!effectiveEnvProjectId || isSaving) return;
      setIsSaving(true);
      setError(null);
      try {
        const payload = item.id ? { ids: [item.id] } : { keys: [item.key] };
        const response = await fetch(
          `/api/v0/projects/${encodeURIComponent(effectiveEnvProjectId)}/env-vars`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const data = (await response.json().catch(() => null)) as EnvVarsResponse | null;
        if (!response.ok || !data?.success) {
          setError(data?.error || "Kunde inte ta bort miljövariabel");
          return;
        }
        setEnvVars(Array.isArray(data.envVars) ? data.envVars : []);
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : "Kunde inte ta bort miljövariabel",
        );
      } finally {
        setIsSaving(false);
      }
    },
    [effectiveEnvProjectId, isSaving],
  );

  // --- effects ---

  useEffect(() => {
    if (!expanded) return;
    void loadEnvVars();
    void loadIntegrationStatus();
    void loadMarketplaceMetadata();
    void loadDetectedIntegrations();
  }, [
    expanded,
    loadDetectedIntegrations,
    loadEnvVars,
    loadIntegrationStatus,
    loadMarketplaceMetadata,
  ]);

  useEffect(() => {
    const handleEnvOpen = (event: Event) => {
      const customEvent = event as CustomEvent<ProjectEnvVarsOpenDetail>;
      const preferredKeys = Array.isArray(customEvent.detail?.envKeys)
        ? customEvent.detail?.envKeys
        : [];
      openEnvTab(preferredKeys);
    };
    const handleIntOpen = () => {
      setActiveTab("integrations");
      setExpanded(true);
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("project-env-vars-open", handleEnvOpen as EventListener);
    window.addEventListener("integrations-panel-open", handleIntOpen as EventListener);
    return () => {
      window.removeEventListener("project-env-vars-open", handleEnvOpen as EventListener);
      window.removeEventListener("integrations-panel-open", handleIntOpen as EventListener);
    };
  }, [openEnvTab]);

  // --- derived ---

  const statusSummary = useMemo(() => {
    if (!integrationStatus) return null;
    const missing = integrationStatus.items.filter((i) => i.required && !i.enabled);
    const optional = integrationStatus.items.filter((i) => !i.required && !i.enabled);
    return { missing, optional };
  }, [integrationStatus]);

  const isRealProject = Boolean(effectiveEnvProjectId && !syntheticProject);
  const configuredEnvKeys = useMemo(
    () => new Set(envVars.map((item) => item.key.trim().toUpperCase()).filter(isValidEnvKey)),
    [envVars],
  );
  const siteIntegrations = useMemo<SiteIntegrationItem[]>(() => {
    return detectedIntegrations.map((integration) => {
      const envKeys = dedupeStrings((integration.envVars ?? []).filter(isValidEnvKey));
      const readyToCompare = Boolean(effectiveEnvProjectId) && !syntheticProject && !isLoading;
      const configuredForIntegration = readyToCompare
        ? envKeys.filter((key) => configuredEnvKeys.has(key))
        : [];
      const missingForIntegration = readyToCompare
        ? envKeys.filter((key) => !configuredEnvKeys.has(key))
        : envKeys;
      const isConfigured = envKeys.length === 0 || (readyToCompare && missingForIntegration.length === 0);
      const statusLabel =
        envKeys.length === 0
          ? "Detekterad i koden"
          : isConfigured
            ? "Konfigurerad i projektet"
            : !effectiveEnvProjectId
              ? "Väntar på chat och projekt"
              : syntheticProject
                ? "Väntar på riktigt projectId"
                : isLoading
                  ? "Kontrollerar miljövariabler"
                  : `Saknar ${missingForIntegration.length} miljövariabler`;
      return {
        ...integration,
        envVars: envKeys,
        configuredEnvVars: configuredForIntegration,
        missingEnvVars: missingForIntegration,
        statusLabel,
        isConfigured,
      };
    });
  }, [configuredEnvKeys, detectedIntegrations, effectiveEnvProjectId, isLoading, syntheticProject]);
  const likelyRequiredEnvKeys = useMemo(
    () => dedupeStrings(siteIntegrations.flatMap((integration) => integration.envVars)),
    [siteIntegrations],
  );
  const configuredRequiredEnvKeys = useMemo(
    () => likelyRequiredEnvKeys.filter((key) => configuredEnvKeys.has(key)),
    [configuredEnvKeys, likelyRequiredEnvKeys],
  );
  const missingRequiredEnvKeys = useMemo(
    () => likelyRequiredEnvKeys.filter((key) => !configuredEnvKeys.has(key)),
    [configuredEnvKeys, likelyRequiredEnvKeys],
  );
  const totalIssues = (statusSummary?.missing.length ?? 0) + missingRequiredEnvKeys.length;

  // --- header summary ---
  const headerLabel = expanded
    ? "Projektinställningar"
    : totalIssues > 0
      ? `Projektinställningar • ${totalIssues} att konfigurera`
      : `Projektinställningar • ${envVarCount} variabler`;

  return (
    <div ref={panelRef} className="border-border bg-muted/10 border-b px-3 py-2 text-xs">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2">
          {totalIssues > 0 ? (
            <AlertCircle className="h-4 w-4 text-red-400" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-green-400" />
          )}
          <span className="font-medium text-gray-200">{headerLabel}</span>
        </div>
        <span className="flex items-center gap-1 text-gray-400">
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </button>

      {expanded && (
        <div className="mt-2">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)} className="w-full gap-0">
          {/* Tab bar */}
          <TabsList className="mb-2 flex h-auto w-auto gap-1 border-b border-border bg-transparent p-0 pb-1">
            <TabsTrigger
              value="integrations"
              className="flex items-center gap-1.5 rounded-md border-0 px-2.5 py-1 text-xs shadow-none transition-colors data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-medium data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
            >
              <Plug className="h-3 w-3" />
              Integrationer
            </TabsTrigger>
            <TabsTrigger
              value="env"
              className="flex items-center gap-1.5 rounded-md border-0 px-2.5 py-1 text-xs shadow-none transition-colors data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-medium data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
            >
              <KeyRound className="h-3 w-3" />
              Miljövariabler
              {envVarCount > 0 && (
                <span className="text-muted-foreground text-[10px]">({envVarCount})</span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Integrations tab */}
          <TabsContent value="integrations">
            <div className="space-y-2">
              <div className="rounded-lg border border-border/30 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Visar tre lager: vad den aktiva sajtkoden verkar använda, vad plattformen är redo
                för och vad som redan installerats på projektet.
              </div>

              <div className="border-border rounded-md border p-2">
                <div className="text-foreground text-xs font-medium">Aktiv sajt</div>
                <div className="text-muted-foreground mt-1 text-[11px]">
                  Detekterat direkt från koden i den valda versionen.
                </div>
                {isLoadingDetectedIntegrations ? (
                  <div className="text-muted-foreground mt-2 flex items-center gap-2 text-[11px]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Analyserar den aktiva versionen...
                  </div>
                ) : detectedIntegrationsError ? (
                  <div className="mt-2 rounded-md border border-dashed border-amber-500/40 p-2 text-[11px] text-amber-200">
                    {detectedIntegrationsError}
                  </div>
                ) : !chatId || !activeVersionId ? (
                  <div className="mt-2 rounded-md border border-dashed p-2 text-[11px] text-muted-foreground">
                    Generera eller öppna en version först för att se vilka integrationer sajten verkar använda.
                  </div>
                ) : siteIntegrations.length === 0 ? (
                  <div className="mt-2 rounded-md border border-dashed p-2 text-[11px] text-muted-foreground">
                    Inga tydliga integrationer upptäcktes i den aktiva versionen ännu.
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {siteIntegrations.map((item) => (
                      <div key={item.key} className="border-border rounded-md border p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-gray-200">{item.name}</span>
                          <span
                            className={cn(
                              "text-[11px]",
                              item.isConfigured
                                ? "text-green-400"
                                : syntheticProject || !effectiveEnvProjectId
                                  ? "text-amber-300"
                                  : "text-red-400",
                            )}
                          >
                            {item.statusLabel}
                          </span>
                        </div>
                        <div className="text-muted-foreground mt-0.5">
                          Detekterad i koden för den aktiva sajten.
                        </div>
                        {item.envVars.length > 0 && (
                          <div className="text-muted-foreground mt-1 text-[11px]">
                            Behöver: {item.envVars.join(", ")}
                          </div>
                        )}
                        {item.missingEnvVars.length > 0 && (
                          <div className="mt-1 text-[11px] text-amber-200">
                            Saknas här: {item.missingEnvVars.join(", ")}
                          </div>
                        )}
                        {item.setupGuide && (
                          <div className="text-muted-foreground mt-1 text-[11px]">
                            {item.setupGuide}
                          </div>
                        )}
                        {item.envVars.length > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="mt-2 h-7 px-2 text-[11px]"
                            onClick={() =>
                              openEnvTab(item.missingEnvVars.length > 0 ? item.missingEnvVars : item.envVars)
                            }
                          >
                            Öppna miljövariabler
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {integrationError && (
                <div className="text-muted-foreground text-xs">
                  Kunde inte hämta integrationsstatus.
                </div>
              )}

              {integrationStatus && statusSummary && (
                <div className="space-y-1">
                  <div className="text-foreground text-xs font-medium">Plattformens status</div>
                  {integrationStatus.items.map((item) => {
                    const stateLabel = item.enabled
                      ? "OK"
                      : item.required
                        ? "Saknas"
                        : "Valfri";
                    const stateColor = item.enabled
                      ? "text-green-400"
                      : item.required
                        ? "text-red-400"
                        : "text-yellow-400";
                    return (
                      <div
                        key={item.id}
                        className="border-border rounded-md border p-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-200">{item.label}</span>
                          <span className={stateColor}>{stateLabel}</span>
                        </div>
                        <div className="text-muted-foreground mt-0.5">{item.affects}</div>
                        {!item.enabled && item.requiredEnv.length > 0 && (
                          <div className="text-muted-foreground mt-0.5">
                            Saknas: {item.requiredEnv.join(", ")}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {isRealProject ? (
                <div className="border-border mt-2 rounded-md border p-2">
                  <div className="text-foreground text-xs font-medium">Marketplace på projektet</div>
                  {strategy && (
                    <div className="text-muted-foreground mt-1 text-[11px]">
                      Du hanterar och bekostar integrationen själv.
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
                        "Installera"
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
                          <span className="text-foreground text-[11px]">
                            {record.integration_type}
                          </span>
                          <span className="text-muted-foreground text-[11px]">
                            {record.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="border-border mt-2 rounded-md border border-dashed p-2 text-[11px] text-muted-foreground">
                  Marketplace-installationer visas när chatten har skapat ett riktigt projekt-ID.
                </div>
              )}

              {mcpPriorities.length > 0 && (
                <div className="border-border mt-2 rounded-md border p-2">
                  <div className="text-foreground text-xs font-medium">MCP-prioritering</div>
                  <div className="mt-1 space-y-1">
                    {mcpPriorities.slice(0, 5).map((item) => (
                      <div
                        key={item.id}
                        className="border-border flex flex-col gap-0.5 rounded-md border px-2 py-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-foreground text-[11px]">
                            Fas {item.phase}: {item.label}
                          </span>
                          <span
                            className={cn(
                              "text-[10px]",
                              item.readiness === "ready"
                                ? "text-emerald-300"
                                : "text-amber-300",
                            )}
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
                </div>
              )}
            </div>
          </TabsContent>

          {/* Env vars tab */}
          <TabsContent value="env">
            <div className="space-y-2">
              <div className="rounded-lg border border-border/30 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Här visas miljövariabler för det genererade projektet, inte din lokala{" "}
                <code>.env.local</code>.
              </div>

              {appProjectId && !hasRealV0Project && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-100">
                  Egna motorn sparar dessa projektvariabler i Sajtmaskins projektdata och skickar dem
                  vidare vid publicering. När ett riktigt v0-projekt finns används dess projektvariabler i
                  stället.
                </div>
              )}

              {(siteIntegrations.length > 0 || likelyRequiredEnvKeys.length > 0) && (
                <div className="border-border rounded-md border p-2 text-xs">
                  <div className="text-foreground font-medium">Det verkar krävas för aktiv sajt</div>
                  <div className="text-muted-foreground mt-1 text-[11px]">
                    Buildern har hittat {siteIntegrations.length} kodsignal
                    {siteIntegrations.length === 1 ? "" : "er"} och {likelyRequiredEnvKeys.length} trolig
                    {likelyRequiredEnvKeys.length === 1 ? "" : "a"} miljövariabel
                    {likelyRequiredEnvKeys.length === 1 ? "" : "er"}.
                  </div>
                  {likelyRequiredEnvKeys.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {likelyRequiredEnvKeys.map((key) => {
                        const isPresent = configuredEnvKeys.has(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => openEnvTab([key])}
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px]",
                              isPresent
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                                : "border-amber-500/40 bg-amber-500/10 text-amber-200",
                            )}
                          >
                            {key}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {configuredRequiredEnvKeys.length > 0 && (
                    <div className="mt-2 text-[11px] text-emerald-200">
                      Redan satta i projektet: {configuredRequiredEnvKeys.join(", ")}
                    </div>
                  )}
                  {missingRequiredEnvKeys.length > 0 && (
                    <div className="mt-1 text-[11px] text-amber-200">
                      Saknas fortfarande: {missingRequiredEnvKeys.join(", ")}
                    </div>
                  )}
                </div>
              )}

              {!hasProjectContext && (
                <div className="text-muted-foreground rounded-md border border-dashed p-2 text-xs">
                  Skapa eller öppna en chat och generera en version först så att projektet får ett riktigt
                  projectId.
                </div>
              )}

              {syntheticProject && !appProjectId && (
                <div className="rounded-lg border border-border/30 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Projektet har just nu ett tillfälligt ID. Du kan redan se vilka nycklar sajten verkar
                  behöva, men själva projektvariablerna kan först sättas när ett riktigt v0-project skapas.
                </div>
              )}

              {isRealProject && (
                <>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                    <Input
                      value={newKey}
                      onChange={(event) => setNewKey(event.target.value.toUpperCase())}
                      placeholder="NYCKEL_NAMN"
                      className="h-8 text-xs"
                    />
                    <Input
                      value={newValue}
                      onChange={(event) => setNewValue(event.target.value)}
                      placeholder="värde"
                      className="h-8 text-xs"
                    />
                    <Button
                      size="sm"
                      onClick={handleAddEnvVar}
                      disabled={!canAdd || isSaving}
                    >
                      {isSaving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      id="env-sensitive"
                      size="sm"
                      checked={newSensitive}
                      onCheckedChange={setNewSensitive}
                    />
                    <Label htmlFor="env-sensitive" className="text-muted-foreground text-xs font-normal">
                      Markera som känslig (rekommenderas)
                    </Label>
                  </div>

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
                              {item.value ? "värde satt" : "värde dolt"}
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
                </>
              )}
            </div>
          </TabsContent>
          </Tabs>

          {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
        </div>
      )}
    </div>
  );
}
