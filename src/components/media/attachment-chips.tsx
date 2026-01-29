"use client";

/**
 * AttachmentChips Component
 * =========================
 *
 * Compact display of attached files above the chat input.
 * Shows thumbnails for images, icons for other files.
 * Collapsible when more than 3 files are attached.
 */

import { useState } from "react";
import {
  X,
  Image as ImageIcon,
  FileText,
  Video,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils/utils";
import type { UploadedFile } from "./file-upload-zone";

interface AttachmentChipsProps {
  files: UploadedFile[];
  onRemove: (fileId: string) => void;
  maxVisible?: number;
  className?: string;
}

export function AttachmentChips({
  files,
  onRemove,
  maxVisible = 3,
  className,
}: AttachmentChipsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (files.length === 0) return null;

  const visibleFiles = isExpanded ? files : files.slice(0, maxVisible);
  const hiddenCount = files.length - maxVisible;
  const hasHidden = hiddenCount > 0 && !isExpanded;

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) {
      return ImageIcon;
    }
    if (mimeType.startsWith("video/")) {
      return Video;
    }
    return FileText;
  };

  const getStatusIcon = (status: UploadedFile["status"]) => {
    switch (status) {
      case "uploading":
        return <Loader2 className="h-3 w-3 animate-spin text-gray-400" />;
      case "success":
        return <CheckCircle className="text-brand-teal h-3 w-3" />;
      case "error":
        return <AlertCircle className="h-3 w-3 text-red-400" />;
    }
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {visibleFiles.map((file) => {
        const Icon = getFileIcon(file.mimeType);
        const isImage = file.mimeType.startsWith("image/") && file.url;

        return (
          <div
            key={file.id}
            className={cn(
              "group relative flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
              file.status === "success" && "bg-gray-800/80 text-gray-300 hover:bg-gray-700",
              file.status === "uploading" && "bg-gray-800/60 text-gray-400",
              file.status === "error" && "border border-red-500/30 bg-red-500/10 text-red-400",
            )}
          >
            {/* Thumbnail or icon */}
            {isImage && file.status === "success" ? (
              <div className="h-5 w-5 shrink-0 overflow-hidden rounded">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={file.url} alt={file.filename} className="h-full w-full object-cover" />
              </div>
            ) : (
              <Icon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
            )}

            {/* Filename */}
            <span className="max-w-[80px] truncate">{file.filename}</span>

            {/* Status */}
            {getStatusIcon(file.status)}

            {/* Remove button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(file.id);
              }}
              className="ml-0.5 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-600"
              title="Ta bort"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}

      {/* Expand/collapse button */}
      {files.length > maxVisible && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 rounded-md bg-gray-800/60 px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-300"
        >
          {hasHidden ? (
            <>
              +{hiddenCount} fler
              <ChevronDown className="h-3 w-3" />
            </>
          ) : (
            <>
              Visa färre
              <ChevronUp className="h-3 w-3" />
            </>
          )}
        </button>
      )}

      {/* Clear all button when multiple files */}
      {files.length > 1 && (
        <button
          onClick={() => files.forEach((f) => onRemove(f.id))}
          className="rounded-md px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
        >
          Rensa alla
        </button>
      )}
    </div>
  );
}
