"use client";

import { ExternalLink, FileCode, Github, Loader2, TerminalSquare, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import toast from "react-hot-toast";

type SandboxRuntime = "node24" | "node22" | "python3.13";
type SourceType = "version" | "git";

interface SandboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: string | null;
  versionId: string | null;
  onUseInPreview?: (url: string) => void;
}

type SandboxCreateResponse = {
  success: true;
  sandboxId: string;
  urls: Record<number, string>;
  primaryUrl: string | null;
  timeout: string;
  runtime: SandboxRuntime;
  ports: number[];
};

function parsePorts(input: string): number[] {
  const ports = input
    .split(",")
    .map((p) => Number.parseInt(p.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return ports.length > 0 ? ports : [3000];
}

export function SandboxModal({
  isOpen,
  onClose,
  chatId,
  versionId,
  onUseInPreview,
}: SandboxModalProps) {
  const baseId = useId();
  const handleClose = () => {
    if (typeof window === "undefined") {
      onClose();
      return;
    }
    window.requestAnimationFrame(onClose);
  };
  const [sourceType, setSourceType] = useState<SourceType>("version");
  const [gitUrl, setGitUrl] = useState("");
  const [gitBranch, setGitBranch] = useState("");

  const [timeout, setTimeout] = useState("5m");
  const [ports, setPorts] = useState("3000");
  const [runtime, setRuntime] = useState<SandboxRuntime>("node24");
  const [vcpus, setVcpus] = useState(2);
  const [installCommand, setInstallCommand] = useState("npm install");
  const [startCommand, setStartCommand] = useState("npm run dev");

  const [isCreating, setIsCreating] = useState(false);
  const [result, setResult] = useState<SandboxCreateResponse | null>(null);
  const [setupHint, setSetupHint] = useState<string | null>(null);

  const resolvedPorts = useMemo(() => parsePorts(ports), [ports]);
  const canUseVersion = !!chatId && !!versionId;

  if (!isOpen) return null;

  const handleCreate = async () => {
    setSetupHint(null);
    setResult(null);

    if (sourceType === "git" && !gitUrl.trim()) {
      toast.error("Please enter a Git URL");
      return;
    }

    if (sourceType === "version" && !canUseVersion) {
      toast.error("Select a chat + version first");
      return;
    }

    setIsCreating(true);
    try {
      let source: any;

      if (sourceType === "git") {
        source = {
          type: "git",
          url: gitUrl.trim(),
          ...(gitBranch.trim() ? { branch: gitBranch.trim() } : {}),
        };
      } else {
        const filesRes = await fetch(
          `/api/v0/chats/${chatId}/files?versionId=${encodeURIComponent(versionId!)}`,
          { method: "GET" },
        );
        const filesData = (await filesRes.json().catch(() => null)) as {
          files?: Array<{ name: string; content: string }>;
          error?: string;
        } | null;
        if (!filesRes.ok) {
          throw new Error(filesData?.error || `Failed to fetch files (HTTP ${filesRes.status})`);
        }

        const filesArr: Array<{ name: string; content: string }> = Array.isArray(filesData?.files)
          ? filesData.files
          : [];
        if (!Array.isArray(filesArr) || filesArr.length === 0) {
          throw new Error("No files found for this version");
        }

        const filesMap: Record<string, string> = {};
        for (const file of filesArr) {
          if (file?.name) filesMap[file.name] = file.content ?? "";
        }

        source = { type: "files", files: filesMap };
      }

      const response = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          timeout,
          ports: resolvedPorts,
          runtime,
          vcpus,
          installCommand,
          startCommand,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | (SandboxCreateResponse & { error?: string; setup?: unknown })
        | null;
      if (!response.ok) {
        if (data?.setup) setSetupHint(String(data.setup));
        throw new Error(data?.error || `Failed to create sandbox (HTTP ${response.status})`);
      }
      if (!data) {
        throw new Error("Failed to create sandbox");
      }
      setResult(data);
      toast.success("Sandbox created!");
    } catch (error) {
      console.error("Sandbox create error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create sandbox");
    } finally {
      setIsCreating(false);
    }
  };

  const openPrimary = () => {
    if (result?.primaryUrl) {
      window.open(result.primaryUrl, "_blank", "noopener,noreferrer");
    }
  };

  const useInPreview = () => {
    if (result?.primaryUrl && onUseInPreview) {
      onUseInPreview(result.primaryUrl);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative z-10 w-full max-w-lg rounded-xl bg-card p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TerminalSquare className="h-5 w-5 text-foreground" />
            <h2 className="text-xl font-semibold text-foreground">Run in Sandbox</h2>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setSourceType("version")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
              sourceType === "version"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <FileCode className="h-4 w-4" />
            Current Version
          </button>
          <button
            onClick={() => setSourceType("git")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
              sourceType === "git"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <Github className="h-4 w-4" />
            Git URL
          </button>
        </div>

        {sourceType === "git" ? (
          <div className="mb-6 space-y-4">
            <div>
              <label
                htmlFor="sandbox-git-url"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Repository URL
              </label>
              <input
                id="sandbox-git-url"
                name="gitUrl"
                type="url"
                placeholder="https://github.com/username/repo"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                className="focus:border-brand-blue focus:ring-brand-blue/50 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-1 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="sandbox-git-branch"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Branch (optional)
              </label>
              <input
                id="sandbox-git-branch"
                name="gitBranch"
                type="text"
                placeholder="main"
                value={gitBranch}
                onChange={(e) => setGitBranch(e.target.value)}
                className="focus:border-brand-blue focus:ring-brand-blue/50 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-1 focus:outline-none"
              />
            </div>
          </div>
        ) : (
          <div className="mb-6 rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>
                <span className="font-medium">Chat:</span> {chatId ? "selected" : "none"}
              </span>
              <span>
                <span className="font-medium">Version:</span> {versionId || "none"}
              </span>
            </div>
            {!canUseVersion && (
              <p className="mt-2 text-xs text-muted-foreground">
                Select a chat and pick a version in the Version History first.
              </p>
            )}
          </div>
        )}

        <div className="mb-6 space-y-4">
          <div>
            <label htmlFor={`${baseId}-runtime`} className="mb-1 block text-sm font-medium text-foreground">
              Runtime
            </label>
            <select
              id={`${baseId}-runtime`}
              name="runtime"
              value={runtime}
              onChange={(e) => setRuntime(e.target.value as SandboxRuntime)}
              className="focus:border-brand-blue focus:ring-brand-blue/50 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-1 focus:outline-none"
            >
              <option value="node24">Node 24</option>
              <option value="node22">Node 22</option>
              <option value="python3.13">Python 3.13</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${baseId}-ports`} className="mb-1 block text-sm font-medium text-foreground">
              Ports
            </label>
            <input
              id={`${baseId}-ports`}
              name="ports"
              type="text"
              value={ports}
              onChange={(e) => setPorts(e.target.value)}
              className="focus:border-brand-blue focus:ring-brand-blue/50 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-1 focus:outline-none"
              placeholder="3000, 5173"
            />
          </div>
          <div>
            <label htmlFor={`${baseId}-timeout`} className="mb-1 block text-sm font-medium text-foreground">
              Timeout
            </label>
            <input
              id={`${baseId}-timeout`}
              name="timeout"
              type="text"
              value={timeout}
              onChange={(e) => setTimeout(e.target.value)}
              className="focus:border-brand-blue focus:ring-brand-blue/50 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-1 focus:outline-none"
              placeholder="5m"
            />
          </div>
          <div>
            <label htmlFor={`${baseId}-vcpus`} className="mb-1 block text-sm font-medium text-foreground">
              vCPU
            </label>
            <input
              id={`${baseId}-vcpus`}
              name="vcpus"
              type="number"
              min={1}
              max={8}
              value={vcpus}
              onChange={(e) => setVcpus(Number(e.target.value))}
              className="focus:border-brand-blue focus:ring-brand-blue/50 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-1 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor={`${baseId}-install-command`} className="mb-1 block text-sm font-medium text-foreground">
              Install command
            </label>
            <input
              id={`${baseId}-install-command`}
              name="installCommand"
              type="text"
              value={installCommand}
              onChange={(e) => setInstallCommand(e.target.value)}
              className="focus:border-brand-blue focus:ring-brand-blue/50 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-1 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor={`${baseId}-start-command`} className="mb-1 block text-sm font-medium text-foreground">
              Start command
            </label>
            <input
              id={`${baseId}-start-command`}
              name="startCommand"
              type="text"
              value={startCommand}
              onChange={(e) => setStartCommand(e.target.value)}
              className="focus:border-brand-blue focus:ring-brand-blue/50 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-1 focus:outline-none"
            />
          </div>
        </div>

        {setupHint && (
          <div className="border-brand-amber/30 bg-brand-amber/10 text-brand-amber mb-6 rounded-lg border p-3 text-xs">
            {setupHint}
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={isCreating}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-3 font-medium text-white transition-colors hover:bg-primary/80 disabled:opacity-50"
        >
          {isCreating ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <TerminalSquare className="h-5 w-5" />
          )}
          {isCreating ? "Creating sandbox..." : "Create sandbox"}
        </button>

        {result && (
          <div className="mt-6 rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm text-accent">
            <div className="mb-2 font-medium">Sandbox ready!</div>
            <div className="space-y-2">
              {result.primaryUrl && (
                <button
                  onClick={openPrimary}
                  className="flex items-center gap-2 text-accent hover:text-accent/80"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open primary URL
                </button>
              )}
              {result.primaryUrl && onUseInPreview && (
                <button
                  onClick={useInPreview}
                  className="flex items-center gap-2 text-accent hover:text-accent/80"
                >
                  <ExternalLink className="h-4 w-4" />
                  Use in preview
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
