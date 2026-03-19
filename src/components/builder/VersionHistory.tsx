"use client";

import { useEffect, useState } from "react";
import {
  resolveEngineVersionDisplayStatus,
  resolveQualityTier,
} from "@/lib/db/engine-version-lifecycle";
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Github,
  Loader2,
  MessageSquare,
  Pin,
  RotateCcw,
  UploadCloud,
} from "lucide-react";
import useSWR from "swr";
import { useVersions } from "@/lib/hooks/useVersions";
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
  demoUrl?: string | null;
  createdAt?: string | Date | null;
  versionNumber?: number | null;
  releaseState?: string | null;
  verificationState?: string | null;
  verificationSummary?: string | null;
  promotedAt?: string | Date | null;
  pinned?: boolean;
  canPin?: boolean;
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

interface VersionHistoryProps {
  chatId: string | null;
  selectedVersionId: string | null;
  onVersionSelect: (versionId: string, demoUrl?: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Pre-fetched versions from parent to avoid duplicate polling */
  versions?: VersionSummary[];
  /** Mutate function from parent's useVersions instance */
  mutateVersions?: () => void;
}

export function VersionHistory({
  chatId,
  selectedVersionId,
  onVersionSelect,
  isCollapsed = false,
  onToggleCollapse,
  versions: externalVersions,
  mutateVersions: externalMutate,
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
  const [returnTo, setReturnTo] = useState("/projects");
  const [syncingElapsed, setSyncingElapsed] = useState(false);
  const [showLocalTimes, setShowLocalTimes] = useState(false);

  const collaborationVersionIds = versionList
    .map((v) => (typeof v.id === "string" ? v.id : typeof v.versionId === "string" ? v.versionId : null))
    .filter((id): id is string => !!id);
  const { data: collaborationData } = useSWR<{ summaries?: Record<string, { approvalStatus: string | null; unresolvedCount: number }> }>(
    chatId && collaborationVersionIds.length > 0
      ? `/api/v0/chats/${chatId}/versions/collaboration-summaries?versionIds=${encodeURIComponent(collaborationVersionIds.join(","))}`
      : null,
    async (url) => {
      const res = await fetch(url);
      if (!res.ok) return { summaries: {} };
      return res.json();
    },
    { revalidateOnFocus: false, dedupingInterval: 10000 },
  );
  const collaborationSummaries = collaborationData?.summaries ?? {};

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
      window.open(`/api/v0/chats/${chatId}/versions/${versionId}/download?format=zip`, "_blank");
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
      const res = await fetch(`/api/v0/chats/${chatId}/versions/${versionId}/export?format=zip`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => null)) as BlobExportResponse | null;
      if (!res.ok) {
        const message = data?.error || `Export failed (HTTP ${res.status})`;
        throw new Error(String(message));
      }

      const url = data?.blob?.url;
      if (url) {
        window.open(url, "_blank");
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
        window.open(url, "_blank");
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
      const res = await fetch(`/api/v0/chats/${chatId}/versions`, {
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
      const res = await fetch(`/api/v0/chats/${chatId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: rollbackMode ? "rollback" : "restore", versionId }),
      });
      const data = (await res.json().catch(() => null)) as RestoreVersionResponse | null;
      if (!res.ok) {
        throw new Error(data?.error || `Restore failed (HTTP ${res.status})`);
      }
      if (data?.versionId) {
        onVersionSelect(String(data.versionId), data.demoUrl ?? undefined);
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
          <div>
            <h3 className="font-semibold">Version History</h3>
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
                <Github className="h-3 w-3" />
                GitHub kopplat{user?.github_username ? ` • @${user.github_username}` : ""}
              </Badge>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  window.open(`/api/auth/github?returnTo=${encodeURIComponent(returnTo)}`, "_blank")
                }
                className="h-7 px-2 text-xs"
              >
                <Github className="h-3 w-3" />
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
            const lifecycleStatus = resolveEngineVersionDisplayStatus(
              {
                versionId: version.versionId,
                id: version.id,
                createdAt: version.createdAt,
                versionNumber: version.versionNumber,
                releaseState: version.releaseState,
                verificationState: version.verificationState,
              },
              versionList.map((entry) => ({
                versionId: entry.versionId,
                id: entry.id,
                createdAt: entry.createdAt,
                versionNumber: entry.versionNumber,
                releaseState: entry.releaseState,
                verificationState: entry.verificationState,
              })),
              { hasDemoUrl: Boolean(version.demoUrl) },
            );
            const lifecycleLabel =
              lifecycleStatus === "promoted"
                ? "Promoted"
                : lifecycleStatus === "preview-ready"
                  ? "Preview-klar"
                  : lifecycleStatus === "verifying"
                    ? "Verifying"
                    : lifecycleStatus === "retrying"
                      ? "Omtag"
                      : lifecycleStatus === "failed"
                        ? "Fel"
                        : "Draft";
            const lifecycleBadgeVariant =
              lifecycleStatus === "failed"
                ? "destructive"
                : lifecycleStatus === "preview-ready"
                  ? "outline"
                  : lifecycleStatus === "promoted"
                    ? "default"
                    : lifecycleStatus === "retrying"
                      ? "outline"
                      : "secondary";
            const lifecycleBadgeClassName =
              lifecycleStatus === "retrying" || lifecycleStatus === "preview-ready"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : undefined;
            const qualityTier = resolveQualityTier(
              {
                releaseState: version.releaseState,
                verificationState: version.verificationState,
              },
              { hasDemoUrl: Boolean(version.demoUrl) },
            );
            const qualityTierLabel =
              qualityTier === "production"
                ? "Produktionsklar"
                : qualityTier === "sandbox"
                  ? "Sandbox-klar"
                  : qualityTier === "preview"
                    ? "Preview-klar"
                    : null;
            const qualityTierBadgeClass =
              qualityTier === "production"
                ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300"
                : qualityTier === "sandbox"
                  ? "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                  : qualityTier === "preview"
                    ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300"
                    : undefined;
            const lifecycleSummary = (() => {
              const summary =
                typeof version.verificationSummary === "string" &&
                version.verificationSummary.trim()
                  ? version.verificationSummary.trim()
                  : null;
              if (lifecycleStatus === "retrying") {
                return "Ersatt av ett senare omtag efter verifieringsfel.";
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
                      <div className="mb-1 flex items-center gap-2">
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
                        >
                          {lifecycleStatus === "verifying" && (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          )}
                          {lifecycleStatus === "retrying" && <RotateCcw className="h-3 w-3" />}
                          {lifecycleLabel}
                        </Badge>
                        {qualityTierLabel && (
                          <Badge
                            variant="outline"
                            className={cn("px-1.5 py-0 text-[10px]", qualityTierBadgeClass)}
                          >
                            {qualityTierLabel}
                          </Badge>
                        )}
                        {isPinned && (
                          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
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
                      {version.demoUrl && (
                        <p
                          className="text-muted-foreground truncate text-xs"
                          title={version.demoUrl}
                        >
                          {version.demoUrl}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    {version.demoUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        onClick={(e) => e.stopPropagation()}
                        className="h-7 px-2 text-xs"
                      >
                        <a href={version.demoUrl} target="_blank" rel="noopener noreferrer">
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
                        <Github className="h-3 w-3" />
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
