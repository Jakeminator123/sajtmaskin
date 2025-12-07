"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  Code,
  Eye,
  Download,
  Copy,
  Check,
  FileCode,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface SimplePreviewProps {
  files: { path: string; content: string }[];
  demoUrl?: string | null; // v0's hosted preview URL
  projectId?: string;
  className?: string;
}

/**
 * Simple Preview Component
 *
 * Shows:
 * 1. v0's demoUrl in iframe (if available) - the "last known good" preview
 * 2. Code browser for all project files
 * 3. Actions: Open in CodeSandbox, Download ZIP, Copy code
 *
 * NO Sandpack/WebContainer - they don't work reliably for Next.js projects.
 * User owns the code and can edit it with AI agents.
 */
export function SimplePreview({
  files,
  demoUrl,
  projectId,
  className,
}: SimplePreviewProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "code">(
    demoUrl ? "preview" : "code"
  );
  const [selectedFile, setSelectedFile] = useState<string>(
    files[0]?.path || ""
  );
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set([""]));
  const [copied, setCopied] = useState(false);

  // Build file tree structure
  const fileTree = useMemo(() => {
    const tree: Record<string, { path: string; content: string }[]> = {};

    for (const file of files) {
      const dir = file.path.split("/").slice(0, -1).join("/") || "";
      if (!tree[dir]) tree[dir] = [];
      tree[dir].push(file);
    }

    return tree;
  }, [files]);

  const selectedFileContent = useMemo(
    () => files.find((f) => f.path === selectedFile)?.content || "",
    [files, selectedFile]
  );

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(selectedFileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenInCodeSandbox = () => {
    // Create CodeSandbox project via form POST
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "https://codesandbox.io/api/v1/sandboxes/define";
    form.target = "_blank";

    const filesForSandbox: Record<string, { content: string }> = {};
    for (const file of files) {
      const path = file.path.replace(/^\/+/, "");
      filesForSandbox[path] = { content: file.content };
    }

    const params = {
      files: filesForSandbox,
    };

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "parameters";
    input.value = btoa(unescape(encodeURIComponent(JSON.stringify(params))));
    form.appendChild(input);

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  };

  const handleDownloadZip = async () => {
    if (!projectId) return;
    window.open(`/api/download?projectId=${projectId}&format=zip`, "_blank");
  };

  const toggleDir = (dir: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) {
        next.delete(dir);
      } else {
        next.add(dir);
      }
      return next;
    });
  };

  // Get unique directories
  const directories = useMemo(() => {
    const dirs = new Set<string>();
    for (const file of files) {
      const parts = file.path.split("/");
      for (let i = 1; i < parts.length; i++) {
        dirs.add(parts.slice(0, i).join("/"));
      }
    }
    return Array.from(dirs).sort();
  }, [files]);

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-gray-950 rounded-xl overflow-hidden border border-gray-800",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900/80">
        {/* Tabs */}
        <div className="flex gap-1">
          {demoUrl && (
            <button
              onClick={() => setActiveTab("preview")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors",
                activeTab === "preview"
                  ? "bg-teal-500/20 text-teal-400"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              )}
            >
              <Eye className="h-4 w-4" />
              Preview
            </button>
          )}
          <button
            onClick={() => setActiveTab("code")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors",
              activeTab === "code"
                ? "bg-emerald-500/20 text-emerald-400"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            )}
          >
            <Code className="h-4 w-4" />
            Kod ({files.length} filer)
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenInCodeSandbox}
            className="h-8 gap-1.5 text-xs border-gray-700 hover:bg-gray-800"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Öppna i CodeSandbox
          </Button>
          {projectId && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadZip}
              className="h-8 gap-1.5 text-xs border-gray-700 hover:bg-gray-800"
            >
              <Download className="h-3.5 w-3.5" />
              ZIP
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {/* Preview Tab */}
        {activeTab === "preview" && demoUrl && (
          <div className="h-full flex flex-col">
            <div className="px-3 py-1.5 bg-gray-900/50 border-b border-gray-800 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                v0 Preview (senast genererad version)
              </span>
              <a
                href={demoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1"
              >
                Öppna i ny flik <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <iframe
              src={demoUrl}
              className="flex-1 w-full border-0 bg-white"
              title="Project Preview"
            />
          </div>
        )}

        {/* Code Tab */}
        {activeTab === "code" && (
          <div className="flex h-full">
            {/* File Tree */}
            <div className="w-64 border-r border-gray-800 overflow-auto bg-gray-900/50">
              <div className="p-2 text-xs text-gray-500 font-medium uppercase tracking-wide border-b border-gray-800">
                Projektfiler
              </div>
              <div className="p-1">
                {/* Root files */}
                {fileTree[""]?.map((file) => (
                  <button
                    key={file.path}
                    onClick={() => setSelectedFile(file.path)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1 text-left text-sm rounded hover:bg-gray-800 transition-colors",
                      selectedFile === file.path
                        ? "bg-gray-800 text-white"
                        : "text-gray-400"
                    )}
                  >
                    <FileCode className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {file.path.split("/").pop()}
                    </span>
                  </button>
                ))}

                {/* Directories */}
                {directories.map((dir) => (
                  <div key={dir}>
                    <button
                      onClick={() => toggleDir(dir)}
                      className="w-full flex items-center gap-1 px-2 py-1 text-left text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
                    >
                      {expandedDirs.has(dir) ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      <span className="truncate">{dir.split("/").pop()}/</span>
                    </button>
                    {expandedDirs.has(dir) &&
                      fileTree[dir]?.map((file) => (
                        <button
                          key={file.path}
                          onClick={() => setSelectedFile(file.path)}
                          className={cn(
                            "w-full flex items-center gap-2 pl-6 pr-2 py-1 text-left text-sm rounded hover:bg-gray-800 transition-colors",
                            selectedFile === file.path
                              ? "bg-gray-800 text-white"
                              : "text-gray-400"
                          )}
                        >
                          <FileCode className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {file.path.split("/").pop()}
                          </span>
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Code View */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {selectedFile && (
                <>
                  <div className="px-4 py-2 bg-gray-900/50 border-b border-gray-800 flex items-center justify-between">
                    <span className="text-sm text-gray-300 font-mono">
                      {selectedFile}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyCode}
                      className="h-7 gap-1.5 text-xs"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-green-400" />
                          Kopierat!
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Kopiera
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="flex-1 overflow-auto p-4 bg-gray-950">
                    <pre className="text-xs text-gray-300 font-mono whitespace-pre">
                      <code>{selectedFileContent}</code>
                    </pre>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
