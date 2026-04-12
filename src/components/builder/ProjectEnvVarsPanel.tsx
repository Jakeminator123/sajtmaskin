"use client";

import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
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
import { IntegrationSetupWizard } from "@/components/builder/IntegrationSetupWizard";
import { dispatchProjectEnvVarsUpdated } from "@/lib/builder/project-env-events";
import { detectBusinessWorkflowPacks, type BusinessWorkflowPack } from "@/lib/gen/packs/business-packs";
import {
  detectIntegrationsFromVersionFiles,
  type DetectedIntegration,
} from "@/lib/gen/detect-integrations";
import { buildAnalyticsReview, type AnalyticsReview } from "@/lib/hooks/chat/post-checks-analysis";
import type { FileEntry } from "@/lib/hooks/chat/types";
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
  externalProjectId: string | null;
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

type BusinessPackItem = BusinessWorkflowPack & {
  configuredEnvVars: string[];
  missingEnvVars: string[];
  statusLabel: string;
  isConfigured: boolean;
};

const TRACKING_PROVIDER_KEYS = new Set([
  "google-analytics",
  "gtm",
  "plausible",
  "posthog",
  "vercel-analytics",
]);

const SYNTHETIC_PROJECT_PREFIXES = ["chat:", "registry:"];
function isSyntheticProjectId(id: string): boolean {
  return SYNTHETIC_PROJECT_PREFIXES.some((prefix) => id.startsWith(prefix));
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
  externalProjectId,
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
  const [selectedIntegration, setSelectedIntegration] = useState("");
  const [marketplaceRecords, setMarketplaceRecords] = useState<MarketplaceRecord[]>([]);
  const [isStartingInstall, setIsStartingInstall] = useState(false);
  const [mcpPriorities, setMcpPriorities] = useState<McpPriorityItem[]>([]);
  const [detectedIntegrations, setDetectedIntegrations] = useState<DetectedIntegration[]>([]);
  const [businessPacks, setBusinessPacks] = useState<BusinessWorkflowPack[]>([]);
  const [analyticsReview, setAnalyticsReview] = useState<AnalyticsReview | null>(null);
  const [isLoadingDetectedIntegrations, setIsLoadingDetectedIntegrations] = useState(false);
  const [detectedIntegrationsError, setDetectedIntegrationsError] = useState<string | null>(null);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const envVarCount = envVars.length;
  const hasRealExternalProject = Boolean(
    externalProjectId && !isSyntheticProjectId(externalProjectId),
  );
  const hasSyntheticExternalProject = Boolean(
    externalProjectId && isSyntheticProjectId(externalProjectId),
  );
  const effectiveEnvProjectId = hasRealExternalProject
    ? externalProjectId
    : appProjectId ?? externalProjectId ?? null;
  const marketplaceProjectId = hasRealExternalProject ? externalProjectId : null;
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
    if (hasSyntheticExternalProject && !appProjectId) {
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
  }, [appProjectId, effectiveEnvProjectId, hasSyntheticExternalProject]);

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
    if (!marketplaceProjectId || isSyntheticProjectId(marketplaceProjectId)) {
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
      setBusinessPacks([]);
      setAnalyticsReview(null);
      setDetectedIntegrationsError(null);
      setIsLoadingDetectedIntegrations(false);
      return;
    }
    setIsLoadingDetectedIntegrations(true);
    setDetectedIntegrationsError(null);
    try {
      const response = await fetch(
        `${engineChatBaseUrl(chatId)}/files?versionId=${encodeURIComponent(activeVersionId)}`,
      );
      const data = (await response.json().catch(() => null)) as VersionFilesResponse | null;
      if (!response.ok) {
        setDetectedIntegrations([]);
        setBusinessPacks([]);
        setAnalyticsReview(null);
        setDetectedIntegrationsError(data?.error || "Kunde inte analysera aktiv version");
        return;
      }
      const files = Array.isArray(data?.files) ? data.files : [];
      const fileEntries: FileEntry[] = files
        .filter((file) => typeof file?.name === "string" && typeof file?.content === "string")
        .map((file) => ({
          name: file.name,
          content: file.content,
        }));
      const combinedSource = files
        .filter((file) => typeof file?.name === "string" && typeof file?.content === "string")
        .map((file) => `// File: ${file.name}\n${file.content}`)
        .join("\n\n");
      setDetectedIntegrations(
        fileEntries.length > 0 ? detectIntegrationsFromVersionFiles(fileEntries) : [],
      );
      setBusinessPacks(combinedSource ? detectBusinessWorkflowPacks(combinedSource) : []);
      setAnalyticsReview(fileEntries.length > 0 ? buildAnalyticsReview(fileEntries) : null);
    } catch (loadError) {
      setDetectedIntegrations([]);
      setBusinessPacks([]);
      setAnalyticsReview(null);
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
      if (chatId && activeVersionId) {
        dispatchProjectEnvVarsUpdated({
          projectId: effectiveEnvProjectId,
          chatId,
          versionId: activeVersionId,
          envKeys: [key],
        });
      }
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
        if (chatId && activeVersionId) {
          dispatchProjectEnvVarsUpdated({
            projectId: effectiveEnvProjectId,
            chatId,
            versionId: activeVersionId,
            envKeys: [item.key],
          });
        }
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
  const trackerIntegrations = useMemo(
    () => siteIntegrations.filter((integration) => TRACKING_PROVIDER_KEYS.has(integration.key)),
    [siteIntegrations],
  );
  const likelyRequiredEnvKeys = useMemo(
    () =>
      dedupeStrings([
        ...siteIntegrations.flatMap((integration) => integration.envVars),
        ...businessPacks.flatMap((pack) => pack.envVars),
      ]),
    [siteIntegrations, businessPacks],
  );
  const businessPackItems = useMemo<BusinessPackItem[]>(() => {
    return businessPacks.map((pack) => {
      const envKeys = dedupeStrings(pack.envVars.filter(isValidEnvKey));
      const readyToCompare = Boolean(effectiveEnvProjectId) && !syntheticProject && !isLoading;
      const configuredForPack = readyToCompare
        ? envKeys.filter((key) => configuredEnvKeys.has(key))
        : [];
      const missingForPack = readyToCompare
        ? envKeys.filter((key) => !configuredEnvKeys.has(key))
        : envKeys;
      const isConfigured =
        envKeys.length === 0
          ? false
          : readyToCompare && missingForPack.length === 0;
      const statusLabel =
        envKeys.length === 0
          ? "Behöver provider-val"
          : isConfigured
            ? "Konfigurerad i projektet"
            : !effectiveEnvProjectId
              ? "Väntar på chat och projekt"
              : syntheticProject
                ? "Väntar på riktigt projectId"
                : isLoading
                  ? "Kontrollerar miljövariabler"
                  : `Saknar ${missingForPack.length} miljövariabler`;
      return {
        ...pack,
        envVars: envKeys,
        configuredEnvVars: configuredForPack,
        missingEnvVars: missingForPack,
        isConfigured,
        statusLabel,
      };
    });
  }, [businessPacks, configuredEnvKeys, effectiveEnvProjectId, isLoading, syntheticProject]);
  const businessPackItemsPrimary = useMemo(
    () => businessPackItems.filter((pack) => pack.signalStrength !== "weak"),
    [businessPackItems],
  );
  const businessPackItemsExtra = useMemo(
    () => businessPackItems.filter((pack) => pack.signalStrength === "weak"),
    [businessPackItems],
  );
  const wizardIntegrations = useMemo(
    () =>
      siteIntegrations.map((i) => ({
        key: i.key,
        name: i.name,
        envVars: i.envVars,
        setupGuide: i.setupGuide,
        status: (i.isConfigured
          ? "configured"
          : i.configuredEnvVars.length > 0
            ? "partial"
            : "missing") as "configured" | "partial" | "missing",
        missingEnvVars: i.missingEnvVars,
      })),
    [siteIntegrations]
  );
  const wizardBusinessPacks = useMemo(
    () =>
      businessPackItems.map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        envVars: p.envVars,
        missingEnvVars: p.missingEnvVars,
        verificationChecklist: p.verificationChecklist,
        status: (p.isConfigured
          ? "configured"
          : p.configuredEnvVars.length > 0
            ? "partial"
            : "missing") as "configured" | "partial" | "missing",
      })),
    [businessPackItems]
  );
  const configuredRequiredEnvKeys = useMemo(
    () => likelyRequiredEnvKeys.filter((key) => configuredEnvKeys.has(key)),
    [configuredEnvKeys, likelyRequiredEnvKeys],
  );
  const missingRequiredEnvKeys = useMemo(
    () => likelyRequiredEnvKeys.filter((key) => !configuredEnvKeys.has(key)),
    [configuredEnvKeys, likelyRequiredEnvKeys],
  );
  /** Endast projektets saknade nycklar — inte Sajtmaskin-serverns plattformsstatus. */
  const totalIssues = missingRequiredEnvKeys.length;

  const marketplaceOptionsInfo = useMemo(() => {
    if (integrationOptions.length === 0) {
      return {
        options: [] as MarketplaceIntegrationOption[],
        isFilteredSubset: false,
        fallbackToFullList: false,
      };
    }
    const integrationKeys = new Set(detectedIntegrations.map((d) => d.key));
    const envKeysUpper = likelyRequiredEnvKeys.map((k) => k.toUpperCase());
    const matchesProjectSignal = (id: string): boolean => {
      if (id === "supabase") return integrationKeys.has("supabase");
      if (id === "upstash") return integrationKeys.has("upstash");
      if (id === "neon") {
        return (
          integrationKeys.has("prisma") ||
          envKeysUpper.some((k) => k.includes("POSTGRES") || k === "DATABASE_URL")
        );
      }
      return true;
    };
    const filtered = integrationOptions.filter((o) => matchesProjectSignal(o.id));
    if (filtered.length > 0) {
      return {
        options: filtered,
        isFilteredSubset: filtered.length < integrationOptions.length,
        fallbackToFullList: false,
      };
    }
    return {
      options: integrationOptions,
      isFilteredSubset: false,
      fallbackToFullList: true,
    };
  }, [detectedIntegrations, integrationOptions, likelyRequiredEnvKeys]);

  useEffect(() => {
    const opts = marketplaceOptionsInfo.options;
    if (opts.length === 0) return;
    if (!opts.some((o) => o.id === selectedIntegration)) {
      setSelectedIntegration(opts[0].id);
    }
  }, [marketplaceOptionsInfo.options, selectedIntegration]);

  const hasDetectedIntegrations = siteIntegrations.length > 0 || businessPackItems.length > 0;

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
                <span className="text-foreground/90">Fokus är din sajt:</span> vad som hittas i den aktiva
                versionens kod (och manifest om det finns), samt vilka nycklar som är satta i projektets
                miljövariabler. Ren heuristik kan ge falska träffar — använd fliken Miljövariabler för
                verifierade värden. Under &quot;Felsökning&quot; nedan ligger endast Sajtmaskin-serverns
                egen status (påverkar inte den genererade sajten).
                <span className="mt-2 block text-[11px] leading-snug text-muted-foreground/95">
                  <span className="text-foreground/85">Automatisk analys:</span> samma aktiva version
                  läses av för koddetektion, analytics/konvertering och affärsflöden — se sektionerna
                  nedan.
                </span>
              </div>

              {showSetupWizard && hasDetectedIntegrations ? (
                <IntegrationSetupWizard
                  integrations={wizardIntegrations}
                  businessPacks={wizardBusinessPacks}
                  onOpenEnvVars={(keys) => openEnvTab(keys ?? [])}
                  onClose={() => setShowSetupWizard(false)}
                />
              ) : (
                <>
              {hasDetectedIntegrations && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px]"
                    onClick={() => setShowSetupWizard(true)}
                  >
                    Visa installationsguide
                  </Button>
                </div>
              )}

              <div className="border-border rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <div className="text-foreground text-xs font-medium">Koddetektion (heuristik)</div>
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-200">automatisk</span>
                </div>
                <div className="text-muted-foreground mt-1 text-[11px]">
                  Heuristiskt detekterat från koden i den valda versionen. Om{" "}
                  <code className="text-[10px]">sajtmaskin.integration-manifest.json</code> finns används den
                  som primär lista (pålitligare än enbart mönster i koden). ORM-lager (t.ex. Prisma) är inte
                  samma sak som en hostad databas — röd status gäller bara när listade nycklar saknas i
                  projektets miljö.
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

              {analyticsReview ? (
                <div className="border-border rounded-md border p-2">
                  <div className="text-foreground text-xs font-medium">Analytics & konvertering</div>
                  <div className="mt-2 space-y-2 text-xs">
                    <div
                      className={cn(
                        "rounded-md border p-2",
                        analyticsReview.passed
                          ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-100"
                          : "border-amber-500/20 bg-amber-500/5 text-amber-100",
                      )}
                    >
                      <div className="font-medium">
                        {analyticsReview.passed
                          ? "Tracking-baseline ser rimlig ut."
                          : `${analyticsReview.issues.length} tracking-varning(ar) hittades.`}
                      </div>
                      <div className="mt-1 text-[11px]">
                        Tracker hittad: {analyticsReview.signals.trackerDetected ? "ja" : "nej"} •
                        konverteringsytor: {analyticsReview.signals.conversionSurfaceCount} • events:{" "}
                        {analyticsReview.signals.conversionEventCount}
                      </div>
                    </div>

                    {trackerIntegrations.length > 0 ? (
                      <div className="space-y-2">
                        {trackerIntegrations.map((integration) => (
                          <div key={`tracker:${integration.key}`} className="border-border rounded-md border p-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-gray-200">{integration.name}</span>
                              <span
                                className={cn(
                                  "text-[11px]",
                                  integration.isConfigured ? "text-green-400" : "text-amber-300",
                                )}
                              >
                                {integration.statusLabel}
                              </span>
                            </div>
                            {integration.envVars.length > 0 ? (
                              <div className="text-muted-foreground mt-1 text-[11px]">
                                Behöver: {integration.envVars.join(", ")}
                              </div>
                            ) : null}
                            {integration.missingEnvVars.length > 0 ? (
                              <div className="mt-1 text-[11px] text-amber-200">
                                Saknas här: {integration.missingEnvVars.join(", ")}
                              </div>
                            ) : null}
                            {integration.envVars.length > 0 ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="mt-2 h-7 px-2 text-[11px]"
                                onClick={() =>
                                  openEnvTab(
                                    integration.missingEnvVars.length > 0
                                      ? integration.missingEnvVars
                                      : integration.envVars,
                                  )
                                }
                              >
                                Öppna miljövariabler
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : analyticsReview.signals.conversionSurfaceCount > 0 ? (
                      <div className="rounded-md border border-dashed p-2 text-[11px] text-muted-foreground">
                        Sidan verkar ha CTA-/formulärflöden men ingen tydlig tracker stack hittades ännu.
                      </div>
                    ) : null}

                    {analyticsReview.issues.length > 0 ? (
                      <div className="rounded-md border border-border/60 bg-background/40 p-2 text-[11px] text-muted-foreground">
                        <div className="mb-1 font-medium text-foreground">Behöver åtgärdas</div>
                        <ul className="space-y-1">
                          {analyticsReview.issues.slice(0, 4).map((issue) => (
                            <li key={`analytics-issue:${issue.code}`}>- {issue.message}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {businessPackItemsPrimary.length > 0 || businessPackItemsExtra.length > 0 ? (
                <div className="border-border rounded-md border p-2">
                  <div className="text-foreground text-xs font-medium">Business workflow packs</div>
                  <div className="text-muted-foreground mt-1 text-[11px]">
                    Rekommenderade paket utifrån kod och signalstyrka (svagare förslag kan döljas under
                    «Fler förslag»).
                  </div>
                  {businessPackItemsPrimary.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {businessPackItemsPrimary.map((pack) => (
                        <div key={pack.id} className="border-border rounded-md border p-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-gray-200">{pack.label}</span>
                            <span
                              className={cn(
                                "text-[11px]",
                                pack.isConfigured
                                  ? "text-green-400"
                                  : pack.envVars.length === 0
                                    ? "text-amber-300"
                                    : "text-red-400",
                              )}
                            >
                              {pack.statusLabel}
                            </span>
                          </div>
                          <div className="text-muted-foreground mt-0.5">{pack.description}</div>
                          {pack.recommendedIntegrations.length > 0 ? (
                            <div className="text-muted-foreground mt-1 text-[11px]">
                              Rekommenderat: {pack.recommendedIntegrations.join(", ")}
                            </div>
                          ) : null}
                          {pack.envVars.length > 0 ? (
                            <div className="text-muted-foreground mt-1 text-[11px]">
                              Behöver: {pack.envVars.join(", ")}
                            </div>
                          ) : null}
                          {pack.missingEnvVars.length > 0 ? (
                            <div className="mt-1 text-[11px] text-amber-200">
                              Saknas här: {pack.missingEnvVars.join(", ")}
                            </div>
                          ) : null}
                          {pack.verificationChecklist.length > 0 ? (
                            <div className="mt-2 rounded-md border border-border/60 bg-background/40 p-2 text-[11px] text-muted-foreground">
                              <div className="mb-1 font-medium text-foreground">Verifiera efter deploy:</div>
                              <ul className="space-y-1">
                                {pack.verificationChecklist.map((item) => (
                                  <li key={`${pack.id}:${item}`}>- {item}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {pack.envVars.length > 0 ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="mt-2 h-7 px-2 text-[11px]"
                              onClick={() =>
                                openEnvTab(pack.missingEnvVars.length > 0 ? pack.missingEnvVars : pack.envVars)
                              }
                            >
                              Öppna miljövariabler
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {businessPackItemsExtra.length > 0 ? (
                    <details
                      className="group border-border mt-2 rounded-md border border-dashed bg-muted/20 p-2"
                      open={businessPackItemsPrimary.length === 0}
                    >
                      <summary className="cursor-pointer list-none text-xs font-medium text-gray-200 marker:content-none [&::-webkit-details-marker]:hidden">
                        <span className="inline-flex items-center gap-2">
                          Fler förslag (svagare signal)
                          <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform group-open:rotate-180" />
                        </span>
                      </summary>
                      <div className="mt-2 space-y-2">
                        {businessPackItemsExtra.map((pack) => (
                          <div key={pack.id} className="border-border rounded-md border p-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-gray-200">{pack.label}</span>
                              <span
                                className={cn(
                                  "text-[11px]",
                                  pack.isConfigured
                                    ? "text-green-400"
                                    : pack.envVars.length === 0
                                      ? "text-amber-300"
                                      : "text-red-400",
                                )}
                              >
                                {pack.statusLabel}
                              </span>
                            </div>
                            <div className="text-muted-foreground mt-0.5">{pack.description}</div>
                            {pack.recommendedIntegrations.length > 0 ? (
                              <div className="text-muted-foreground mt-1 text-[11px]">
                                Rekommenderat: {pack.recommendedIntegrations.join(", ")}
                              </div>
                            ) : null}
                            {pack.envVars.length > 0 ? (
                              <div className="text-muted-foreground mt-1 text-[11px]">
                                Behöver: {pack.envVars.join(", ")}
                              </div>
                            ) : null}
                            {pack.missingEnvVars.length > 0 ? (
                              <div className="mt-1 text-[11px] text-amber-200">
                                Saknas här: {pack.missingEnvVars.join(", ")}
                              </div>
                            ) : null}
                            {pack.verificationChecklist.length > 0 ? (
                              <div className="mt-2 rounded-md border border-border/60 bg-background/40 p-2 text-[11px] text-muted-foreground">
                                <div className="mb-1 font-medium text-foreground">Verifiera efter deploy:</div>
                                <ul className="space-y-1">
                                  {pack.verificationChecklist.map((item) => (
                                    <li key={`${pack.id}-extra:${item}`}>- {item}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                            {pack.envVars.length > 0 ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="mt-2 h-7 px-2 text-[11px]"
                                onClick={() =>
                                  openEnvTab(
                                    pack.missingEnvVars.length > 0 ? pack.missingEnvVars : pack.envVars,
                                  )
                                }
                              >
                                Öppna miljövariabler
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              ) : null}

              {isRealProject ? (
                <div className="border-border mt-2 rounded-md border p-2">
                  <div className="flex items-center gap-2">
                    <div className="text-foreground text-xs font-medium">Valfria providers (Marketplace)</div>
                    <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[9px] text-purple-200">valfri</span>
                  </div>
                  {strategy && (
                    <div className="text-muted-foreground mt-1 text-[11px]">
                      Du hanterar och bekostar integrationen själv.{" "}
                      <span className="text-foreground/90">
                        Valfritt: koppla Neon, Supabase eller Upstash till <em>ditt</em> Vercel-projekt via
                        Marketplace — oberoende av Sajtmaskin-appens egen databas.
                      </span>
                    </div>
                  )}
                  {marketplaceOptionsInfo.isFilteredSubset && (
                    <div className="text-muted-foreground mt-2 text-[11px]">
                      Listan är filtrerad utifrån vad som verkar användas i den aktiva versionen (t.ex. Supabase
                      om detekterat).
                    </div>
                  )}
                  {marketplaceOptionsInfo.fallbackToFullList && integrationOptions.length > 0 && (
                    <div className="text-muted-foreground mt-2 text-[11px]">
                      Ingen tydlig match i koden ännu — alla valfria marketplace-providers visas.
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      value={selectedIntegration}
                      onChange={(event) => setSelectedIntegration(event.target.value)}
                      className="border-border bg-background h-8 min-w-[160px] rounded-md border px-2 text-xs"
                    >
                      {marketplaceOptionsInfo.options.length === 0 && (
                        <option value="">Välj provider när alternativ finns</option>
                      )}
                      {marketplaceOptionsInfo.options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleStartMarketplaceInstall}
                      disabled={isStartingInstall || !selectedIntegration}
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

              {integrationError && (
                <div className="text-muted-foreground text-xs">
                  Kunde inte hämta serverstatus för felsökningspanelen.
                </div>
              )}
              {!showDiagnostics ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2 h-7 text-[11px]"
                  onClick={() => setShowDiagnostics(true)}
                >
                  Visa felsökning (Sajtmaskin-server & MCP)
                </Button>
              ) : (
                <details className="border-border group mt-2 rounded-md border p-2" open>
                  <summary className="cursor-pointer list-none text-left text-xs font-medium text-gray-200 marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="inline-flex items-center gap-2">
                      Felsökning: Sajtmaskin-server &amp; MCP
                      <span className="rounded-full border border-slate-500/30 bg-slate-500/10 px-1.5 py-0.5 text-[9px] text-slate-200">
                        valfritt
                      </span>
                      <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform group-open:rotate-180" />
                    </span>
                  </summary>
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => setShowDiagnostics(false)}
                    >
                      Dölj felsökning
                    </Button>
                  </div>
                  <div className="text-muted-foreground mt-2 text-[11px]">
                    Här visas hur Sajtmaskin-appens backend är konfigurerad (t.ex. appens Postgres, OpenAI).
                    Det är inte samma sak som databaser eller API:er i <em>din</em> genererade sajt — öppna bara
                    om du felsöker själva plattformen. Samma sektion samlar MCP-prioritering för utvecklingsverktyg.
                  </div>
                  {integrationStatus && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="text-foreground text-xs font-medium">Plattformens status</div>
                        <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[9px] text-sky-200">
                          verifierad
                        </span>
                      </div>
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
                          <div key={item.id} className="border-border rounded-md border p-2 text-xs">
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

                  {mcpPriorities.length > 0 && (
                    <div className="border-border mt-2 rounded-md border border-dashed p-2">
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
                                  item.readiness === "ready" ? "text-emerald-300" : "text-amber-300",
                                )}
                              >
                                {item.readiness === "ready" ? "redo" : "saknar miljövariabler"}
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
                </details>
              )}
                </>
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

              {appProjectId && !hasRealExternalProject && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-100">
                  Egna motorn sparar dessa projektvariabler i Sajtmaskins projektdata och skickar dem
                  vidare vid publicering. När ett riktigt externt projekt finns används dess projektvariabler i
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
                  behöva, men själva projektvariablerna kan först sättas när ett riktigt externt projekt skapas.
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
