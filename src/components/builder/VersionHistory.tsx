'use client';

import { useState } from 'react';
import { Clock, Download, ExternalLink, Github, Loader2, Pin, UploadCloud } from 'lucide-react';
import { useVersions } from '@/lib/hooks/useVersions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface VersionHistoryProps {
  chatId: string | null;
  selectedVersionId: string | null;
  onVersionSelect: (versionId: string) => void;
}

export function VersionHistory({ chatId, selectedVersionId, onVersionSelect }: VersionHistoryProps) {
  const { versions, isLoading, mutate } = useVersions(chatId);
  type VersionSummary = {
    id?: string | null;
    versionId?: string | null;
    demoUrl?: string | null;
    createdAt?: string | Date | null;
    pinned?: boolean;
  };
  const versionList = versions as VersionSummary[];
  const pinnedCount = versionList.filter((version) => version.pinned).length;
  const [downloadingVersionId, setDownloadingVersionId] = useState<string | null>(null);
  const [exportingVersionId, setExportingVersionId] = useState<string | null>(null);
  const [exportingGitHubVersionId, setExportingGitHubVersionId] = useState<string | null>(null);
  const [pinningVersionId, setPinningVersionId] = useState<string | null>(null);

  const handleDownload = async (e: React.MouseEvent, version: any) => {
    e.stopPropagation();
    if (!chatId) return;

    const versionId = version.id || version.versionId;
    setDownloadingVersionId(versionId);

    try {
      window.open(`/api/v0/chats/${chatId}/versions/${versionId}/download?format=zip`, '_blank');
      toast.success('Download started');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download');
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
        method: 'POST',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          (data && typeof data === 'object' && (data as any).error) ||
          `Export failed (HTTP ${res.status})`;
        throw new Error(String(message));
      }

      const url = (data as any)?.blob?.url as string | undefined;
      if (url) {
        window.open(url, '_blank');
      }
      toast.success('Exported to Blob');
    } catch (error) {
      console.error('Blob export error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to export');
    } finally {
      setExportingVersionId(null);
    }
  };

  const handleExportToGitHub = async (e: React.MouseEvent, version: any) => {
    e.stopPropagation();
    if (!chatId) return;

    const versionId = version.id || version.versionId;
    const suggestedRepo = `sajtmaskin-${chatId.slice(0, 8)}`;
    const repoInput = window.prompt(
      "GitHub repo (owner/name eller bara namn)",
      suggestedRepo
    );
    if (!repoInput) return;

    const makePrivate = window.confirm("Skapa som privat repo? (OK = privat, Avbryt = public)");

    setExportingGitHubVersionId(versionId);
    try {
      const res = await fetch('/api/github/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
          (data && typeof data === 'object' && (data as any).error) ||
          `GitHub export failed (HTTP ${res.status})`;
        throw new Error(String(message));
      }

      const url = (data as any)?.repoUrl as string | undefined;
      if (url) {
        window.open(url, '_blank');
      }
      toast.success('Exported to GitHub');
    } catch (error) {
      console.error('GitHub export error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to export to GitHub');
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
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId, pinned: nextPinned }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Pin failed (HTTP ${res.status})`);
      }
      toast.success(nextPinned ? 'Version pinned' : 'Version unpinned');
      mutate();
    } catch (error) {
      console.error('Pin error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update pin');
    } finally {
      setPinningVersionId(null);
    }
  };

  if (!chatId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground p-4">
        <p className="text-sm text-center">Send a message to start a project</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading versions...</div>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground p-4">
        <p className="text-sm text-center">No versions yet. Generate a component to create versions.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-semibold">Version History</h3>
        <p className="text-xs text-muted-foreground mt-1">
          {versions.length} version{versions.length !== 1 ? 's' : ''}
          {pinnedCount > 0 ? ` • ${pinnedCount} pinned` : ''}
        </p>
        <p className="text-xs text-muted-foreground">
          Pinned versions är skrivskyddade snapshots. Avpinna för att kunna redigera.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-2">
          {versionList.map((version, index) => {
            const selectableVersionId = version.versionId || version.id || '';
            const internalVersionId =
              typeof version.id === 'string' && version.id.trim()
                ? version.id
                : typeof version.versionId === 'string' && version.versionId.trim()
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
                key={internalVersionId ?? `version-${version.createdAt ?? 'unknown'}-${index}`}
                onClick={() => selectableVersionId && onVersionSelect(selectableVersionId)}
                className={cn(
                  'cursor-pointer transition-colors',
                  isSelected ? 'border-primary bg-primary/5' : 'hover:border-border hover:bg-accent/50'
                )}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {version.createdAt
                            ? new Date(version.createdAt).toLocaleTimeString()
                            : 'Just now'}
                        </span>
                        {isPinned && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Pinned
                          </Badge>
                        )}
                      </div>
                      {version.demoUrl && (
                        <p className="text-xs text-muted-foreground truncate" title={version.demoUrl}>
                          {version.demoUrl}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    {version.demoUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        onClick={(e) => e.stopPropagation()}
                        className="h-7 px-2 text-xs"
                      >
                        <a href={version.demoUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3 mr-1" />
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
                      title={isPinned ? 'Unpin version' : 'Pin version'}
                      className="h-7 w-7"
                    >
                      {isPinning ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Pin className={cn('h-3 w-3', isPinned ? 'text-primary' : '')} />
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
