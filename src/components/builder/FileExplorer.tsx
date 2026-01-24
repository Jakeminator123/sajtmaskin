"use client";

import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { useState } from "react";
import type { FileNode } from "@/lib/builder/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FileExplorerProps {
  files: FileNode[];
  onFileSelect: (file: FileNode) => void;
  selectedPath: string | null;
  isLoading?: boolean;
  error?: string | null;
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
      <div className="text-muted-foreground flex h-full items-center justify-center p-4">
        <p className="text-center text-sm">Loading files...</p>
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
        <h3 className="font-semibold">Files</h3>
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
