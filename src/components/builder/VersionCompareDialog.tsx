"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { diffFiles, diffFileContents, resolvePreviousVersionId, type FileDiff, type FileContentDiff } from "@/lib/hooks/chat/post-checks-diff";
import type { FileEntry } from "@/lib/hooks/chat/types";
import { cn } from "@/lib/utils";

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
  const [contentDiffs, setContentDiffs] = useState<FileContentDiff[]>([]);
  const [openPaths, setOpenPaths] = useState<Set<string>>(new Set());
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
      setContentDiffs([]);
      setOpenPaths(new Set());
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
        const content = diffFileContents(previousFiles, currentFiles);
        setDiff(diffFiles(previousFiles, currentFiles));
        setContentDiffs(content);
        setOpenPaths(new Set(content.slice(0, 5).map((f) => f.path)));
      } catch (loadError) {
        if (!isActive) return;
        if (loadError instanceof Error && loadError.name === "AbortError") return;
        setDiff(null);
        setContentDiffs([]);
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
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">+ {diff.added.length} tillagda</Badge>
                <Badge variant="outline">~ {diff.modified.length} ändrade</Badge>
                <Badge variant="outline">- {diff.removed.length} borttagna</Badge>
                {contentDiffs.length >= 20 && (
                  <span className="text-muted-foreground text-xs">Visar max 20 filer.</span>
                )}
              </div>
              {contentDiffs.length > 0 ? (
                <div className="space-y-2">
                  {contentDiffs.map((fileDiff) => (
                    <Collapsible
                      key={fileDiff.path}
                      open={openPaths.has(fileDiff.path)}
                      onOpenChange={(o) =>
                        setOpenPaths((prev) => {
                          const next = new Set(prev);
                          if (o) next.add(fileDiff.path);
                          else next.delete(fileDiff.path);
                          return next;
                        })
                      }
                    >
                      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md border border-border/70 bg-background/40 px-3 py-2 text-left hover:bg-muted/30">
                        {openPaths.has(fileDiff.path) ? (
                          <ChevronDown className="h-4 w-4 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0" />
                        )}
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0",
                            fileDiff.type === "added" && "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-300",
                            fileDiff.type === "modified" && "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                            fileDiff.type === "removed" && "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300",
                          )}
                        >
                          {fileDiff.type === "added" ? "+" : fileDiff.type === "removed" ? "-" : "~"}
                        </Badge>
                        <span className="truncate font-mono text-sm">{fileDiff.path}</span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-1 rounded-md border border-border/70 bg-muted/20 font-mono text-xs">
                          {fileDiff.hunks.map((hunk, hunkIdx) => (
                            <div key={hunkIdx}>
                              {hunk.lines.map((line, lineIdx) => (
                                <div
                                  key={lineIdx}
                                  className={cn(
                                    "flex min-w-0 px-2 py-0.5",
                                    line.type === "added" && "bg-green-500/20",
                                    line.type === "removed" && "bg-red-500/20",
                                    line.type === "context" && "bg-muted/10 text-muted-foreground",
                                  )}
                                >
                                  <span className="mr-3 shrink-0 w-6 select-none text-right text-muted-foreground">
                                    {line.lineNumber > 0 ? line.lineNumber : ""}
                                  </span>
                                  <span className="min-w-0 truncate">{line.content || " "}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-border/70 bg-background/40 p-3 text-sm text-muted-foreground">
                  Inga filändringar att visa.
                </div>
              )}
              {diff &&
                diff.added.length + diff.modified.length + diff.removed.length > 20 && (
                  <p className="text-muted-foreground text-xs">
                    Visar max 20 filer. Totalt{" "}
                    {diff.added.length + diff.modified.length + diff.removed.length} filer ändrades.
                  </p>
                )}
              {diff && (diff.added.length + diff.modified.length + diff.removed.length) > 20 && (
                <p className="text-muted-foreground text-xs">
                  Visar max 20 filer av {diff.added.length + diff.modified.length + diff.removed.length} ändringar.
                </p>
              )}
            </div>
          </ScrollArea>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
