"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Github,
  Loader2,
  Pin,
  UploadCloud,
} from "lucide-react";
import { useVersions } from "@/lib/hooks/useVersions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth/auth-store";

interface VersionHistoryProps {
  chatId: string | null;
  selectedVersionId: string | null;
  onVersionSelect: (versionId: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Pre-fetched versions from parent to avoid duplicate polling */
  versions?: unknown[];
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
  type VersionSummary = {
    id?: string | null;
    versionId?: string | null;
    demoUrl?: string | null;
    createdAt?: string | Date | null;
    pinned?: boolean;
  };
  const versionList = Array.isArray(versions) ? (versions as VersionSummary[]) : [];
  const pinnedCount = versionList.filter((version) => Boolean(version?.pinned)).length;
  const [downloadingVersionId, setDownloadingVersionId] = useState<string | null>(null);
  const [exportingVersionId, setExportingVersionId] = useState<string | null>(null);
  const [exportingGitHubVersionId, setExportingGitHubVersionId] = useState<string | null>(null);
  const [pinningVersionId, setPinningVersionId] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState("/projects");

  useEffect(() => {
    if (isInitialized) return;
    fetchUser().catch(() => {});
  }, [isInitialized, fetchUser]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    setReturnTo(path || "/projects");
  }, []);

  const handleDownload = async (e: React.MouseEvent, version: any) => {
    e.stopPropagation();
    if (!chatId) return;

    const versionId = version.id || version.versionId;
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

  const handleExportToBlob = async (e: React.MouseEvent, version: any) => {
    e.stopPropagation();
    if (!chatId) return;

    const versionId = version.id || version.versionId;
    setExportingVersionId(versionId);

    try {
      const res = await fetch(`/api/v0/chats/${chatId}/versions/${versionId}/export?format=zip`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          (data && typeof data === "object" && (data as any).error) ||
          `Export failed (HTTP ${res.status})`;
        throw new Error(String(message));
      }

      const url = (data as any)?.blob?.url as string | undefined;
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

  const handleExportToGitHub = async (e: React.MouseEvent, version: any) => {
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

    const versionId = version.id || version.versionId;
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

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          (data && typeof data === "object" && (data as any).error) ||
          `GitHub export failed (HTTP ${res.status})`;
        throw new Error(String(message));
      }

      const url = (data as any)?.repoUrl as string | undefined;
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

  const handleTogglePin = async (e: React.MouseEvent, version: any) => {
    e.stopPropagation();
    if (!chatId) return;

    const versionId = version.id || version.versionId;
    const nextPinned = !version.pinned;
    setPinningVersionId(versionId);
    try {
      const res = await fetch(`/api/v0/chats/${chatId}/versions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, pinned: nextPinned }),
      });
      const data = await res.json().catch(() => ({}));
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
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading versions...</div>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-4">
        <p className="text-center text-sm">
          No versions yet. Generate a component to create versions.
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
            const isSelected = selectedVersionId === selectableVersionId;
            const isPinned = Boolean(version.pinned);

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
                          {version.createdAt
                            ? new Date(version.createdAt).toLocaleTimeString()
                            : "Just now"}
                        </span>
                        {isPinned && (
                          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                            Pinned
                          </Badge>
                        )}
                      </div>
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
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
