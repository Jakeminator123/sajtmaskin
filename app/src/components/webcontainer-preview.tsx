"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { sanitizeProjectPathClient } from "@/lib/path-utils";

type WebContainerInstance = import("@webcontainer/api").WebContainer;
type WebContainerProcess = import("@webcontainer/api").WebContainerProcess;
type FileSystemTree = import("@webcontainer/api").FileSystemTree;

export type WebcontainerStatus =
  | "idle"
  | "booting"
  | "mounting"
  | "installing"
  | "starting"
  | "ready"
  | "error";

interface WebcontainerPreviewProps {
  files: { path: string; content: string }[];
  className?: string;
  onReady?: (url: string) => void;
  onStatusChange?: (status: WebcontainerStatus) => void;
}

const DEFAULT_PACKAGE_JSON = JSON.stringify(
  {
    name: "sajtmaskin-preview",
    private: true,
    version: "1.0.0",
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start",
    },
    dependencies: {
      next: "15.0.0",
      react: "18.3.1",
      "react-dom": "18.3.1",
    },
  },
  null,
  2
);

function buildFileTree(
  files: { path: string; content: string }[]
): FileSystemTree {
  const tree: FileSystemTree = {};

  // Ensure package.json exists to prevent install failure
  const hasPackageJson = files.some(
    (file) => sanitizeProjectPathClient(file.path) === "package.json"
  );
  if (!hasPackageJson) {
    tree["package.json"] = { file: { contents: DEFAULT_PACKAGE_JSON } };
  }

  for (const file of files) {
    const safePath = sanitizeProjectPathClient(file.path);
    if (!safePath) {
      // Skip invalid paths silently to avoid traversal
      console.warn("[WebContainer] Skipping invalid path:", file.path);
      continue;
    }
    const segments = safePath.split("/").filter(Boolean);
    let cursor = tree;

    while (segments.length > 1) {
      const dir = segments.shift()!;
      if (!cursor[dir] || !("directory" in cursor[dir]!)) {
        cursor[dir] = { directory: {} };
      }
      cursor = (cursor[dir] as { directory: FileSystemTree }).directory;
    }

    const leaf = segments.shift();
    if (!leaf) continue;
    cursor[leaf] = { file: { contents: file.content || "" } };
  }

  return tree;
}

function normalizeLogs(
  prev: string[],
  chunk: string,
  maxLines = 120
): string[] {
  const lines = chunk.split("\n").filter(Boolean);
  const merged = [...prev, ...lines];
  return merged.slice(Math.max(0, merged.length - maxLines));
}

export function WebcontainerPreview({
  files,
  className,
  onReady,
  onStatusChange,
}: WebcontainerPreviewProps) {
  const containerRef = useRef<WebContainerInstance | null>(null);
  const installProcessRef = useRef<WebContainerProcess | null>(null);
  const devProcessRef = useRef<WebContainerProcess | null>(null);
  const [status, setStatus] = useState<WebcontainerStatus>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!files || files.length === 0) {
      setStatus("idle");
      setPreviewUrl(null);
      setLogs([]);
      setError(null);
      return;
    }

    let cancelled = false;

    const startWebcontainer = async () => {
      setStatus("booting");
      setError(null);
      onStatusChange?.("booting");
      setLogs([]);

      try {
        const { WebContainer } = await import("@webcontainer/api");
        if (cancelled) return;

        const wc = await WebContainer.boot();
        containerRef.current = wc;

        setStatus("mounting");
        onStatusChange?.("mounting");
        const tree = buildFileTree(files);
        await wc.mount(tree);

        setStatus("installing");
        onStatusChange?.("installing");
        installProcessRef.current = await wc.spawn("npm", ["install"]);
        installProcessRef.current.output.pipeTo(
          new WritableStream({
            write(data) {
              setLogs((prev) => normalizeLogs(prev, String(data)));
            },
          })
        );
        const installExit = await installProcessRef.current.exit;
        if (installExit !== 0) {
          throw new Error("npm install misslyckades");
        }

        setStatus("starting");
        onStatusChange?.("starting");
        devProcessRef.current = await wc.spawn("npm", [
          "run",
          "dev",
          "--",
          "--hostname",
          "0.0.0.0",
          "--port",
          "4173",
        ]);

        devProcessRef.current.output.pipeTo(
          new WritableStream({
            write(data) {
              setLogs((prev) => normalizeLogs(prev, String(data)));
            },
          })
        );

        wc.on("server-ready", (port, url) => {
          if (cancelled) return;
          const finalUrl = url || `http://localhost:${port}`;
          setPreviewUrl(finalUrl);
          setStatus("ready");
          onStatusChange?.("ready");
          onReady?.(finalUrl);
        });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Okänt fel från WebContainer";
        setError(message);
        setStatus("error");
        onStatusChange?.("error");
        setLogs((prev) => normalizeLogs(prev, `[error] ${message}`));
      }
    };

    startWebcontainer();

    return () => {
      cancelled = true;
      devProcessRef.current?.kill();
      installProcessRef.current?.kill();
      containerRef.current?.teardown?.();
    };
  }, [files, onReady, onStatusChange]);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-gray-800 bg-black/70 text-gray-100",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2 text-xs uppercase tracking-wide text-gray-400">
        <span>WebContainer Preview</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px]",
            status === "ready"
              ? "bg-green-500/20 text-green-400"
              : status === "error"
              ? "bg-red-500/20 text-red-400"
              : "bg-blue-500/10 text-blue-300"
          )}
        >
          {status}
        </span>
      </div>

      <div className="relative flex-1 bg-gray-950">
        {previewUrl && status === "ready" ? (
          <iframe
            src={previewUrl}
            className="h-full w-full border-0"
            title="WebContainer preview"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-gray-400">
            {error ? (
              <>
                <span className="text-red-400">Fel i preview</span>
                <span className="text-xs text-red-300">{error}</span>
              </>
            ) : (
              <>
                <span>Startar förhandsvisning...</span>
                <span className="text-xs text-gray-500">Status: {status}</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="h-28 overflow-auto border-t border-gray-800 bg-gray-900/80 p-2 text-[11px] font-mono text-gray-200">
        {logs.length === 0 ? (
          <div className="text-gray-500">Inga loggar än</div>
        ) : (
          <pre className="whitespace-pre-wrap">{logs.join("\n")}</pre>
        )}
      </div>
    </div>
  );
}
