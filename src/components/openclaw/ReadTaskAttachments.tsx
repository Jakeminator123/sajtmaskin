"use client";

import { useState } from "react";
import { FileUploadZone, type UploadedFile } from "@/components/media/file-upload-zone";
import { MediaDrawer } from "@/components/media/media-drawer";
import { readTaskAttachmentIds } from "@/lib/openclaw/read-task-input";

export function ReadTaskAttachments({
  files,
  onFilesChange,
  disabled,
}: {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  disabled: boolean;
}) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const ids = readTaskAttachmentIds(files);
  const hasUnsupported = ids.length !== files.filter((file) => file.status === "success").length;
  return (
    <details className="mb-2 text-sm">
      <summary className="cursor-pointer">Bilagor till frågan</summary>
      <p>Upp till tre bilder eller textfiler.</p>
      <FileUploadZone projectId={null} files={files} onFilesChange={onFilesChange} compact disabled={disabled} />
      <button type="button" className="underline" disabled={disabled || files.some((file) => file.status === "uploading")}
        onClick={() => setLibraryOpen(true)}>
        Välj från mediebanken
      </button>
      {hasUnsupported || ids.length > 3 ? <p role="alert">Ta bort filtyper som inte stöds eller välj högst tre filer.</p> : null}
      <MediaDrawer isOpen={libraryOpen} onClose={() => setLibraryOpen(false)} onFileSelect={(item) => {
        if (!files.some(({ url }) => url === item.url)) {
          onFilesChange([...files, {
            id: item.id,
            url: item.url,
            filename: item.filename || "Bilaga",
            mimeType: item.mimeType || "application/octet-stream",
            size: 0,
            status: "success",
          }]);
        }
        setLibraryOpen(false);
      }} />
    </details>
  );
}
