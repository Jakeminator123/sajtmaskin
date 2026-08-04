import { useEffect, useState } from "react";
import useSWR from "swr";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { useVersions } from "@/lib/hooks/useVersions";
import type { PreviewStatusApiJson } from "@/lib/gen/preview/preview-contract";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/auth-store";
import type {
  AcceptRepairResponse,
  BlobExportResponse,
  PinVersionResponse,
  RestoreVersionResponse,
  VersionHistoryProps,
  VersionSummary,
} from "./types";
import { buildVersionLabelMap, versionRowSortKey } from "./helpers";

export function useVersionHistoryActions({
  chatId,
  selectedVersionId,
  activePreviewSessionId = null,
  onVersionSelect,
  onPreviewResync,
  versions: externalVersions,
  mutateVersions: externalMutate,
}: Pick<
  VersionHistoryProps,
  | "chatId"
  | "selectedVersionId"
  | "activePreviewSessionId"
  | "onVersionSelect"
  | "onPreviewResync"
  | "versions"
  | "mutateVersions"
>) {
  const { user, isAuthenticated, hasGitHub, isInitialized, fetchUser } = useAuth();
  // Use parent-provided versions when available to avoid duplicate polling
  const internal = useVersions(chatId, { enabled: !externalVersions });
  const versions = externalVersions ?? internal.versions;
  const isLoading = externalVersions ? false : internal.isLoading;
  const mutate = externalMutate ?? internal.mutate;
  const versionList = Array.isArray(versions) ? (versions as VersionSummary[]) : [];
  const pinnedCount = versionList.filter((version) => Boolean(version?.pinned)).length;
  // Highest sort key in the list — a row is "latest" (no newer version
  // exists) when its key matches this. Feeds the bus display-context.
  const latestRowSortKey = versionList.reduce(
    (max, entry) => Math.max(max, versionRowSortKey(entry)),
    Number.NEGATIVE_INFINITY,
  );
  const versionLabelById = buildVersionLabelMap(versionList);
  // Repair-handoff (P10): a server repair that reached `repair_available` does
  // NOT swap the active preview until the user accepts it — easy to miss when
  // the only signal is a transient toast. Surface a prominent banner at the top
  // of the list and route its CTA to the newest pending-repair version.
  const pendingRepairVersions = versionList.filter(
    (version) =>
      version.hasPendingRepair === true ||
      version.verificationState === "repair_available",
  );
  const primaryRepairVersion = pendingRepairVersions.reduce<VersionSummary | null>(
    (best, version) =>
      !best || versionRowSortKey(version) > versionRowSortKey(best) ? version : best,
    null,
  );
  const [downloadingVersionId, setDownloadingVersionId] = useState<string | null>(null);
  const [exportingVersionId, setExportingVersionId] = useState<string | null>(null);
  const [githubExportVersionId, setGithubExportVersionId] = useState<string | null>(null);
  const [disconnectingGitHub, setDisconnectingGitHub] = useState(false);
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
      toast.success("Bilder exporterade till bildlagring");
    } catch (error) {
      console.error("Blob export error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to export");
    } finally {
      setExportingVersionId(null);
    }
  };

  const handleOpenGitHubExport = (e: React.MouseEvent, version: VersionSummary) => {
    e.stopPropagation();
    const versionId = version.id || version.versionId || null;
    if (!versionId) return;
    // The dialog handles the login / not-connected / repo-name / privacy flow.
    setGithubExportVersionId(versionId);
  };

  const handleDisconnectGitHub = async () => {
    if (disconnectingGitHub) return;
    if (
      !window.confirm(
        "Koppla från GitHub? Du kan koppla igen när som helst, men export kräver en ny koppling.",
      )
    ) {
      return;
    }
    setDisconnectingGitHub(true);
    try {
      const res = await fetch("/api/auth/github/disconnect", { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || `Kunde inte koppla från GitHub (HTTP ${res.status})`);
      }
      await fetchUser();
      toast.success("GitHub frånkopplat");
    } catch (error) {
      console.error("GitHub disconnect error:", error);
      toast.error(error instanceof Error ? error.message : "Kunde inte koppla från GitHub");
    } finally {
      setDisconnectingGitHub(false);
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
      await Promise.resolve(mutate());
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
      await Promise.resolve(mutate());
      // Fas 4: tvinga en re-push av preview-sessionen mot den nya (återställda)
      // versionen EFTER att versionslistan refetchats (så raden finns när
      // bootstrap-effekten kör). Utan detta kunde preview:n bli kvar på den
      // gamla/trasiga VM-sessionen (prod-fall: v3 aktiv i DB, VM körde v2).
      if (data?.versionId) {
        onPreviewResync?.(String(data.versionId));
      }
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
      await Promise.resolve(mutate());
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

  return {
    user,
    isAuthenticated,
    hasGitHub,
    versions,
    isLoading,
    mutate,
    versionList,
    pinnedCount,
    latestRowSortKey,
    versionLabelById,
    pendingRepairVersions,
    primaryRepairVersion,
    downloadingVersionId,
    exportingVersionId,
    githubExportVersionId,
    setGithubExportVersionId,
    disconnectingGitHub,
    pinningVersionId,
    diagnosticsVersionId,
    setDiagnosticsVersionId,
    compareVersionId,
    setCompareVersionId,
    collaborationVersionId,
    setCollaborationVersionId,
    confirmRestoreVersion,
    setConfirmRestoreVersion,
    restoringVersionId,
    acceptingRepairVersionId,
    returnTo,
    syncingElapsed,
    showLocalTimes,
    collaborationSummaries,
    selectedPreviewStatus,
    formatVersionTime,
    handleDownload,
    handleExportToBlob,
    handleOpenGitHubExport,
    handleDisconnectGitHub,
    handleTogglePin,
    performRestore,
    handleRestoreClick,
    handleAcceptRepair,
  };
}
