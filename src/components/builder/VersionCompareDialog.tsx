"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { diffFiles, resolvePreviousVersionId, type FileDiff } from "@/lib/hooks/chat/post-checks-diff";
import type { FileEntry } from "@/lib/hooks/chat/types";

type VersionSummary = {
  id?: string | null;
  versionId?: string | null;
  createdAt?: string | Date | null;
};

type Props = {
  chatId: string | null;
  versionId: string | null;
  versions: VersionSummary[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function normalizeVersionId(version: VersionSummary): string | null {
  return version.versionId || version.id || null;
}

async function fetchVersionFiles(chatId: string, versionId: string, signal: AbortSignal): Promise<FileEntry[]> {
  const response = await fetch(
    `/api/v0/chats/${encodeURIComponent(chatId)}/files?versionId=${encodeURIComponent(versionId)}&wait=1`,
    { signal },
  );
  const data = (await response.json().catch(() => null)) as { files?: FileEntry[]; error?: string } | null;
  if (!response.ok) {
    throw new Error(data?.error || `Failed to fetch files (HTTP ${response.status})`);
  }
  return Array.isArray(data?.files) ? data.files : [];
}

export function VersionCompareDialog({ chatId, versionId, versions, open, onOpenChange }: Props) {
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previousVersionId = useMemo(() => {
    if (!versionId) return null;
    return resolvePreviousVersionId(
      versionId,
      versions.map((version) => ({
        ...version,
        createdAt:
          version.createdAt instanceof Date
            ? version.createdAt.toISOString()
            : version.createdAt ?? null,
      })),
    );
  }, [versionId, versions]);

  useEffect(() => {
    if (!open || !chatId || !versionId || !previousVersionId) {
      setDiff(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [currentFiles, previousFiles] = await Promise.all([
          fetchVersionFiles(chatId, versionId, controller.signal),
          fetchVersionFiles(chatId, previousVersionId, controller.signal),
        ]);
        if (!isActive) return;
        setDiff(diffFiles(previousFiles, currentFiles));
      } catch (loadError) {
        if (!isActive) return;
        if (loadError instanceof Error && loadError.name === "AbortError") return;
        setDiff(null);
        setError(loadError instanceof Error ? loadError.message : "Could not compare versions");
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    void load();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [chatId, open, previousVersionId, versionId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Jämför versioner</DialogTitle>
          <DialogDescription>
            Jämför vald version med närmast föregående version i historiken.
          </DialogDescription>
        </DialogHeader>

        {!previousVersionId ? (
          <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
            Det finns ingen tidigare version att jämföra med ännu.
          </div>
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Jämför versioner...
          </div>
        ) : error ? (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : diff ? (
          <ScrollArea className="max-h-[60vh] rounded-md border">
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">+ {diff.added.length} tillagda</Badge>
                <Badge variant="outline">~ {diff.modified.length} ändrade</Badge>
                <Badge variant="outline">- {diff.removed.length} borttagna</Badge>
              </div>

              {([
                ["Tillagda filer", diff.added],
                ["Ändrade filer", diff.modified],
                ["Borttagna filer", diff.removed],
              ] as const).map(([label, items]) => (
                <div key={label} className="rounded-md border border-border/70 bg-background/40 p-3">
                  <div className="mb-2 text-sm font-medium">{label}</div>
                  {items.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Inga filer.</div>
                  ) : (
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {items.slice(0, 50).map((item) => (
                        <li key={`${label}:${item}`}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
