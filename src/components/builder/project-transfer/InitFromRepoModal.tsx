"use client";

import { AuthModal } from "@/components/auth/auth-modal";
import { ENGINE_CHATS_API_PREFIX } from "@/lib/api/engine-chats-path";
import { useAuth } from "@/lib/auth/auth-store";
import {
  LOCAL_ZIP_LIMIT_LABEL,
  parseDroppedImport,
  parseImportInitSuccess,
  readImportInitFailure,
  readStoredImportIntent,
  validateLocalZipFile,
  writeStoredImportIntent,
} from "@/lib/import/import-init-client";
import type { ImportInitSuccess } from "@/lib/import/import-init-contract";
import { FolderArchive, GitBranch, Loader2, Lock, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

interface InitFromRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: ImportInitSuccess) => void;
}

type SourceType = "github" | "zip";

async function readZipAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Kunde inte läsa filen"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") return reject(new Error("Kunde inte läsa filen"));
      const commaIdx = result.indexOf(",");
      if (commaIdx === -1) return reject(new Error("Ogiltig filkodning"));
      resolve(result.slice(commaIdx + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function InitFromRepoModal({ isOpen, onClose, onSuccess }: InitFromRepoModalProps) {
  const { user, isAuthenticated, hasGitHub, isInitialized, fetchUser } = useAuth();
  const [sourceType, setSourceType] = useState<SourceType>("github");
  const [githubUrl, setGithubUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [message, setMessage] = useState("");
  const [lockConfigFiles, setLockConfigFiles] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [zipFileName, setZipFileName] = useState<string | null>(null);
  const [zipContent, setZipContent] = useState<string | null>(null);
  const [zipUrl, setZipUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [returnTo, setReturnTo] = useState("/builder");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const dropZoneId = useId();

  const persistIntent = () => {
    writeStoredImportIntent({
      sourceType,
      githubUrl,
      branch,
      zipUrl,
      message,
      lockConfigFiles,
    });
  };

  const handleClose = () => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    if (typeof window === "undefined") {
      onClose();
      return;
    }
    window.requestAnimationFrame(onClose);
  };

  useEffect(() => {
    if (!isOpen || isInitialized) return;
    fetchUser().catch(() => {});
  }, [isOpen, isInitialized, fetchUser]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
    const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    setReturnTo(path || "/builder");
    const stored = readStoredImportIntent();
    if (!stored) return;
    setSourceType(stored.sourceType);
    setGithubUrl(stored.githubUrl);
    setBranch(stored.branch);
    setZipUrl(stored.zipUrl);
    setMessage(stored.message);
    setLockConfigFiles(stored.lockConfigFiles);
  }, [isOpen]);

  if (!isOpen) return null;

  const applyZipFile = async (file: File) => {
    const error = validateLocalZipFile(file);
    if (error) {
      toast.error(error);
      return;
    }
    try {
      const base64 = await readZipAsBase64(file);
      setZipContent(base64);
      setZipFileName(file.name);
      setZipUrl("");
      setSourceType("zip");
    } catch {
      toast.error("Kunde inte läsa filen");
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await applyZipFile(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = parseDroppedImport(event.dataTransfer);
    if (dropped.kind === "invalid") {
      toast.error(dropped.message);
      return;
    }
    if (dropped.kind === "github") {
      setSourceType("github");
      setGithubUrl(dropped.url);
      return;
    }
    void applyZipFile(dropped.file);
  };

  const handleSubmit = async () => {
    if (!isAuthenticated) {
      persistIntent();
      setAuthModalOpen(true);
      return;
    }
    if (sourceType === "github" && !githubUrl.trim()) {
      toast.error("Ange en GitHub-adress");
      return;
    }
    if (sourceType === "zip" && !zipContent && !zipUrl.trim()) {
      toast.error("Välj en ZIP-fil eller klistra in en ZIP-adress");
      return;
    }
    if (isLoading) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    persistIntent();
    setIsLoading(true);
    try {
      const body: Record<string, unknown> = {
        source:
          sourceType === "github"
            ? {
                type: "github",
                url: githubUrl.trim(),
                branch: branch.trim() || undefined,
              }
            : zipUrl.trim()
              ? { type: "zip", url: zipUrl.trim() }
              : { type: "zip", content: zipContent },
        lockConfigFiles,
      };

      if (message.trim()) {
        body.message = message.trim();
      }

      const response = await fetch(`${ENGINE_CHATS_API_PREFIX}/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abort.signal,
      });

      if (requestId !== requestIdRef.current) return;

      if (!response.ok) {
        const failure = await readImportInitFailure(response);
        if (failure.requiresAuth || failure.code === "auth_required") {
          persistIntent();
          setAuthModalOpen(true);
        }
        throw new Error(failure.error);
      }

      const data = await response.json().catch(() => null);
      const parsed = parseImportInitSuccess(data);
      if (!parsed) {
        throw new Error("Importen sparades inte med ett giltigt projekt-ID.");
      }

      if (parsed.preview.status === "failed") {
        toast.success("Projektet importerades. Preview kunde inte startas — använd Försök igen.");
      } else {
        toast.success("Projektet importerades.");
      }
      onSuccess(parsed);
      handleClose();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId !== requestIdRef.current) return;
      console.error("Init error:", error);
      toast.error(error instanceof Error ? error.message : "Import av projekt misslyckades");
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div
        data-testid="import-drop-root"
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-card p-6 shadow-2xl"
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">Importera projekt</h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Stäng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6 flex gap-2">
          <button
            type="button"
            onClick={() => setSourceType("github")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
              sourceType === "github"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <GitBranch className="h-4 w-4" />
            GitHub
          </button>
          <button
            type="button"
            onClick={() => setSourceType("zip")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
              sourceType === "zip"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <FolderArchive className="h-4 w-4" />
            ZIP
          </button>
        </div>

        <div
          id={dropZoneId}
          className={`mb-4 rounded-lg border border-dashed p-3 text-xs ${
            isDragging
              ? "border-primary bg-primary/5 text-foreground"
              : "border-border bg-muted/50 text-muted-foreground"
          }`}
        >
          Släpp en GitHub-länk eller en ZIP här. Det fyller i valet — importen startar först när du
          klickar på Importera.
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {sourceType === "github" && (
            <div className="mb-6 space-y-4">
              <div>
                <label
                  htmlFor="init-github-url"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  Repository-adress
                </label>
                <input
                  id="init-github-url"
                  name="githubUrl"
                  type="url"
                  placeholder="https://github.com/anvandare/repo"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  className="focus:border-brand-blue focus:ring-brand-blue/50 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-1 focus:outline-none"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Du måste vara inloggad på Sajtmaskin. Publika repon behöver ingen GitHub-koppling.
                  Privata repon kräver att GitHub är anslutet.
                </p>
                {isAuthenticated ? (
                  hasGitHub ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      GitHub anslutet som{" "}
                      <span className="font-medium text-foreground">@{user?.github_username}</span>
                    </p>
                  ) : (
                    <a
                      href={`/api/auth/github?returnTo=${encodeURIComponent(returnTo)}`}
                      className="text-brand-blue mt-2 inline-flex text-xs hover:underline"
                      onClick={persistIntent}
                    >
                      Anslut GitHub för privata repon
                    </a>
                  )
                ) : (
                  <button
                    type="button"
                    className="text-brand-blue mt-2 inline-flex text-xs hover:underline"
                    onClick={() => {
                      persistIntent();
                      setAuthModalOpen(true);
                    }}
                  >
                    Logga in för att importera
                  </button>
                )}
              </div>
              <div>
                <label
                  htmlFor="init-branch"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  Branch (valfritt)
                </label>
                <input
                  id="init-branch"
                  name="branch"
                  type="text"
                  placeholder="main eller feature/new-ui"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="focus:border-brand-blue focus:ring-brand-blue/50 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-1 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="init-message"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  Startinstruktion (valfritt)
                </label>
                <textarea
                  id="init-message"
                  name="message"
                  placeholder="t.ex. Lägg till en kontaktsida"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  className="focus:border-brand-blue focus:ring-brand-blue/50 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-1 focus:outline-none"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Instruktionen sparas i chatten men körs inte automatiskt.
                </p>
              </div>

              <div className="bg-brand-amber/10 border-brand-amber/30 flex items-center gap-3 rounded-lg border p-3">
                <Lock className="text-brand-amber h-5 w-5 shrink-0" />
                <div className="flex-1">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      id="init-lock-config-files"
                      name="lockConfigFiles"
                      type="checkbox"
                      checked={lockConfigFiles}
                      onChange={(e) => setLockConfigFiles(e.target.checked)}
                      className="text-brand-blue focus:ring-brand-blue/50 rounded border-border"
                    />
                    <span className="text-brand-amber text-sm font-medium">Lås config-filer</span>
                  </label>
                  <p className="text-brand-amber/80 mt-1 text-xs">
                    Hindra AI från att ändra package.json, config och beroenden
                  </p>
                </div>
              </div>
            </div>
          )}

          {sourceType === "zip" && (
            <div className="mb-6 space-y-4">
              <div>
                <label
                  htmlFor="init-zip-file"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  ZIP-fil
                </label>
                <input
                  id="init-zip-file"
                  name="zipFile"
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,application/zip"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-8 text-muted-foreground transition-colors hover:border-muted-foreground hover:bg-muted/50"
                >
                  <Upload className="h-8 w-8" />
                  {zipFileName ? (
                    <span className="text-sm font-medium text-foreground">{zipFileName}</span>
                  ) : (
                    <span className="text-sm">
                      Klicka eller släpp ZIP (max {LOCAL_ZIP_LIMIT_LABEL})
                    </span>
                  )}
                </button>
              </div>

              <div>
                <label
                  htmlFor="init-zip-url"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  Eller klistra in en ZIP-adress
                </label>
                <input
                  id="init-zip-url"
                  name="zipUrl"
                  type="url"
                  placeholder="https://example.com/project.zip"
                  value={zipUrl}
                  onChange={(e) => {
                    const value = e.target.value;
                    setZipUrl(value);
                    if (value.trim()) {
                      setZipContent(null);
                      setZipFileName(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }
                  }}
                  className="focus:border-brand-blue focus:ring-brand-blue/50 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-1 focus:outline-none"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  En serverhämtad ZIP-adress har en högre gräns än lokal uppladdning.
                </p>
              </div>

              <div>
                <label
                  htmlFor="init-message-zip"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  Startinstruktion (valfritt)
                </label>
                <textarea
                  id="init-message-zip"
                  name="message"
                  placeholder="t.ex. Lägg till en kontaktsida"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  className="focus:border-brand-blue focus:ring-brand-blue/50 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-1 focus:outline-none"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Instruktionen sparas i chatten men körs inte automatiskt.
                </p>
              </div>

              <div className="bg-brand-amber/10 border-brand-amber/30 flex items-center gap-3 rounded-lg border p-3">
                <Lock className="text-brand-amber h-5 w-5 shrink-0" />
                <div className="flex-1">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      id="init-lock-config-files-zip"
                      name="lockConfigFiles"
                      type="checkbox"
                      checked={lockConfigFiles}
                      onChange={(e) => setLockConfigFiles(e.target.checked)}
                      className="text-brand-blue focus:ring-brand-blue/50 rounded border-border"
                    />
                    <span className="text-brand-amber text-sm font-medium">Lås config-filer</span>
                  </label>
                  <p className="text-brand-amber/80 mt-1 text-xs">
                    Hindra AI från att ändra package.json, config och beroenden
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-foreground hover:bg-gray-50 disabled:opacity-50"
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={
              isLoading ||
              (sourceType === "github" && !githubUrl.trim()) ||
              (sourceType === "zip" && !zipContent && !zipUrl.trim())
            }
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importerar...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Importera projekt
              </>
            )}
          </button>
        </div>
      </div>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        defaultMode="login"
        returnTo={returnTo}
      />
    </div>
  );
}
