"use client";

import { useEffect, useState } from "react";
import {
  isServerVerifyExpectedForLifecycle,
  resolveEngineVersionDisplayStatus,
  resolveEngineVersionVerificationSurfaceStatus,
  resolveQualityTier,
} from "@/lib/db/engine-version-lifecycle";
import { isTier2LivePreviewUrl, normalizePreviewUrl } from "@/lib/gen/preview/preview-url-classifier";
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  GitBranch,
  Loader2,
  MessageSquare,
  Pin,
  RotateCcw,
  UploadCloud,
} from "lucide-react";
import useSWR from "swr";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { useVersions } from "@/lib/hooks/useVersions";
import type { PreviewStatusApiJson } from "@/lib/gen/preview/preview-contract";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VersionDiagnosticsDialog } from "@/components/builder/VersionDiagnosticsDialog";
import { VersionCompareDialog } from "@/components/builder/VersionCompareDialog";
import { VersionCollaboration } from "@/components/builder/VersionCollaboration";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/auth-store";

type VersionSummary = {
  id?: string | null;
  versionId?: string | null;
  previewUrl?: string | null;
  demoUrl?: string | null;
  sandboxUrl?: string | null;
  createdAt?: string | Date | null;
  versionNumber?: number | null;
  releaseState?: string | null;
  verificationState?: string | null;
  verificationSummary?: string | null;
  hasPendingRepair?: boolean;
  repairAvailableAt?: string | Date | null;
  promotedAt?: string | Date | null;
  pinned?: boolean;
  canPin?: boolean;
  /**
   * Lifecycle stage from `engine_versions.lifecycle_stage`. Threaded so
   * tooltip/label can tell F2 design rows ("Klar — server-verify körs
   * först vid Bygg integrationer") apart from F3 integrations rows
   * ("Verifying"). When missing, defaults to "design" via
   * `resolveEngineVersionLifecycleStage`.
   */
  lifecycleStage?: string | null;
};

type BlobExportResponse = {
  blob?: {
    url?: string;
  };
  error?: string;
};

type GitHubExportResponse = {
  repoUrl?: string;
  error?: string;
};

type PinVersionResponse = {
  error?: string;
};

type RestoreVersionResponse = {
  success?: boolean;
  versionId?: string | null;
  demoUrl?: string | null;
  error?: string;
};

type AcceptRepairResponse = {
  success?: boolean;
  versionId?: string | null;
  previewUrl?: string | null;
  error?: string;
};

interface VersionHistoryProps {
  chatId: string | null;
  selectedVersionId: string | null;
  activePreviewSessionId?: string | null;
  onVersionSelect: (versionId: string, demoUrl?: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Pre-fetched versions from parent to avoid duplicate polling */
  versions?: VersionSummary[];
  /** Mutate function from parent's useVersions instance */
  mutateVersions?: () => void;
  /**
   * F2 vs F3 lifecycle gate. Forwarded to dialogs (e.g.
   * VersionDiagnosticsDialog) that conditionally render env-panel actions.
   */
  lifecycleStage?: import("@/lib/db/engine-version-lifecycle").EngineVersionLifecycleStage | null;
}

export function VersionHistory({
  chatId,
  selectedVersionId,
  activePreviewSessionId = null,
  onVersionSelect,
  isCollapsed = false,
  onToggleCollapse,
  versions: externalVersions,
  mutateVersions: externalMutate,
  lifecycleStage = null,
}: VersionHistoryProps) {
  const { user, isAuthenticated, hasGitHub, isInitialized, fetchUser } = useAuth();
  // Use parent-provided versions when available to avoid duplicate polling
  const internal = useVersions(chatId, { enabled: !externalVersions });
  const versions = externalVersions ?? internal.versions;
  const isLoading = externalVersions ? false : internal.isLoading;
  const mutate = externalMutate ?? internal.mutate;
  const versionList = Array.isArray(versions) ? (versions as VersionSummary[]) : [];
  const pinnedCount = versionList.filter((version) => Boolean(version?.pinned)).length;
  const [downloadingVersionId, setDownloadingVersionId] = useState<string | null>(null);
  const [exportingVersionId, setExportingVersionId] = useState<string | null>(null);
  const [exportingGitHubVersionId, setExportingGitHubVersionId] = useState<string | null>(null);
  const [pinningVersionId, setPinningVersionId] = useState<string | null>(null);
  const [diagnosticsVersionId, setDiagnosticsVersionId] = useState<string | null>(null);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);
  const [collaborationVersionId, setCollaborationVersionId] = useState<string | null>(null);
  const [confirmRestoreVersion, setConfirmRestoreVersion] = useState<VersionSummary | null>(null);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
  const [acceptingRepairVersionId, setAcceptingRepairVersionId] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState("/projects");
  const [syncingElapsed, setSyncingElapsed] = useState(false);
  const [showLocalTimes, setShowLocalTimes] = useState(false);

  const collaborationVersionIds = versionList
    .map((v) => (typeof v.id === "string" ? v.id : typeof v.versionId === "string" ? v.versionId : null))
    .filter((id): id is string => !!id);
  const { data: collaborationData } = useSWR<{ summaries?: Record<string, { approvalStatus: string | null; unresolvedCount: number }> }>(
    chatId && collaborationVersionIds.length > 0
      ? `${engineChatBaseUrl(chatId)}/versions/collaboration-summaries?versionIds=${encodeURIComponent(collaborationVersionIds.join(","))}`
      : null,
    async (url) => {
      const res = await fetch(url);
      if (!res.ok) return { summaries: {} };
      return res.json();
    },
    { revalidateOnFocus: false, dedupingInterval: 10000 },
  );
  const collaborationSummaries = collaborationData?.summaries ?? {};
  const { data: selectedPreviewStatus } = useSWR<PreviewStatusApiJson | null>(
    chatId && selectedVersionId
      ? `${engineChatBaseUrl(chatId)}/preview-status?versionId=${encodeURIComponent(selectedVersionId)}${
          activePreviewSessionId?.trim()
            ? `&previewSessionId=${encodeURIComponent(activePreviewSessionId.trim())}`
            : ""
        }`
      : null,
    async (url) => {
      const res = await fetch(url);
      if (!res.ok) return null;
      return res.json();
    },
    {
      revalidateOnFocus: false,
      refreshInterval: 15000,
      dedupingInterval: 5000,
    },
  );

  useEffect(() => {
    if (isInitialized) return;
    fetchUser().catch(() => {});
  }, [isInitialized, fetchUser]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    setReturnTo(path || "/projects");
  }, []);

  useEffect(() => {
    setShowLocalTimes(true);
  }, []);

  useEffect(() => {
    if (!chatId || versionList.length > 0) {
      setSyncingElapsed(false);
      return;
    }
    const timer = setTimeout(() => setSyncingElapsed(true), 5000);
    return () => clearTimeout(timer);
  }, [chatId, versionList.length]);

  const formatVersionTime = (value: string | Date | null | undefined): string => {
    if (!value) return "Just now";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "Just now";
    if (!showLocalTimes) {
      return `${date.toISOString().slice(11, 16)} UTC`;
    }
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleDownload = async (e: React.MouseEvent, version: VersionSummary) => {
    e.stopPropagation();
    if (!chatId) return;

    const versionId = version.id || version.versionId || null;
    if (!versionId) return;
    setDownloadingVersionId(versionId);

    try {
      window.open(
        `${engineChatBaseUrl(chatId)}/versions/${encodeURIComponent(versionId)}/download?format=zip`,
        "_blank",
        "noopener,noreferrer",
      );
      toast.success("Download started");
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download");
    } finally {
      setDownloadingVersionId(null);
    }
  };

  const handleExportToBlob = async (e: React.MouseEvent, version: VersionSummary) => {
    e.stopPropagation();
    if (!chatId) return;

    const versionId = version.id || version.versionId || null;
    if (!versionId) return;
    setExportingVersionId(versionId);

    try {
      const res = await fetch(
        `${engineChatBaseUrl(chatId)}/versions/${encodeURIComponent(versionId)}/export?format=zip`,
        { method: "POST" },
      );
      const data = (await res.json().catch(() => null)) as BlobExportResponse | null;
      if (!res.ok) {
        const message = data?.error || `Export failed (HTTP ${res.status})`;
        throw new Error(String(message));
      }

      const url = data?.blob?.url;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      toast.success("Exported to Blob");
    } catch (error) {
      console.error("Blob export error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to export");
    } finally {
      setExportingVersionId(null);
    }
  };

  const handleExportToGitHub = async (e: React.MouseEvent, version: VersionSummary) => {
    e.stopPropagation();
    if (!chatId) return;
    if (!isAuthenticated) {
      toast.error("Logga in för att exportera till GitHub");
      return;
    }
    if (!hasGitHub) {
      toast.error("Koppla GitHub för att exportera");
      return;
    }

    const versionId = version.id || version.versionId || null;
    if (!versionId) return;
    const suggestedRepo = `sajtmaskin-${chatId.slice(0, 8)}`;
    const repoInput = window.prompt("GitHub repo (owner/name eller bara namn)", suggestedRepo);
    if (!repoInput) return;

    const makePrivate = window.confirm("Skapa som privat repo? (OK = privat, Avbryt = public)");

    setExportingGitHubVersionId(versionId);
    try {
      const res = await fetch("/api/github/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          versionId,
          repo: repoInput,
          private: makePrivate,
        }),
      });

      const data = (await res.json().catch(() => null)) as GitHubExportResponse | null;
      if (!res.ok) {
        const message = data?.error || `GitHub export failed (HTTP ${res.status})`;
        throw new Error(String(message));
      }

      const url = data?.repoUrl;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      toast.success("Exported to GitHub");
    } catch (error) {
      console.error("GitHub export error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to export to GitHub");
    } finally {
      setExportingGitHubVersionId(null);
    }
  };

  const handleTogglePin = async (e: React.MouseEvent, version: VersionSummary) => {
    e.stopPropagation();
    if (!chatId) return;

    const versionId = version.id || version.versionId || null;
    if (!versionId) return;
    const nextPinned = !version.pinned;
    setPinningVersionId(versionId);
    try {
      const res = await fetch(`${engineChatBaseUrl(chatId)}/versions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, pinned: nextPinned }),
      });
      const data = (await res.json().catch(() => ({}))) as PinVersionResponse;
      if (!res.ok) {
        throw new Error(data?.error || `Pin failed (HTTP ${res.status})`);
      }
      toast.success(nextPinned ? "Version pinned" : "Version unpinned");
      mutate();
    } catch (error) {
      console.error("Pin error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update pin");
    } finally {
      setPinningVersionId(null);
    }
  };

  const performRestore = async (version: VersionSummary) => {
    if (!chatId) return;
    const versionId = version.id || version.versionId || null;
    if (!versionId) return;
    const rollbackMode =
      version.releaseState === "promoted" || version.verificationState === "passed";
    setRestoringVersionId(versionId);
    try {
      const res = await fetch(`${engineChatBaseUrl(chatId)}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: rollbackMode ? "rollback" : "restore", versionId }),
      });
      const data = (await res.json().catch(() => null)) as RestoreVersionResponse | null;
      if (!res.ok) {
        throw new Error(data?.error || `Restore failed (HTTP ${res.status})`);
      }
      if (data?.versionId) {
        onVersionSelect(String(data.versionId));
      }
      toast.success(rollbackMode ? "Rollback skapade en ny draftversion" : "Version restored som ny draftversion");
      mutate();
      setConfirmRestoreVersion(null);
    } catch (error) {
      console.error("Restore error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to restore version");
    } finally {
      setRestoringVersionId(null);
    }
  };

  const handleRestoreClick = (e: React.MouseEvent, version: VersionSummary) => {
    e.stopPropagation();
    setConfirmRestoreVersion(version);
  };

  const handleAcceptRepair = async (e: React.MouseEvent, version: VersionSummary) => {
    e.stopPropagation();
    if (!chatId) return;

    const versionId = version.id || version.versionId || null;
    if (!versionId) return;
    setAcceptingRepairVersionId(versionId);
    try {
      const res = await fetch(`${engineChatBaseUrl(chatId)}/accept-repair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      const data = (await res.json().catch(() => null)) as AcceptRepairResponse | null;
      if (!res.ok) {
        throw new Error(data?.error || `Accept repair failed (HTTP ${res.status})`);
      }
      toast.success("Serverreparation accepterad och applicerad");
      mutate();
      if (data?.versionId) {
        onVersionSelect(String(data.versionId), data.previewUrl ?? undefined);
      }
    } catch (error) {
      console.error("Accept repair error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to accept repair");
    } finally {
      setAcceptingRepairVersionId(null);
    }
  };

  const canToggleCollapse = typeof onToggleCollapse === "function";

  if (isCollapsed) {
    return (
      <div className="flex h-full flex-col items-center gap-2 py-2">
        {canToggleCollapse && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleCollapse}
            title="Expandera versioner"
            aria-label="Expandera versioner"
            className="h-7 w-7"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
        <span className="text-muted-foreground rotate-90 text-[10px] tracking-wide uppercase">
          Versions
        </span>
      </div>
    );
  }

  if (!chatId) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-4">
        <p className="text-center text-sm">Send a message to start a project</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-border border-b px-4 py-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="mb-2 flex items-center gap-2">
                <Skeleton className="h-3 w-3 rounded-full" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-3 w-3/4" />
              <div className="mt-2 flex gap-1">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-7 w-7 rounded-md" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (versions.length === 0) {
    const showSyncing = Boolean(chatId) && !syncingElapsed;
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-4">
        <p className="text-center text-sm" suppressHydrationWarning>
          {showSyncing
            ? "Synkar versionshistorik..."
            : "Inga versioner ännu. Generera en sida för att skapa en version."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-border border-b px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">Version History</h3>
            <p className="text-muted-foreground mt-1 text-xs">
              {versions.length} version{versions.length !== 1 ? "s" : ""}
              {pinnedCount > 0 ? ` • ${pinnedCount} pinned` : ""}
            </p>
            <p className="text-muted-foreground text-xs">
              Pinned versions är skrivskyddade snapshots. Avpinna för att kunna redigera.
            </p>
          </div>
          {canToggleCollapse && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleCollapse}
              title="Fäll in versioner"
              aria-label="Fäll in versioner"
              className="h-7 w-7"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {isAuthenticated ? (
            hasGitHub ? (
              <Badge variant="secondary" className="gap-1">
                <GitBranch className="h-3 w-3" />
                GitHub kopplat{user?.github_username ? ` • @${user.github_username}` : ""}
              </Badge>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  window.open(
                    `/api/auth/github?returnTo=${encodeURIComponent(returnTo)}`,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
                className="h-7 px-2 text-xs"
              >
                <GitBranch className="h-3 w-3" />
                Koppla GitHub
              </Button>
            )
          ) : (
            <span className="text-muted-foreground">Logga in för att koppla GitHub</span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-2">
          {versionList.map((version, index) => {
            const selectableVersionId = version.versionId || version.id || "";
            const internalVersionId =
              typeof version.id === "string" && version.id.trim()
                ? version.id
                : typeof version.versionId === "string" && version.versionId.trim()
                  ? version.versionId
                  : undefined;
            const isDownloading = downloadingVersionId === internalVersionId;
            const isExporting = exportingVersionId === internalVersionId;
            const isExportingGitHub = exportingGitHubVersionId === internalVersionId;
            const isPinning = pinningVersionId === internalVersionId;
            const isRestoring = restoringVersionId === internalVersionId;
            const isSelected = selectedVersionId === selectableVersionId;
            const isPinned = Boolean(version.pinned);
            const canPin = version.canPin !== false;
            const canRestore = canPin === false;
            const canRollback =
              canRestore &&
              (version.releaseState === "promoted" || version.verificationState === "passed");
            const hasPendingRepair =
              version.hasPendingRepair === true || version.verificationState === "repair_available";
            const isAcceptingRepair = acceptingRepairVersionId === internalVersionId;
            const lifecycleStatus = resolveEngineVersionDisplayStatus(
              {
                versionId: version.versionId,
                id: version.id,
                createdAt: version.createdAt,
                versionNumber: version.versionNumber,
                releaseState: version.releaseState,
                verificationState: version.verificationState,
                lifecycleStage: version.lifecycleStage,
              },
              versionList.map((entry) => ({
                versionId: entry.versionId,
                id: entry.id,
                createdAt: entry.createdAt,
                versionNumber: entry.versionNumber,
                releaseState: entry.releaseState,
                verificationState: entry.verificationState,
                lifecycleStage: entry.lifecycleStage,
              })),
            );
            const willRunServerVerify = isServerVerifyExpectedForLifecycle({
              lifecycleStage: version.lifecycleStage,
            });
            const verificationSurfaceStatus = resolveEngineVersionVerificationSurfaceStatus({
              releaseState: version.releaseState,
              verificationState: version.verificationState,
              lifecycleStage: version.lifecycleStage,
            });
            // Postmortem 2026-04-28: F2 design-versioner kör inte server-verify
            // (`design_preview_skip_verify`) — visa "Klar" istället för
            // "Verifying" för dem så UI inte påstår en bakgrundskörning som
            // aldrig sker. F3-integrationsversioner kör verify aktivt och
            // behåller "Verifying"-labeln.
            const lifecycleLabel =
              lifecycleStatus === "promoted"
                ? "Promoted"
                : lifecycleStatus === "verifying"
                  ? willRunServerVerify
                    ? "Verifying"
                    : "Klar"
                  : lifecycleStatus === "repairing"
                    ? "Repairing"
                    : lifecycleStatus === "repair_available"
                      ? "Repair available"
                    : lifecycleStatus === "retrying"
                      ? "Ersatt"
                      : lifecycleStatus === "failed"
                        ? "Fel"
                        : "Draft";
            // P25b-rest: surface what each lifecycle badge actually means in
            // a hover-tooltip so users don't need to read the runbook to
            // tell "Verifying" (background server-verify still running)
            // apart from "Promoted" (released live) or "Fel" (verifier
            // produced blocking findings — open the diagnostics dialog).
            const lifecycleTooltip =
              lifecycleStatus === "promoted"
                ? "Publicerad live. Klart att deploya."
                : lifecycleStatus === "verifying"
                  ? willRunServerVerify
                    ? "Server-verify kör i bakgrunden — typecheck/build mot scaffold-cache. Kan landa i 'Promoted' eller 'Fel' när den är klar."
                    : "Design-preview klar. Server-verify körs först när du klickar 'Bygg integrationer'."
                  : lifecycleStatus === "repairing"
                    ? "Server försöker reparera fel automatiskt. Vänta — utfallet rapporteras som 'Repair available' eller 'Fel'."
                    : lifecycleStatus === "repair_available"
                      ? "Reparerad version finns sparad och väntar på godkännande. Klicka för att se diff och acceptera."
                      : lifecycleStatus === "retrying"
                        ? "Ersatt av en nyare version innan denna hann verifieras klart."
                        : lifecycleStatus === "failed"
                          ? "Verifiering hittade blockerande fel. Öppna diagnostik-dialogen för detaljer."
                          : "Draft. Inte verifierad eller publicerad än.";
            const lifecycleBadgeVariant =
              lifecycleStatus === "failed"
                ? "destructive"
                : lifecycleStatus === "promoted"
                  ? "default"
                  : lifecycleStatus === "verifying" && !willRunServerVerify
                    ? "secondary"
                    : lifecycleStatus === "retrying" ||
                        lifecycleStatus === "repairing" ||
                        lifecycleStatus === "repair_available"
                      ? "outline"
                      : "secondary";
            const lifecycleBadgeClassName =
              lifecycleStatus === "retrying"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : lifecycleStatus === "repairing"
                  ? "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                  : lifecycleStatus === "repair_available"
                    ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                  : undefined;
            const isEngineVersionRow =
              version.canPin === false || typeof version.versionNumber === "number";
            const tier2PreviewNorm = normalizePreviewUrl(version.previewUrl ?? version.sandboxUrl);
            const hasTier2LivePreviewForRow = Boolean(
              tier2PreviewNorm && isTier2LivePreviewUrl(tier2PreviewNorm),
            );
            const qualityTier = resolveQualityTier(
              {
                releaseState: version.releaseState,
                verificationState: version.verificationState,
              },
              isEngineVersionRow
                ? { hasTier2LivePreviewUrl: hasTier2LivePreviewForRow }
                : { hasDemoUrl: Boolean(version.demoUrl) },
            );
            const listPreviewUrl =
              (tier2PreviewNorm && isTier2LivePreviewUrl(tier2PreviewNorm) ? tier2PreviewNorm : null) ??
              normalizePreviewUrl(version.demoUrl);
            const qualityTierLabel =
              qualityTier === "production"
                ? "Produktionsklar"
                : qualityTier === "tier2"
                  ? "Live-preview klar"
                  : qualityTier === "preview"
                    ? "Preview-URL"
                    : null;
            const qualityTierBadgeClass =
              qualityTier === "production"
                ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300"
                : qualityTier === "tier2"
                  ? "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                  : qualityTier === "preview"
                    ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300"
                    : undefined;
            const verificationBadge =
              verificationSurfaceStatus === "verified"
                ? {
                    label: "Verifierad",
                    title: "Server-verify eller promotion har passerat för denna version.",
                    className:
                      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                  }
                : verificationSurfaceStatus === "design_ready"
                  ? {
                      label: "Design redo",
                      title:
                        "F2-designversion: preview kan vara materialiserad, men server-verify körs först i F3.",
                      className:
                        "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
                    }
                  : verificationSurfaceStatus === "verifying"
                    ? {
                        label: "Verifierar",
                        title: "Server-verify kör fortfarande för denna version.",
                        className:
                          "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
                      }
                    : verificationSurfaceStatus === "repair_available"
                      ? {
                          label: "Fix redo",
                          title:
                            "Serverreparation finns men är inte accepterad ännu.",
                          className:
                            "border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
                        }
                      : verificationSurfaceStatus === "failed"
                        ? {
                            label: "Ej verifierad",
                            title: "Verifiering hittade blockerande fel.",
                            className:
                              "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
                          }
                        : null;
            const runtimeStatusForRow =
              isSelected && isEngineVersionRow ? selectedPreviewStatus?.status ?? null : null;
            const runtimeBadge =
              runtimeStatusForRow === "running"
                ? {
                    label: "VM live",
                    className:
                      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                  }
                : runtimeStatusForRow === "starting"
                  ? {
                      label: "VM startar",
                      className:
                        "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
                    }
                  : runtimeStatusForRow === "stopped"
                    ? {
                        label: "VM stoppad",
                        className:
                          "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                      }
                    : runtimeStatusForRow === "version_mismatch"
                      ? {
                          label: "VM annan version",
                          className:
                            "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300",
                        }
                      : runtimeStatusForRow === "missing"
                        ? {
                            label: "VM saknas",
                            className:
                              "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
                          }
                        : null;
            const lifecycleSummary = (() => {
              const summary =
                typeof version.verificationSummary === "string" &&
                version.verificationSummary.trim()
                  ? version.verificationSummary.trim()
                  : null;
              if (lifecycleStatus === "retrying") {
                return summary || "Ersatt av en nyare version innan denna hann bli klar.";
              }
              if (lifecycleStatus === "repair_available") {
                return summary || "Serverreparation finns sparad och väntar på godkännande.";
              }
              return summary;
            })();

            return (
              <Card
                key={internalVersionId ?? `version-${version.createdAt ?? "unknown"}-${index}`}
                onClick={() => selectableVersionId && onVersionSelect(selectableVersionId)}
                className={cn(
                  "cursor-pointer transition-colors",
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "hover:border-border hover:bg-accent/50",
                )}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Clock className="text-muted-foreground h-3 w-3" />
                        <span className="text-muted-foreground text-xs">
                          {formatVersionTime(version.createdAt)}
                        </span>
                        {typeof version.versionNumber === "number" && (
                          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                            v{version.versionNumber}
                          </Badge>
                        )}
                        <Badge
                          variant={lifecycleBadgeVariant}
                          className={cn("gap-1 px-1.5 py-0 text-[10px]", lifecycleBadgeClassName)}
                          title={lifecycleTooltip}
                        >
                          {(lifecycleStatus === "verifying" || lifecycleStatus === "repairing") && (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          )}
                          {lifecycleStatus === "retrying" && <RotateCcw className="h-3 w-3" />}
                          {lifecycleLabel}
                        </Badge>
                        {qualityTierLabel && (
                          <Badge
                            variant="outline"
                            className={cn("px-1.5 py-0 text-[10px]", qualityTierBadgeClass)}
                            title="Runtime/preview-status: detta säger att en preview-URL eller VM-yta finns, inte att versionen är server-verifierad."
                          >
                            {qualityTierLabel}
                          </Badge>
                        )}
                        {isEngineVersionRow && verificationBadge && (
                          <Badge
                            variant="outline"
                            className={cn("px-1.5 py-0 text-[10px]", verificationBadge.className)}
                            title={verificationBadge.title}
                          >
                            {verificationBadge.label}
                          </Badge>
                        )}
                        {runtimeBadge && (
                          <Badge
                            variant="outline"
                            className={cn("px-1.5 py-0 text-[10px]", runtimeBadge.className)}
                            title={
                              runtimeStatusForRow === "version_mismatch"
                                ? "Preview-VM kör en annan version än den valda. Klicka 'Återställ preview' eller vänta på återstart."
                                : runtimeStatusForRow === "missing"
                                  ? "Ingen aktiv preview-VM för denna version. Starta en ny preview-session från knappraden."
                                  : runtimeStatusForRow === "starting"
                                    ? "Preview-VM startar — `npm install` + `next dev` kör i bakgrunden. Vanligtvis 30–90 s vid kall start."
                                    : runtimeStatusForRow === "stopped"
                                      ? "Preview-VM är stoppad. Starta en ny preview-session från knappraden för att återanvända versionen."
                                      : "Preview-VM körs (Next.js dev-server svarar)."
                            }
                          >
                            {runtimeBadge.label}
                          </Badge>
                        )}
                        {isPinned && (
                          <Badge
                            variant="secondary"
                            className="px-1.5 py-0 text-[10px]"
                            title="Pinnad version — visas alltid överst i listan tills du unpinnar."
                          >
                            Pinned
                          </Badge>
                        )}
                        {internalVersionId && (() => {
                          const s = collaborationSummaries[internalVersionId];
                          const status = s?.approvalStatus ?? null;
                          const unresolved = s?.unresolvedCount ?? 0;
                          return (
                            <>
                              {status === "pending" && (
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
                                  title="Väntar på godkännande"
                                />
                              )}
                              {status === "approved" && (
                                <span title="Godkänd"><CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" /></span>
                              )}
                              {unresolved > 0 && (
                                <Badge
                                  variant="outline"
                                  className="cursor-pointer px-1.5 py-0 text-[10px]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCollaborationVersionId(internalVersionId);
                                  }}
                                >
                                  <MessageSquare className="mr-0.5 h-3 w-3" />
                                  {unresolved}
                                </Badge>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      {lifecycleSummary && lifecycleStatus !== "promoted" && (
                        <p className="text-muted-foreground mb-1 line-clamp-2 text-xs">
                          {lifecycleSummary}
                        </p>
                      )}
                      {listPreviewUrl && (
                        <p
                          className="text-muted-foreground truncate text-xs"
                          title={listPreviewUrl}
                        >
                          {listPreviewUrl}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {listPreviewUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        onClick={(e) => e.stopPropagation()}
                        className="h-7 px-2 text-xs"
                      >
                        <a href={listPreviewUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-1 h-3 w-3" />
                          View
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (internalVersionId) setCompareVersionId(internalVersionId);
                      }}
                      title="Jämför med föregående version"
                      aria-label="Jämför med föregående version"
                      className="h-7 px-2 text-xs"
                    >
                      Compare
                    </Button>
                    {canRestore && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleRestoreClick(e, version)}
                        disabled={isRestoring}
                        title={canRollback ? "Rollback som ny draftversion" : "Återställ som ny draftversion"}
                        aria-label={canRollback ? "Rollback som ny draftversion" : "Återställ som ny draftversion"}
                        className="h-7 px-2 text-xs"
                      >
                        {isRestoring ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="mr-1 h-3 w-3" />
                        )}
                        {canRollback ? "Rollback" : "Restore"}
                      </Button>
                    )}
                    {hasPendingRepair && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleAcceptRepair(e, version)}
                        disabled={isAcceptingRepair || isRestoring}
                        title="Acceptera serverreparation"
                        aria-label="Acceptera serverreparation"
                        className="h-7 px-2 text-xs"
                      >
                        {isAcceptingRepair ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <CheckCircle className="mr-1 h-3 w-3" />
                        )}
                        Acceptera fix
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (internalVersionId) setDiagnosticsVersionId(internalVersionId);
                      }}
                      title="Visa diagnostik"
                      aria-label="Visa diagnostik"
                      className="h-7 w-7"
                    >
                      <AlertCircle className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (internalVersionId) setCollaborationVersionId(internalVersionId);
                      }}
                      title="Kommentarer och godkännande"
                      aria-label="Kommentarer och godkännande"
                      className="h-7 w-7"
                    >
                      <MessageSquare className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => handleDownload(e, version)}
                      disabled={isDownloading}
                      title="Download version"
                      aria-label="Download version"
                      className="h-7 w-7"
                    >
                      {isDownloading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Download className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => handleExportToBlob(e, version)}
                      disabled={isExporting}
                      title="Export to Vercel Blob"
                      aria-label="Export to Vercel Blob"
                      className="h-7 w-7"
                    >
                      {isExporting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <UploadCloud className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => handleExportToGitHub(e, version)}
                      disabled={isExportingGitHub}
                      title="Export to GitHub"
                      aria-label="Export to GitHub"
                      className="h-7 w-7"
                    >
                      {isExportingGitHub ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <GitBranch className="h-3 w-3" />
                      )}
                    </Button>
                    {canPin && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => handleTogglePin(e, version)}
                        disabled={isPinning}
                        title={isPinned ? "Unpin version" : "Pin version"}
                        aria-label={isPinned ? "Unpin version" : "Pin version"}
                        className="h-7 w-7"
                      >
                        {isPinning ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Pin className={cn("h-3 w-3", isPinned ? "text-primary" : "")} />
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
      <VersionDiagnosticsDialog
        chatId={chatId}
        versionId={diagnosticsVersionId}
        open={Boolean(diagnosticsVersionId)}
        onOpenChange={(open) => {
          if (!open) setDiagnosticsVersionId(null);
        }}
        lifecycleStage={lifecycleStage}
      />
      <Dialog
        open={Boolean(confirmRestoreVersion)}
        onOpenChange={(open) => {
          if (!open) setConfirmRestoreVersion(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmRestoreVersion &&
              (confirmRestoreVersion.releaseState === "promoted" ||
                confirmRestoreVersion.verificationState === "passed")
                ? "Bekräfta rollback"
                : "Bekräfta återställning"}
            </DialogTitle>
            <DialogDescription>
              {confirmRestoreVersion &&
              (confirmRestoreVersion.releaseState === "promoted" ||
                confirmRestoreVersion.verificationState === "passed")
                ? "Den här versionen var publicerad. En rollback skapar en ny draft som du kan verifiera och publicera."
                : "En ny draftversion skapas baserad på den valda versionen. Den nuvarande aktiva versionen påverkas inte."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRestoreVersion(null)}>
              Avbryt
            </Button>
            <Button
              onClick={() => confirmRestoreVersion && performRestore(confirmRestoreVersion)}
              disabled={!confirmRestoreVersion || restoringVersionId !== null}
            >
              {restoringVersionId ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : confirmRestoreVersion &&
                (confirmRestoreVersion.releaseState === "promoted" ||
                  confirmRestoreVersion.verificationState === "passed") ? (
                "Rollback"
              ) : (
                "Återställ"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <VersionCompareDialog
        chatId={chatId}
        versionId={compareVersionId}
        versions={versionList}
        open={Boolean(compareVersionId)}
        onOpenChange={(open) => {
          if (!open) setCompareVersionId(null);
        }}
      />
      <Dialog
        open={Boolean(collaborationVersionId)}
        onOpenChange={(open) => {
          if (!open) setCollaborationVersionId(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Kommentarer och godkännande</DialogTitle>
            <DialogDescription>
              Lägg till kommentarer eller hantera godkännandeförfrågningar för denna version.
            </DialogDescription>
          </DialogHeader>
          {chatId && collaborationVersionId && (
            <VersionCollaboration
              chatId={chatId}
              versionId={collaborationVersionId}
              className="mt-2"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
