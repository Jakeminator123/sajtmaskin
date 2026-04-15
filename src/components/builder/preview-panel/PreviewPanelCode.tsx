"use client";

import type { ComponentProps, ReactNode, RefObject } from "react";
import { ElementRegistry } from "@/components/builder/ElementRegistry";
import { FileExplorer } from "@/components/builder/FileExplorer";
import type { FileNode } from "@/lib/builder/types";

type RegistryItem = Parameters<NonNullable<ComponentProps<typeof ElementRegistry>["onSelect"]>>[0];

interface PreviewPanelCodeProps {
  showElementRegistry: boolean;
  elementRegistry: ComponentProps<typeof ElementRegistry>["items"];
  selectedRegistryId: ComponentProps<typeof ElementRegistry>["selectedId"];
  filesLoading: boolean;
  filesError: string | null;
  onRegistrySelect: (item: RegistryItem) => void;
  files: FileNode[];
  selectedPath: string | null;
  onFileSelect: (file: FileNode) => void;
  codeScrollRef: RefObject<HTMLDivElement | null>;
  selectedFile: FileNode | null;
  headerActions: ReactNode;
  children: ReactNode;
}

export function PreviewPanelCode({
  showElementRegistry,
  elementRegistry,
  selectedRegistryId,
  filesLoading,
  filesError,
  onRegistrySelect,
  files,
  selectedPath,
  onFileSelect,
  codeScrollRef,
  selectedFile,
  headerActions,
  children,
}: PreviewPanelCodeProps) {
  return (
    <div className="flex flex-1 overflow-hidden bg-background">
      <div className="w-64 border-r border-border bg-muted/25">
        {showElementRegistry ? (
          <ElementRegistry
            items={elementRegistry}
            selectedId={selectedRegistryId}
            isLoading={filesLoading}
            error={filesError}
            onSelect={onRegistrySelect}
          />
        ) : (
          <FileExplorer
            files={files}
            selectedPath={selectedPath}
            onFileSelect={onFileSelect}
            isLoading={filesLoading}
            error={filesError}
          />
        )}
      </div>
      <div ref={codeScrollRef} className="flex-1 overflow-auto p-4">
        {!selectedFile ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Ingen fil vald</div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-foreground/90">{selectedFile.path}</div>
              <div className="flex flex-wrap items-center gap-2">{headerActions}</div>
            </div>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
