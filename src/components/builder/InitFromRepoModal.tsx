"use client";

import { FolderArchive, Github, Loader2, Lock, Upload, X, Blocks, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth/auth-store";

interface InitFromRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (chatId: string) => void;
}

type SourceType = "github" | "zip" | "blocks";

// Shadcn blocks organized by category
// Registry URL format: https://ui.shadcn.com/r/styles/new-york/{name}.json
const SHADCN_BLOCKS = [
  {
    category: "Authentication",
    items: [
      {
        name: "login-01",
        title: "Simple Login",
        description: "Clean login form with email/password",
      },
      {
        name: "login-02",
        title: "Login with Image",
        description: "Split screen login with hero image",
      },
      { name: "login-03", title: "Login Centered", description: "Centered card login form" },
      {
        name: "login-04",
        title: "Login with Social",
        description: "Login with Google/GitHub buttons",
      },
      { name: "login-05", title: "Login Minimal", description: "Minimalist login form" },
    ],
  },
  {
    category: "Dashboard",
    items: [
      {
        name: "dashboard-01",
        title: "Analytics Dashboard",
        description: "Charts and stats overview",
      },
      { name: "dashboard-02", title: "E-commerce Dashboard", description: "Sales and orders view" },
      { name: "dashboard-03", title: "Project Dashboard", description: "Tasks and team overview" },
      { name: "dashboard-04", title: "Finance Dashboard", description: "Financial metrics view" },
    ],
  },
  {
    category: "Sidebar",
    items: [
      { name: "sidebar-01", title: "Simple Sidebar", description: "Basic navigation sidebar" },
      {
        name: "sidebar-02",
        title: "Collapsible Sidebar",
        description: "Sidebar with collapse toggle",
      },
      {
        name: "sidebar-03",
        title: "Sidebar with Header",
        description: "Sidebar with branding header",
      },
      { name: "sidebar-04", title: "Floating Sidebar", description: "Floating panel sidebar" },
      {
        name: "sidebar-05",
        title: "Sidebar with Footer",
        description: "Sidebar with user profile footer",
      },
    ],
  },
  {
    category: "Cards",
    items: [
      { name: "cards-01", title: "Feature Cards", description: "Grid of feature highlight cards" },
      { name: "cards-02", title: "Pricing Cards", description: "Pricing tier comparison cards" },
      { name: "cards-03", title: "Team Cards", description: "Team member profile cards" },
      { name: "cards-04", title: "Stats Cards", description: "Metric display cards" },
    ],
  },
  {
    category: "Charts",
    items: [
      {
        name: "chart-area-interactive",
        title: "Area Chart",
        description: "Interactive area chart",
      },
      { name: "chart-bar-interactive", title: "Bar Chart", description: "Interactive bar chart" },
      {
        name: "chart-line-interactive",
        title: "Line Chart",
        description: "Interactive line chart",
      },
      { name: "chart-pie-interactive", title: "Pie Chart", description: "Interactive pie chart" },
    ],
  },
];

export function InitFromRepoModal({ isOpen, onClose, onSuccess }: InitFromRepoModalProps) {
  const { user, isAuthenticated, hasGitHub, isInitialized, fetchUser } = useAuth();
  const [sourceType, setSourceType] = useState<SourceType>("github");
  const [githubUrl, setGithubUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [message, setMessage] = useState("");
  const [lockConfigFiles, setLockConfigFiles] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [zipFileName, setZipFileName] = useState<string | null>(null);
  const [zipContent, setZipContent] = useState<string | null>(null);
  const [zipUrl, setZipUrl] = useState("");
  const [preferZip, setPreferZip] = useState(false);
  const [returnTo, setReturnTo] = useState("/projects");
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || isInitialized) return;
    fetchUser().catch(() => {});
  }, [isOpen, isInitialized, fetchUser]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
    const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    setReturnTo(path || "/projects");
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".zip")) {
      toast.error("Please select a ZIP file");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 50MB.");
      return;
    }

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.onload = () => {
          const result = reader.result;
          if (typeof result !== "string") return reject(new Error("Failed to read file"));
          const commaIdx = result.indexOf(",");
          if (commaIdx === -1) return reject(new Error("Invalid file encoding"));
          resolve(result.slice(commaIdx + 1));
        };
        reader.readAsDataURL(file);
      });

      setZipContent(base64);
      setZipFileName(file.name);
      setZipUrl("");
      toast.success(`Selected: ${file.name}`);
    } catch {
      toast.error("Failed to read file");
    }
  };

  const handleSubmit = async () => {
    if (sourceType === "github" && !githubUrl.trim()) {
      toast.error("Please enter a GitHub URL");
      return;
    }
    if (sourceType === "zip" && !zipContent && !zipUrl.trim()) {
      toast.error("Please select a ZIP file or paste a ZIP URL");
      return;
    }
    if (sourceType === "blocks" && !selectedBlock) {
      toast.error("Please select a component block");
      return;
    }

    setIsLoading(true);
    try {
      // Handle blocks differently - use init-registry API
      if (sourceType === "blocks" && selectedBlock) {
        const registryUrl = `https://ui.shadcn.com/r/styles/new-york/${selectedBlock}.json`;

        const response = await fetch("/api/v0/chats/init-registry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ registryUrl }),
        });

        const data = (await response.json().catch(() => null)) as {
          internalChatId?: string;
          error?: string;
          details?: string;
        } | null;
        if (!response.ok) {
          throw new Error(data?.error || data?.details || "Failed to import block");
        }
        if (!data) {
          throw new Error("Failed to parse response");
        }
        const chatId = data.internalChatId;

        if (!chatId) {
          throw new Error("No chat ID returned");
        }

        toast.success("Component imported successfully!");
        onSuccess(chatId);
        onClose();
        return;
      }

      // Handle github/zip as before
      const body: Record<string, unknown> = {
        source:
          sourceType === "github"
            ? {
                type: "github",
                url: githubUrl.trim(),
                branch: branch.trim() || undefined,
                ...(preferZip ? { preferZip: true } : {}),
              }
            : zipUrl.trim()
              ? { type: "zip", url: zipUrl.trim() }
              : { type: "zip", content: zipContent },
        lockConfigFiles,
      };

      if (message.trim()) {
        body.message = message.trim();
      }

      const response = await fetch("/api/v0/chats/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await response.json().catch(() => null)) as {
        id?: string;
        error?: string;
        details?: string;
      } | null;
      if (!response.ok) {
        throw new Error(data?.error || data?.details || "Failed to initialize");
      }
      if (!data) {
        throw new Error("Failed to parse response");
      }
      const chatId = data.id;

      if (!chatId) {
        throw new Error("No chat ID returned");
      }

      toast.success("Project imported successfully!");
      onSuccess(chatId);
      onClose();
    } catch (error) {
      console.error("Init error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to import project");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {sourceType === "blocks" ? "Add Component Block" : "Import Existing Project"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setSourceType("github")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
              sourceType === "github"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <Github className="h-4 w-4" />
            GitHub
          </button>
          <button
            onClick={() => setSourceType("zip")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
              sourceType === "zip"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <FolderArchive className="h-4 w-4" />
            ZIP
          </button>
          <button
            onClick={() => setSourceType("blocks")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
              sourceType === "blocks"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <Blocks className="h-4 w-4" />
            Blocks
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {sourceType === "github" && (
            <div className="mb-6 space-y-4">
              <div>
                <label
                  htmlFor="init-github-url"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Repository URL
                </label>
                <input
                  id="init-github-url"
                  name="githubUrl"
                  type="url"
                  placeholder="https://github.com/username/repo"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  className="focus:border-brand-blue focus:ring-brand-blue/50 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:outline-none"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Public repos work without login. Private repos require a GitHub connection.
                </p>
                {isAuthenticated ? (
                  hasGitHub ? (
                    <p className="mt-2 text-xs text-gray-500">
                      Connected as{" "}
                      <span className="font-medium text-gray-700">@{user?.github_username}</span>
                    </p>
                  ) : (
                    <a
                      href={`/api/auth/github?returnTo=${encodeURIComponent(returnTo)}`}
                      className="text-brand-blue mt-2 inline-flex text-xs hover:underline"
                    >
                      Connect GitHub to import private repos
                    </a>
                  )
                ) : (
                  <p className="mt-2 text-xs text-gray-500">
                    Log in to connect GitHub for private repos.
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="init-branch"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Branch (optional)
                </label>
                <input
                  id="init-branch"
                  name="branch"
                  type="text"
                  placeholder="main"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="focus:border-brand-blue focus:ring-brand-blue/50 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:outline-none"
                />
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-gray-200 p-3">
                <input
                  id="init-prefer-zip"
                  type="checkbox"
                  checked={preferZip}
                  onChange={(e) => setPreferZip(e.target.checked)}
                  className="text-brand-blue focus:ring-brand-blue/50 mt-1 rounded border-gray-300"
                />
                <label htmlFor="init-prefer-zip" className="text-sm text-gray-600">
                  Use ZIP import (helps when GitHub access is limited). Provide a branch if you
                  enable this.
                </label>
              </div>

              <div>
                <label
                  htmlFor="init-message"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Initial Instructions (optional)
                </label>
                <textarea
                  id="init-message"
                  name="message"
                  placeholder="e.g., Add a new contact page with a form"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  className="focus:border-brand-blue focus:ring-brand-blue/50 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:outline-none"
                />
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
                      className="text-brand-blue focus:ring-brand-blue/50 rounded border-gray-300"
                    />
                    <span className="text-brand-amber text-sm font-medium">Lock config files</span>
                  </label>
                  <p className="text-brand-amber/80 mt-1 text-xs">
                    Prevent AI from modifying package.json, config files, and dependencies
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
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  ZIP File
                </label>
                <input
                  id="init-zip-file"
                  name="zipFile"
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-8 text-gray-500 transition-colors hover:border-gray-400 hover:bg-gray-50"
                >
                  <Upload className="h-8 w-8" />
                  {zipFileName ? (
                    <span className="text-sm font-medium text-gray-700">{zipFileName}</span>
                  ) : (
                    <span className="text-sm">Click to select ZIP file (max 50MB)</span>
                  )}
                </button>
              </div>

              <div>
                <label
                  htmlFor="init-zip-url"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Or paste a ZIP URL
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
                  className="focus:border-brand-blue focus:ring-brand-blue/50 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:outline-none"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Use a public ZIP URL for larger projects to avoid upload limits.
                </p>
              </div>

              <div>
                <label
                  htmlFor="init-message-zip"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Initial Instructions (optional)
                </label>
                <textarea
                  id="init-message-zip"
                  name="message"
                  placeholder="e.g., Add a new contact page with a form"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  className="focus:border-brand-blue focus:ring-brand-blue/50 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:outline-none"
                />
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
                      className="text-brand-blue focus:ring-brand-blue/50 rounded border-gray-300"
                    />
                    <span className="text-brand-amber text-sm font-medium">Lock config files</span>
                  </label>
                  <p className="text-brand-amber/80 mt-1 text-xs">
                    Prevent AI from modifying package.json, config files, and dependencies
                  </p>
                </div>
              </div>
            </div>
          )}

          {sourceType === "blocks" && (
            <div className="mb-6 space-y-4">
              <p className="text-sm text-gray-600">
                Select a pre-built shadcn/ui component to start with. You can customize it after
                import.
              </p>

              {SHADCN_BLOCKS.map((category) => (
                <div key={category.category}>
                  <h3 className="mb-2 text-sm font-semibold text-gray-900">{category.category}</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {category.items.map((block) => (
                      <button
                        key={block.name}
                        onClick={() => setSelectedBlock(block.name)}
                        className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                          selectedBlock === block.name
                            ? "border-brand-blue bg-brand-blue/5 ring-brand-blue ring-1"
                            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-900">{block.title}</div>
                          <div className="truncate text-xs text-gray-500">{block.description}</div>
                        </div>
                        {selectedBlock === block.name && (
                          <Check className="text-brand-blue h-4 w-4 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-3 border-t border-gray-100 pt-4">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              isLoading ||
              (sourceType === "github" && !githubUrl.trim()) ||
              (sourceType === "zip" && !zipContent && !zipUrl.trim()) ||
              (sourceType === "blocks" && !selectedBlock)
            }
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : sourceType === "blocks" ? (
              <>
                <Blocks className="h-4 w-4" />
                Import Block
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Import Project
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
