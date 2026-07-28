"use client";

import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { useState } from "react";
import type { FileNode } from "@/lib/builder/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface FileExplorerProps {
  files: FileNode[];
  onFileSelect: (file: FileNode) => void;
  selectedPath: string | null;
  isLoading?: boolean;
  error?: string | null;
}

/**
 * Speglar `PROJECT_ENV_FILE_PATH` i `@/lib/gen/preview/project-env-file`, som
 * inte kan importeras hit (den modulen läser placeholder-kataloger från disk).
 */
const PROJECT_ENV_DOC_PATHS = new Set(["env.example", "./env.example"]);

const PROJECT_ENV_DOC_HINT =
  "Auto-genererad dokumentation. Regenereras vid varje generering — egna ändringar skrivs över, och riktiga värden sparas under Byggblock, inte här.";

function isProjectEnvDocPath(path: string): boolean {
  return PROJECT_ENV_DOC_PATHS.has(path.trim());
}

function FileTreeItem({
  node,
  onFileSelect,
  selectedPath,
  depth = 0,
}: {
  node: FileNode;
  onFileSelect: (file: FileNode) => void;
  selectedPath: string | null;
  depth?: number;
}) {
  const [isExpanded, setIsExpanded] = useState(depth < 2);
  const isSelected = selectedPath === node.path;
  const isFolder = node.type === "folder";
  const isEnvDoc = !isFolder && isProjectEnvDocPath(node.path);

  const handleClick = () => {
    if (isFolder) {
      setIsExpanded(!isExpanded);
    } else {
      onFileSelect(node);
    }
  };

  const getFileIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    const iconColors: Record<string, string> = {
      tsx: "text-brand-blue",
      ts: "text-brand-blue",
      jsx: "text-brand-amber",
      js: "text-brand-amber",
      css: "text-brand-warm",
      json: "text-green-500",
      md: "text-muted-foreground",
    };
    return iconColors[ext || ""] || "text-muted-foreground";
  };

  return (
    <div>
      <Button
        variant="ghost"
        onClick={handleClick}
        className={cn(
          "h-8 w-full justify-start gap-1 px-2 text-sm font-normal",
          isSelected && "bg-primary/10 text-primary",
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        title={isEnvDoc ? PROJECT_ENV_DOC_HINT : undefined}
      >
        {isFolder ? (
          <>
            {isExpanded ? (
              <ChevronDown className="text-muted-foreground h-3 w-3 shrink-0" />
            ) : (
              <ChevronRight className="text-muted-foreground h-3 w-3 shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="text-brand-amber h-4 w-4 shrink-0" />
            ) : (
              <Folder className="text-brand-amber h-4 w-4 shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <File className={cn("h-4 w-4 shrink-0", getFileIcon(node.name))} />
          </>
        )}
        <span className="truncate">{node.name}</span>
        {isEnvDoc && (
          <span
            aria-label={PROJECT_ENV_DOC_HINT}
            className="text-muted-foreground border-border/70 ml-auto shrink-0 rounded border px-1 text-[10px] leading-4 font-normal"
          >
            auto
          </span>
        )}
      </Button>
      {isFolder && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              onFileSelect={onFileSelect}
              selectedPath={selectedPath}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileExplorer({
  files,
  onFileSelect,
  selectedPath,
  isLoading,
  error,
}: FileExplorerProps) {
  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-border border-b px-4 py-3">
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="space-y-1 p-2">
          <div className="flex items-center gap-2 px-2 py-1">
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-3 w-24" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 py-1" style={{ paddingLeft: `${20 + 8}px` }}>
              <Skeleton className="h-3 w-3 shrink-0" />
              <Skeleton className="h-4 w-4 shrink-0 rounded" />
              <Skeleton className="h-3" style={{ width: `${60 + i * 15}px` }} />
            </div>
          ))}
          <div className="flex items-center gap-2 px-2 py-1">
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-3 w-20" />
          </div>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 py-1" style={{ paddingLeft: `${20 + 8}px` }}>
              <Skeleton className="h-3 w-3 shrink-0" />
              <Skeleton className="h-4 w-4 shrink-0 rounded" />
              <Skeleton className="h-3" style={{ width: `${50 + i * 20}px` }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-4">
        <p className="text-center text-sm">{error}</p>
      </div>
    );
  }

  if (!files || files.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-4">
        <p className="text-center text-sm">No files generated yet</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-border border-b px-4 py-3">
        <h3 className="font-semibold">Filer</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {files.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            onFileSelect={onFileSelect}
            selectedPath={selectedPath}
          />
        ))}
      </div>
    </div>
  );
}
