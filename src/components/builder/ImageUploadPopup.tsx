"use client";

import type { V0UserFileAttachment } from "@/components/media/file-upload-zone";
import { Loader2, Upload, X, Film, ImageIcon, FileText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

const MAX_FILES = 15;
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const ACCEPTED_TYPES = [
  "image/jpeg", "image/jpg", "image/png", "image/gif",
  "image/webp", "image/avif", "image/heic", "image/heif",
  "image/svg+xml",
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

type FileCategory = "own" | "inspiration" | "logo";

interface UploadingFile {
  id: string;
  file: File;
  url: string | null;
  mediaId: number | null;
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
  const logoInputRef = useRef<HTMLInputElement>(null);
  const dragCountRef = useRef(0);

  const [isPurging, setIsPurging] = useState(false);
  const handlePurge = useCallback(async () => {
    if (isPurging) return;
    const ok = window.confirm("Rensa hela bildbanken? Detta tar bort alla tidigare uppladdade filer.");
    if (!ok) return;
    setIsPurging(true);
    try {
      const res = await fetch("/api/media/purge", { method: "POST" });
      if (res.ok) {
        toast.success("Bildbank rensad");
        setFiles([]);
      } else {
        toast.error("Kunde inte rensa bildbank");
      }
    } catch {
      toast.error("Nätverksfel vid rensning");
    } finally {
      setIsPurging(false);
    }
  }, [isPurging]);

  const isUploading = files.some((f) => f.status === "uploading");
  const successFiles = files.filter((f) => f.status === "success");
  const logoFile = files.find((f) => f.category === "logo");
  const nonLogoFiles = files.filter((f) => f.category !== "logo");
  const canAddMore = nonLogoFiles.length < MAX_FILES;

  const uploadFile = useCallback(async (file: File): Promise<{ url: string; mediaId: number | null } | null> => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/media/upload", { method: "POST", body: formData });
      const data = await res.json().catch(() => null as unknown);
      if (!res.ok) {
        const code = (data as { code?: string } | null)?.code;
        const serverMsg = (data as { error?: string } | null)?.error;
        const payload = data as
          | { counts?: { images?: number; videos?: number }; limits?: { maxImages?: number; maxVideos?: number } }
          | null;
        const isVideo = file.type?.startsWith("video/");
        const have = isVideo ? payload?.counts?.videos : payload?.counts?.images;
        const cap = isVideo ? payload?.limits?.maxVideos : payload?.limits?.maxImages;
        const reason =
          code === "unsupported_mime"
            ? `Filtypen stöds inte (${file.type || "okänd"})`
            : code === "too_large"
              ? "Filen är för stor (max 20 MB)"
              : code === "limit_reached"
                ? have != null && cap != null
                  ? `Din bildbank är full (${have}/${cap}). Rensa några filer först.`
                  : "Din bildbank är full. Rensa några filer först."
                : serverMsg || `HTTP ${res.status}`;
        console.warn("[ImageUpload] Server upload failed:", res.status, reason);
        toast.error(`${file.name}: ${reason}`);
        return null;
      }
      if (!(data as { success?: boolean } | null)?.success) return null;
      const rawUrl = (data as { media?: { url?: string }; url?: string } | null)?.media?.url ?? (data as { url?: string } | null)?.url;
      const url = rawUrl && !rawUrl.startsWith("http")
        ? `${window.location.origin}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`
        : rawUrl ?? "";
      const mediaId = (data as { media?: { id?: number } } | null)?.media?.id ?? null;
      return { url, mediaId };
    } catch (err) {
      console.warn("[ImageUpload] Upload error:", err);
      toast.error(`${file.name}: nätverksfel vid uppladdning`);
      return null;
    }
  }, []);

  const addFiles = useCallback(
    (incoming: File[], category: FileCategory) => {
      if (category === "logo") {
        const logoFile = incoming[0];
        if (!logoFile || !logoFile.type.startsWith("image/") || logoFile.size > MAX_FILE_SIZE) return;

        const entry: UploadingFile = {
          id: crypto.randomUUID(),
          file: logoFile,
          url: null,
          mediaId: null,
          filename: logoFile.name,
          mimeType: logoFile.type,
          previewUrl: URL.createObjectURL(logoFile),
          status: "uploading",
          category: "logo",
        };

        setFiles((prev) => {
          const old = prev.find((f) => f.category === "logo");
          if (old?.previewUrl) URL.revokeObjectURL(old.previewUrl);
          if (old?.mediaId) {
            void fetch(`/api/media/${old.mediaId}`, { method: "DELETE" }).catch(() => {});
          }
          return [...prev.filter((f) => f.category !== "logo"), entry];
        });

        void uploadFile(entry.file).then((result) => {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === entry.id
                ? result
                  ? { ...f, url: result.url, mediaId: result.mediaId, status: "success" as const }
                  : { ...f, status: "error" as const, error: "Uppladdningen misslyckades" }
                : f,
            ),
          );
        });
        return;
      }

      const remaining = MAX_FILES - nonLogoFiles.length;
      const toAdd = incoming.slice(0, remaining).filter((f) => {
        if (!ACCEPTED_TYPES.includes(f.type)) return false;
        if (f.size > MAX_FILE_SIZE) return false;
        return true;
      });

      const newEntries: UploadingFile[] = toAdd.map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        url: null,
        mediaId: null,
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
                  ? { ...f, url: result.url, mediaId: result.mediaId, status: "success" as const }
                  : { ...f, status: "error" as const, error: "Uppladdningen misslyckades" }
                : f,
            ),
          );
        });
      }
    },
    [nonLogoFiles.length, uploadFile],
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
      if (file?.mediaId) {
        void fetch(`/api/media/${file.mediaId}`, { method: "DELETE" }).catch(() => {});
      }
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
        if (f.category === "logo") purpose = "brand-logo";
        else if (f.category === "inspiration") purpose = "design-reference";
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
          <div key={f.id} className="group relative aspect-square overflow-hidden rounded-xl bg-muted">
            {f.previewUrl ? (
              <img src={f.previewUrl} alt={f.filename} className="h-full w-full object-cover" />
            ) : isVideo(f.mimeType) ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1">
                <Film className="h-6 w-6 text-muted-foreground" />
                <span className="max-w-full truncate px-1 text-[10px] text-muted-foreground">{f.filename}</span>
              </div>
            ) : isDocument(f.mimeType) ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1">
                <FileText className="h-6 w-6 text-muted-foreground" />
                <span className="max-w-full truncate px-1 text-[10px] text-muted-foreground">{f.filename}</span>
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            {f.status === "uploading" && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                <Loader2 className="h-5 w-5 animate-spin text-foreground/80" />
              </div>
            )}
            {f.status === "error" && (
              <div className="absolute inset-0 flex items-center justify-center bg-destructive/10">
                <span className="text-[10px] text-destructive">Fel</span>
              </div>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeFile(f.id); }}
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-foreground/60 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <X className="h-3 w-3 text-white" />
            </button>
          </div>
        ))}
      </div>
    );
  };

  const LOGO_ACCEPT = "image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml";

  return (
    <div
      className="fixed inset-0 z-[99999] flex flex-col bg-background"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex flex-1 flex-col px-4 py-6 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl text-center mb-4">
          <h2 className="text-2xl font-semibold text-foreground">
            Har du eget material?
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ladda upp din logotyp och övriga bilder, videos eller dokument — vi analyserar och placerar allt automatiskt.
          </p>
        </div>

        {/* Logo upload zone */}
        <div className="mx-auto mb-4 w-full max-w-2xl">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Logotyp</p>
          <div
            className="flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 transition-colors hover:border-border/80"
            onClick={() => logoInputRef.current?.click()}
          >
            <input
              ref={logoInputRef}
              type="file"
              accept={LOGO_ACCEPT}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  addFiles(Array.from(e.target.files), "logo");
                  e.target.value = "";
                }
              }}
            />
            {logoFile ? (
              <>
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-card">
                  {logoFile.previewUrl ? (
                    <img src={logoFile.previewUrl} alt="Logo" className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                  )}
                  {logoFile.status === "uploading" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                      <Loader2 className="h-4 w-4 animate-spin text-foreground/80" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{logoFile.filename}</p>
                  <p className="text-xs text-muted-foreground">Hamnar i header och footer</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeFile(logoFile.id); }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground/80"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-card">
                  <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground/80">Ladda upp din logotyp</p>
                  <p className="text-xs text-muted-foreground">Placeras automatiskt i header och footer</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Main drop zone for other files */}
        <div className="mx-auto mb-1 w-full max-w-2xl">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Övrigt material</p>
        </div>
        <div
          className={`relative mx-auto flex w-full max-w-2xl flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-colors ${
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-border bg-muted/30 hover:border-border/80"
          }`}
          onClick={() => canAddMore && ownInputRef.current?.click()}
        >
          <input ref={ownInputRef} type="file" accept={ACCEPT_STRING} multiple className="hidden" onChange={makeInputHandler("own")} disabled={!canAddMore} />

          <Upload className={`h-8 w-8 ${isDragOver ? "text-primary" : "text-muted-foreground/50"}`} />
          <p className="mt-3 text-sm font-medium text-foreground/80">
            {isDragOver ? "Släpp filerna här" : "Dra in filer eller klicka för att välja"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Bilder, videos, PDF och Word — max 20 MB/fil
          </p>
        </div>

        {/* File grids */}
        {nonLogoFiles.length > 0 && (
          <div className="mx-auto mt-4 w-full max-w-2xl space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {nonLogoFiles.length}/{MAX_FILES} filer
              </p>
              <button
                type="button"
                onClick={handlePurge}
                disabled={isPurging}
                className="text-[11px] text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
              >
                {isPurging ? "Rensar…" : "Rensa bildbank"}
              </button>
            </div>
            {renderFileGrid(nonLogoFiles)}
          </div>
        )}

        {/* Actions */}
        <div className="mx-auto mt-4 flex w-full max-w-2xl flex-col items-center gap-3">
          <button
            type="button"
            onClick={files.length > 0 ? handleConfirm : onSkip}
            disabled={isUploading}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
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
              className="text-xs text-muted-foreground transition-colors hover:text-foreground/80"
            >
              Hoppa över — använd exempelbilder istället
            </button>
          ) : (
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground/80"
            >
              Jag har inga bilder just nu — bygg med exempelbilder
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
