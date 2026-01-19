"use client";

/**
 * FileUploadZone Component
 * ========================
 *
 * Drag & drop zone for uploading images and files to include in website generation.
 * Uploaded files are stored in Vercel Blob storage to get PUBLIC URLs that v0 can access.
 *
 * CRITICAL: v0's demoUrl is hosted on Vercel's servers and CANNOT access local files.
 * All images must be uploaded to Vercel Blob (or similar public storage) BEFORE
 * being included in v0 prompts.
 *
 * SUPPORTED FILE TYPES:
 * - Images: jpg, jpeg, png, gif, webp, svg
 * - Documents: pdf (for extracting content/inspiration)
 *
 * UPLOAD FLOW:
 * 1. User drags files or clicks to select
 * 2. Files are IMMEDIATELY uploaded to Vercel Blob via /api/media/upload
 * 3. Public URLs are returned instantly
 * 4. URLs can be included in prompts - v0 can access them!
 */

import { useState, useRef, useCallback } from "react";
import {
  Upload,
  X,
  Image as ImageIcon,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/utils";

// Accepted file types
const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];
const ACCEPTED_DOC_TYPES = ["application/pdf"];
const ACCEPTED_TYPES = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_DOC_TYPES];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;

export interface UploadedFile {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  purpose?: string;
  status: "uploading" | "success" | "error";
  error?: string;
  isPublicUrl?: boolean; // True if URL is publicly accessible (Vercel Blob)
}

export type V0UserFileAttachment = {
  type: "user_file";
  url: string;
  filename: string;
  mimeType?: string;
  size?: number;
  purpose?: string;
};

interface FileUploadZoneProps {
  projectId: string | null;
  onFilesChange: (files: UploadedFile[]) => void;
  files: UploadedFile[];
  disabled?: boolean;
  compact?: boolean; // Smaller version for inline use
}

export function FileUploadZone({
  projectId,
  onFilesChange,
  files,
  disabled = false,
  compact = false,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection
  // CRITICAL: Files are uploaded to Vercel Blob to get PUBLIC URLs
  // v0's preview cannot access local files - must use public URLs!
  const handleFiles = useCallback(
    async (selectedFiles: FileList | null) => {
      if (!selectedFiles || disabled) return;

      const filesToUpload = Array.from(selectedFiles).slice(
        0,
        MAX_FILES - files.length
      );

      for (const file of filesToUpload) {
        // Validate file type
        if (!ACCEPTED_TYPES.includes(file.type)) {
          const errorFile: UploadedFile = {
            id: `error-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            url: "",
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            status: "error",
            error:
              "Filtyp stöds inte. Använd JPG, PNG, GIF, WebP, SVG eller PDF.",
          };
          onFilesChange([...files, errorFile]);
          continue;
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          const errorFile: UploadedFile = {
            id: `error-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            url: "",
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            status: "error",
            error: "Filen är för stor. Max 10MB.",
          };
          onFilesChange([...files, errorFile]);
          continue;
        }

        // Create uploading placeholder
        const uploadingFile: UploadedFile = {
          id: `uploading-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          url: "",
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          status: "uploading",
        };

        const updatedFiles = [...files, uploadingFile];
        onFilesChange(updatedFiles);

        // Upload file to Vercel Blob via media API (gets public URLs!)
        // Use project-specific endpoint if projectId exists, otherwise use general media API
        try {
          const formData = new FormData();
          formData.append("file", file);
          if (projectId) {
            formData.append("projectId", projectId);
          }

          // Use media upload API - it handles Vercel Blob uploads
          // and returns PUBLIC URLs that v0 can access
          const response = await fetch("/api/media/upload", {
            method: "POST",
            body: formData,
          });

          const result = await response.json();

          if (result.success && result.media) {
            // Check if we got a public URL (Vercel Blob)
            const isPublicUrl =
              result.media.url?.includes("blob.vercel-storage.com") ||
              result.media.storageType === "blob";

            // Update with success
            const successFile: UploadedFile = {
              ...uploadingFile,
              id: String(result.media.id) || uploadingFile.id,
              url: result.media.url,
              status: "success",
              isPublicUrl,
            };

            // Log warning if URL is not public (won't work in v0 preview)
            if (!isPublicUrl) {
              console.warn(
                "[FileUploadZone] ⚠️ File uploaded but URL is NOT public!",
                "This file will NOT appear in v0 preview.",
                "URL:",
                result.media.url
              );
            } else {
              console.log(
                "[FileUploadZone] ✓ File uploaded with public URL:",
                result.media.url
              );
            }

            onFilesChange(
              updatedFiles.map((f) =>
                f.id === uploadingFile.id ? successFile : f
              )
            );
          } else {
            // Update with error
            const errorFile: UploadedFile = {
              ...uploadingFile,
              status: "error",
              error: result.error || "Uppladdning misslyckades",
            };
            onFilesChange(
              updatedFiles.map((f) =>
                f.id === uploadingFile.id ? errorFile : f
              )
            );
          }
        } catch (error) {
          console.error("[FileUploadZone] Upload error:", error);
          // Update with error
          const errorFile: UploadedFile = {
            ...uploadingFile,
            status: "error",
            error: "Nätverksfel vid uppladdning",
          };
          onFilesChange(
            files.map((f) => (f.id === uploadingFile.id ? errorFile : f))
          );
        }
      }
    },
    [projectId, files, onFilesChange, disabled]
  );

  // Remove file
  const removeFile = useCallback(
    (fileId: string) => {
      onFilesChange(files.filter((f) => f.id !== fileId));
    },
    [files, onFilesChange]
  );

  // Update file purpose
  const updatePurpose = useCallback(
    (fileId: string, purpose: string) => {
      onFilesChange(
        files.map((f) => (f.id === fileId ? { ...f, purpose } : f))
      );
    },
    [files, onFilesChange]
  );

  // Drag handlers
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) setIsDragging(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  // Click to select
  const handleClick = useCallback(() => {
    if (!disabled) fileInputRef.current?.click();
  }, [disabled]);

  const canAddMore = files.length < MAX_FILES && !disabled;
  const hasFiles = files.length > 0;

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Get file icon
  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) {
      return <ImageIcon className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  if (compact) {
    // Compact inline version
    return (
      <div className="space-y-2">
        {/* Uploaded files list */}
        {hasFiles && (
          <div className="flex flex-wrap gap-2">
            {files.map((file) => (
              <div
                key={file.id}
                className={cn(
                  "flex items-center gap-2 px-2 py-1 rounded text-xs",
                  file.status === "success" && "bg-brand-teal/20 text-brand-teal",
                  file.status === "uploading" && "bg-gray-700 text-gray-400",
                  file.status === "error" && "bg-red-500/20 text-red-400"
                )}
              >
                {file.status === "uploading" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : file.status === "success" ? (
                  <CheckCircle className="h-3 w-3" />
                ) : (
                  <AlertCircle className="h-3 w-3" />
                )}
                <span className="truncate max-w-[100px]">{file.filename}</span>
                <button
                  onClick={() => removeFile(file.id)}
                  className="hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add button */}
        {canAddMore && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClick}
            disabled={disabled}
            className="h-7 text-xs gap-1 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
          >
            <Upload className="h-3 w-3" />
            Lägg till media
          </Button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
      </div>
    );
  }

  // Full drop zone version
  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer",
          isDragging && "border-brand-teal bg-brand-teal/10",
          !isDragging &&
          canAddMore &&
          "border-gray-700 hover:border-gray-600 hover:bg-gray-800/50",
          !canAddMore &&
          "border-gray-800 bg-gray-900/50 cursor-not-allowed opacity-50"
        )}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <div
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              isDragging ? "bg-brand-teal/20" : "bg-gray-800"
            )}
          >
            <Upload
              className={cn(
                "h-5 w-5",
                isDragging ? "text-brand-teal" : "text-gray-500"
              )}
            />
          </div>
          <div>
            <p className="text-sm text-gray-300">
              {isDragging
                ? "Släpp filer här"
                : "Dra filer hit eller klicka för att välja"}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              JPG, PNG, GIF, WebP, SVG eller PDF • Max 10MB • Max {MAX_FILES}{" "}
              filer
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
      </div>

      {/* Uploaded files list */}
      {hasFiles && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            Uppladdade filer ({files.length}/{MAX_FILES})
          </p>
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.id}
                className={cn(
                  "flex items-center gap-3 p-2 rounded border",
                  file.status === "success" && "border-gray-700 bg-gray-800/50",
                  file.status === "uploading" &&
                  "border-gray-700 bg-gray-800/30",
                  file.status === "error" && "border-red-500/30 bg-red-500/10"
                )}
              >
                {/* Preview or icon */}
                <div className="w-10 h-10 rounded bg-gray-700 flex items-center justify-center overflow-hidden shrink-0">
                  {file.status === "success" &&
                    file.mimeType.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={file.url}
                      alt={file.filename}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className={cn(
                        file.status === "error"
                          ? "text-red-400"
                          : "text-gray-400"
                      )}
                    >
                      {getFileIcon(file.mimeType)}
                    </div>
                  )}
                </div>

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300 truncate">
                    {file.filename}
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    {file.status === "uploading" && (
                      <span className="text-gray-500 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Laddar upp...
                      </span>
                    )}
                    {file.status === "success" && (
                      <span className="text-gray-500">
                        {formatSize(file.size)}
                      </span>
                    )}
                    {file.status === "error" && (
                      <span className="text-red-400">{file.error}</span>
                    )}
                  </div>

                  {/* Purpose input for successful uploads */}
                  {file.status === "success" && (
                    <>
                      {/* Public URL indicator */}
                      {file.isPublicUrl === false && (
                        <span className="text-[10px] text-brand-amber block mt-0.5">
                          ⚠️ Ej publik URL - fungerar inte i v0 preview
                        </span>
                      )}
                      <input
                        type="text"
                        placeholder="Syfte: t.ex. 'hero-bild', 'logotyp'..."
                        value={file.purpose || ""}
                        onChange={(e) => updatePurpose(file.id, e.target.value)}
                        className="mt-1 w-full text-xs bg-transparent border-b border-gray-700 focus:border-brand-teal outline-none text-gray-400 placeholder:text-gray-600 py-0.5"
                      />
                    </>
                  )}
                </div>

                {/* Remove button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(file.id);
                  }}
                  className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Help text */}
      <p className="text-xs text-gray-500">
        💡 Bilder laddas upp till Vercel Blob för publika URLs som fungerar i
        v0-preview.
      </p>
    </div>
  );
}

/**
 * Helper to convert uploaded files to prompt text
 * This text is appended to user prompts to include file URLs
 *
 * CRITICAL: Only includes files with public URLs (isPublicUrl !== false)
 * Non-public URLs won't work in v0's preview!
 */
export function filesToPromptText(files: UploadedFile[]): string {
  // Filter for successful uploads with public URLs only
  const successFiles = files.filter(
    (f) => f.status === "success" && f.isPublicUrl !== false
  );

  if (successFiles.length === 0) {
    // Check if there were files but none with public URLs
    const hasNonPublicFiles = files.some(
      (f) => f.status === "success" && f.isPublicUrl === false
    );
    if (hasNonPublicFiles) {
      return "\n\n⚠️ De uppladdade filerna har inte publika URLs och kan inte användas i v0-preview.";
    }
    return "";
  }

  const lines = successFiles.map((file, index) => {
    const purpose = file.purpose ? ` (${file.purpose})` : "";
    const label = file.mimeType.startsWith("image/")
      ? "Bild"
      : file.mimeType === "application/pdf"
        ? "PDF"
        : "Fil";
    // URL should already be a full public URL from Vercel Blob
    // Only add base URL as fallback for legacy local URLs
    const fullUrl = file.url.startsWith("http")
      ? file.url
      : `${typeof window !== "undefined" ? window.location.origin : ""}${file.url
      }`;
    return `- ${label} ${index + 1}${purpose}: ${fullUrl}`;
  });

  const hasNonImages = successFiles.some((file) => !file.mimeType.startsWith("image/"));
  const usageHint = hasNonImages
    ? "Använd bild-URLs i <img src=\"...\">. PDF: använd som referens för innehåll."
    : "Använd dessa EXAKTA URLs i <img src=\"...\"> taggar.";

  return `\n\nVIKTIGT: Använd följande uppladdade filer i designen (publika URLs som fungerar i preview):\n${lines.join(
    "\n"
  )}\n\n${usageHint}`;
}

/**
 * Convert uploaded files to V0UserFileAttachment array for message attachments
 */
export function filesToAttachments(
  files: UploadedFile[]
): V0UserFileAttachment[] {
  return files
    .filter((f) => f.status === "success")
    .map((f) => ({
      type: "user_file" as const,
      url: f.url,
      filename: f.filename,
      mimeType: f.mimeType,
      size: f.size,
      purpose: f.purpose,
    }));
}
