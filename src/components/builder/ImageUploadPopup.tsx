"use client";

import type { V0UserFileAttachment } from "@/components/media/file-upload-zone";
import { Loader2, Upload, X, Film, ImageIcon, FileText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MAX_FILES = 15;
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const ACCEPTED_TYPES = [
  "image/jpeg", "image/jpg", "image/png", "image/gif",
  "image/webp", "image/svg+xml",
  "video/mp4", "video/webm", "video/quicktime",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
];

const ACCEPT_STRING = [
  ...ACCEPTED_TYPES,
  ".pdf", ".docx", ".doc", ".txt",
].join(",");

type FileCategory = "own" | "inspiration";

interface UploadingFile {
  id: string;
  file: File;
  url: string | null;
  filename: string;
  mimeType: string;
  previewUrl: string | null;
  status: "uploading" | "success" | "error";
  error?: string;
  category: FileCategory;
}

interface ImageUploadPopupProps {
  onConfirm: (attachments: V0UserFileAttachment[]) => void;
  onSkip: () => void;
}

export function ImageUploadPopup(props: ImageUploadPopupProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<PopupInner {...props} />, document.body);
}

function PopupInner({ onConfirm, onSkip }: ImageUploadPopupProps) {
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const ownInputRef = useRef<HTMLInputElement>(null);
  const dragCountRef = useRef(0);

  const isUploading = files.some((f) => f.status === "uploading");
  const successFiles = files.filter((f) => f.status === "success");
  const canAddMore = files.length < MAX_FILES;

  const uploadFile = useCallback(async (file: File): Promise<{ url: string } | null> => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/media/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn("[ImageUpload] Server upload failed:", res.status, text);
        return null;
      }
      const data = await res.json();
      return data.success ? { url: data.media?.url ?? data.url } : null;
    } catch (err) {
      console.warn("[ImageUpload] Upload error:", err);
      return null;
    }
  }, []);

  const addFiles = useCallback(
    (incoming: File[], category: FileCategory) => {
      const remaining = MAX_FILES - files.length;
      const toAdd = incoming.slice(0, remaining).filter((f) => {
        if (!ACCEPTED_TYPES.includes(f.type)) return false;
        if (f.size > MAX_FILE_SIZE) return false;
        return true;
      });

      const newEntries: UploadingFile[] = toAdd.map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        url: null,
        filename: f.name,
        mimeType: f.type,
        previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
        status: "uploading" as const,
        category,
      }));

      setFiles((prev) => [...prev, ...newEntries]);

      for (const entry of newEntries) {
        void uploadFile(entry.file).then((result) => {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === entry.id
                ? result
                  ? { ...f, url: result.url, status: "success" as const }
                  : { ...f, status: "error" as const, error: "Uppladdningen misslyckades" }
                : f,
            ),
          );
        });
      }
    },
    [files.length, uploadFile],
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCountRef.current = 0;
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(Array.from(e.dataTransfer.files), "own");
      }
    },
    [addFiles],
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current += 1;
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current -= 1;
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const makeInputHandler = useCallback(
    (category: FileCategory) => (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        addFiles(Array.from(e.target.files), category);
        e.target.value = "";
      }
    },
    [addFiles],
  );

  const handleConfirm = useCallback(() => {
    const attachments: V0UserFileAttachment[] = successFiles
      .filter((f): f is UploadingFile & { url: string } => f.url !== null)
      .map((f) => {
        let purpose: string | undefined;
        if (f.category === "inspiration") purpose = "design-reference";
        else if (isDocument(f.mimeType)) purpose = "company-document";
        return {
          type: "user_file",
          url: f.url,
          filename: f.filename,
          mimeType: f.mimeType,
          size: f.file.size,
          purpose,
        };
      });
    onConfirm(attachments);
  }, [successFiles, onConfirm]);

  useEffect(() => {
    return () => {
      for (const f of files) {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isVideo = (mime: string) => mime.startsWith("video/");
  const isDocument = (mime: string) =>
    mime === "application/pdf" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword" ||
    mime === "text/plain";

  const renderFileGrid = (fileList: UploadingFile[]) => {
    if (fileList.length === 0) return null;
    return (
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
        {fileList.map((f) => (
          <div key={f.id} className="group relative aspect-square overflow-hidden rounded-xl bg-neutral-100">
            {f.previewUrl ? (
              <img src={f.previewUrl} alt={f.filename} className="h-full w-full object-cover" />
            ) : isVideo(f.mimeType) ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1">
                <Film className="h-6 w-6 text-neutral-400" />
                <span className="max-w-full truncate px-1 text-[10px] text-neutral-400">{f.filename}</span>
              </div>
            ) : isDocument(f.mimeType) ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1">
                <FileText className="h-6 w-6 text-neutral-400" />
                <span className="max-w-full truncate px-1 text-[10px] text-neutral-400">{f.filename}</span>
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageIcon className="h-6 w-6 text-neutral-400" />
              </div>
            )}
            {f.status === "uploading" && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                <Loader2 className="h-5 w-5 animate-spin text-neutral-600" />
              </div>
            )}
            {f.status === "error" && (
              <div className="absolute inset-0 flex items-center justify-center bg-red-50">
                <span className="text-[10px] text-red-500">Fel</span>
              </div>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeFile(f.id); }}
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900/60 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <X className="h-3 w-3 text-white" />
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", flexDirection: "column", background: "#ffffff" }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex flex-1 flex-col px-4 py-6 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl text-center mb-4">
          <h2 className="text-2xl font-semibold text-neutral-900">
            Har du eget material?
          </h2>
          <p className="mt-2 text-sm text-neutral-500">
            Ladda upp bilder, videos eller dokument (PDF, Word) — vi analyserar och placerar allt automatiskt.
          </p>
        </div>

        {/* Drop zone — takes all available vertical space */}
        <div
          className={`relative mx-auto flex w-full max-w-2xl flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-colors ${
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-neutral-200 bg-neutral-50 hover:border-neutral-300"
          }`}
          onClick={() => canAddMore && ownInputRef.current?.click()}
        >
          <input ref={ownInputRef} type="file" accept={ACCEPT_STRING} multiple className="hidden" onChange={makeInputHandler("own")} disabled={!canAddMore} />

          <Upload className={`h-8 w-8 ${isDragOver ? "text-primary" : "text-neutral-300"}`} />
          <p className="mt-3 text-sm font-medium text-neutral-600">
            {isDragOver ? "Släpp filerna här" : "Dra in filer eller klicka för att välja"}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            Bilder, videos, PDF och Word — max 20 MB/fil
          </p>
        </div>

        {/* File grids */}
        {files.length > 0 && (
          <div className="mx-auto mt-4 w-full max-w-2xl space-y-3">
            <p className="text-xs text-neutral-400">
              {files.length}/{MAX_FILES} filer
            </p>
            {renderFileGrid(files)}
          </div>
        )}

        {/* Actions */}
        <div className="mx-auto mt-4 flex w-full max-w-2xl flex-col items-center gap-3">
          <button
            type="button"
            onClick={files.length > 0 ? handleConfirm : onSkip}
            disabled={isUploading}
            style={{ background: "#1a1a2e", color: "#ffffff" }}
            className="inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isUploading && <Loader2 className="h-4 w-4 animate-spin" />}
            {files.length > 0
              ? `Skapa min sajt med ${successFiles.length} ${successFiles.length === 1 ? "fil" : "filer"}`
              : "Skapa min sajt"}
          </button>
          {files.length > 0 ? (
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-neutral-400 transition-colors hover:text-neutral-600"
            >
              Skippa och använd stockbilder istället
            </button>
          ) : (
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-neutral-400 transition-colors hover:text-neutral-600"
            >
              Jag har inga bilder just nu — skapa med stockbilder
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
