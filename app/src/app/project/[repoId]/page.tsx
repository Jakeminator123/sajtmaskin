"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef, KeyboardEvent, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ClientOnly } from "@/components/client-only";
import { ShaderBackground } from "@/components/shader-background";
import { useAuth } from "@/lib/auth-store";
// AgentMode type for response taskType (auto-detected by backend)
type AgentMode =
  | "code_edit"
  | "copy"
  | "image"
  | "web_search"
  | "code_refactor"
  | "analyze";
import { PreviewPanel } from "@/components/preview-panel";
import {
  ArrowLeft,
  Github,
  Send,
  Loader2,
  Diamond,
  ExternalLink,
  FileCode,
  Check,
  AlertCircle,
  Sparkles,
  Image as ImageIcon,
  Globe,
  PanelRightClose,
  PanelRight,
  Download,
} from "lucide-react";

/**
 * Owned Project Editor - Advanced AI Dashboard
 *
 * Features:
 * - Multiple AI modes (Code, Copy, Media, Search, Advanced)
 * - GPT-5 model selection based on task type
 * - Split-view with live preview
 * - Image generation support
 * - Web search integration
 *
 * URL FORMATS:
 * 1. GitHub mode: /project/[repoId]?owner=username
 *    - repoId = GitHub repo name
 *    - owner = GitHub username
 *
 * 2. Redis mode: /project/[projectId]
 *    - projectId = Database project ID (UUID)
 *    - No owner parameter needed
 */

interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  updatedFiles?: { path: string; content: string }[];
  generatedImages?: { base64: string; path: string; prompt: string }[];
  webSearchSources?: { title: string; url: string }[];
  mode?: AgentMode;
  timestamp: Date;
}

interface AgentResponse {
  success: boolean;
  message?: string;
  error?: string;
  updatedFiles?: { path: string; content: string }[];
  generatedImages?: { base64: string; path: string; prompt: string }[];
  webSearchSources?: { title: string; url: string }[];
  responseId?: string;
  newBalance?: number;
  requireAuth?: boolean;
  requireGitHub?: boolean;
  requireCredits?: boolean;
  taskType?: AgentMode;
  diamondCost?: number;
}

function OwnedProjectContent() {
  const params = useParams();
  const searchParams = useSearchParams();

  const repoId = params.repoId as string;
  const owner = searchParams.get("owner");

  // Determine mode and project ID:
  // - GitHub mode: owner param exists → projectId = "owner_repo", repoFullName for display
  // - Redis mode: no owner → projectId = repoId (database UUID)
  const isGitHubMode = useMemo(() => !!owner, [owner]);
  // Sanitize owner and repoId to prevent injection issues
  const sanitizedOwner = useMemo(
    () => (owner ? owner.replace(/[^a-zA-Z0-9_-]/g, "") : null),
    [owner]
  );
  const sanitizedRepoId = useMemo(
    () => (repoId ? repoId.replace(/[^a-zA-Z0-9_-]/g, "") : ""),
    [repoId]
  );
  const projectId = useMemo(
    () =>
      isGitHubMode && sanitizedOwner && sanitizedRepoId
        ? `${sanitizedOwner}_${sanitizedRepoId}`
        : sanitizedRepoId || repoId,
    [isGitHubMode, sanitizedOwner, sanitizedRepoId, repoId]
  );
  const repoFullName = useMemo(
    () =>
      isGitHubMode && sanitizedOwner && sanitizedRepoId
        ? `${sanitizedOwner}/${sanitizedRepoId}`
        : null,
    [isGitHubMode, sanitizedOwner, sanitizedRepoId]
  );
  const displayName = useMemo(
    () => repoFullName || sanitizedRepoId || repoId,
    [repoFullName, sanitizedRepoId, repoId]
  );

  const { user, isAuthenticated, diamonds, fetchUser, hasGitHub, refreshUser } =
    useAuth();

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [previousResponseId, setPreviousResponseId] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  // Preview state
  const [showPreview, setShowPreview] = useState(true);
  const [lastUpdatedFile, setLastUpdatedFile] = useState<{
    path: string;
    content: string;
  } | null>(null);
  const [lastGeneratedImage, setLastGeneratedImage] = useState<{
    base64: string;
    path: string;
  } | null>(null);
  const [projectFiles, setProjectFiles] = useState<
    { path: string; content: string }[]
  >([]);
  const [isProjectLoading, setIsProjectLoading] = useState(true);
  const [projectLoadError, setProjectLoadError] = useState<string | null>(null);
  const [projectDemoUrl, setProjectDemoUrl] = useState<string | null>(null);
  const [isRegeneratingPreview, setIsRegeneratingPreview] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-regenerate preview after AI changes
  const regeneratePreview = async () => {
    if (!projectId || isRegeneratingPreview) return;

    setIsRegeneratingPreview(true);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/preview`,
        {
          method: "POST",
        }
      );
      const data = await response.json();
      if (data.success && data.demoUrl) {
        setProjectDemoUrl(data.demoUrl);
      }
    } catch (err) {
      console.error("Preview regeneration failed:", err);
    } finally {
      setIsRegeneratingPreview(false);
    }
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch user on mount
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // No GitHub connected (only required for GitHub mode)
  // Refresh user data to ensure hasGitHub is up-to-date
  useEffect(() => {
    if (isGitHubMode) {
      refreshUser();
    }
  }, [isGitHubMode, refreshUser]);

  // Load project files and demoUrl (Redis mode) so editor/preview can show content immediately
  useEffect(() => {
    let cancelled = false;

    const loadProjectData = async () => {
      if (!projectId) return;

      // GitHub projects are edited via GitHub storage, no direct file fetch here
      if (isGitHubMode) {
        setIsProjectLoading(false);
        setProjectLoadError(null);
        return;
      }

      setIsProjectLoading(true);
      setProjectLoadError(null);

      try {
        // Fetch project data to get demoUrl for preview
        const projectRes = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}`
        );
        if (projectRes.ok) {
          const projectData = await projectRes.json();
          if (projectData.success && projectData.data?.demo_url) {
            setProjectDemoUrl(projectData.data.demo_url);
          }
        }

        // Fetch files from Redis/takeover storage
        const res = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/files`
        );
        const data = await res.json();

        if (cancelled) return;

        if (!res.ok || !data.success) {
          throw new Error(data.error || "Kunde inte ladda projektfiler");
        }

        const files = (data.files as { path: string; content: string }[]) || [];
        setProjectFiles(files);

        // Show first file in preview if nothing has been updated yet
        if (files.length > 0) {
          setLastUpdatedFile((prev) => prev ?? files[0]);
        }
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : "Kunde inte ladda projektfiler";
        setProjectLoadError(msg);
      } finally {
        if (!cancelled) {
          setIsProjectLoading(false);
        }
      }
    };

    loadProjectData();

    return () => {
      cancelled = true;
    };
  }, [projectId, isGitHubMode]);

  // Handle sending a message
  const handleSend = async () => {
    if (!input.trim() || isLoading || !projectId) return;

    if (isProjectLoading) {
      setError("Vänta tills projektet har laddats färdigt.");
      return;
    }
    if (projectLoadError) {
      setError(`Projektet är inte redo: ${projectLoadError}`);
      return;
    }

    // Refresh user data to get latest diamond balance before checking
    await refreshUser();
    const latestDiamonds = user?.diamonds ?? 0;
    // Minimum cost is 1 diamond (code_edit) - API will determine actual cost
    if (latestDiamonds < 1) {
      setError(
        `Du behöver minst 1 diamant för att använda AI. Du har ${latestDiamonds}.`
      );
      return;
    }

    const userMessage: AgentMessage = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      // Let API auto-detect the task type based on instruction
      const response = await fetch("/api/agent/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: userMessage.content,
          projectId,
          ...(previousResponseId && { previousResponseId }),
        }),
      });

      let data: AgentResponse;
      try {
        data = await response.json();
      } catch (jsonError) {
        const errorMsg =
          jsonError instanceof Error ? jsonError.message : "Okänt fel";
        setError(`Kunde inte läsa svar från servern: ${errorMsg}`);
        return;
      }

      if (data.success) {
        const assistantMessage: AgentMessage = {
          id: `msg_${Date.now()}`,
          role: "assistant",
          content: data.message || "Ändringar genomförda.",
          updatedFiles: data.updatedFiles,
          generatedImages: data.generatedImages,
          webSearchSources: data.webSearchSources,
          mode: data.taskType,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
        // Save response ID for continuation (only if provided and valid)
        if (data.responseId && typeof data.responseId === "string") {
          setPreviousResponseId(data.responseId);
        } else {
          // Clear previous response ID if not provided or invalid
          setPreviousResponseId(null);
        }

        // Update preview state with new/changed files
        if (data.updatedFiles && data.updatedFiles.length > 0) {
          const latestFile = data.updatedFiles[data.updatedFiles.length - 1];
          setLastUpdatedFile(latestFile);

          // Merge updated files into projectFiles for live preview
          setProjectFiles((prevFiles) => {
            const updatedPaths = new Set(data.updatedFiles!.map((f) => f.path));
            // Keep files that weren't updated, add/replace updated ones
            const unchanged = prevFiles.filter(
              (f) => !updatedPaths.has(f.path)
            );
            return [...unchanged, ...data.updatedFiles!];
          });

          // Auto-regenerate preview after code changes
          regeneratePreview();
        }
        if (data.generatedImages && data.generatedImages.length > 0) {
          setLastGeneratedImage(data.generatedImages[0]);
        }

        // Refresh user to update diamond balance
        if (data.newBalance !== undefined) {
          fetchUser();
        }
      } else {
        setError(data.error || "Något gick fel");

        const errorMessage: AgentMessage = {
          id: `msg_${Date.now()}`,
          role: "assistant",
          content: `❌ ${data.error || "Något gick fel"}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Nätverksfel";
      setError(errorMsg);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Missing project ID (shouldn't happen if URL is valid)
  if (!projectId) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto" />
          <h1 className="text-xl font-semibold text-white">Projekt saknas</h1>
          <p className="text-gray-400">Inget projekt-ID angivet i URL:en.</p>
          <Link href="/projects">
            <Button className="bg-teal-600 hover:bg-teal-500">
              Gå till Mina Projekt
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto" />
          <h1 className="text-xl font-semibold text-white">
            Logga in för att fortsätta
          </h1>
          <p className="text-gray-400">
            Du måste vara inloggad för att redigera projekt.
          </p>
        </div>
      </div>
    );
  }

  if (isGitHubMode && !hasGitHub) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <Github className="h-12 w-12 text-gray-500 mx-auto" />
          <h1 className="text-xl font-semibold text-white">
            Anslut GitHub först
          </h1>
          <p className="text-gray-400">
            Du måste ansluta ditt GitHub-konto för att redigera GitHub-projekt.
          </p>
          <a
            href={`/api/auth/github?returnTo=/project/${repoId}?owner=${owner}`}
          >
            <Button className="bg-gray-800 hover:bg-gray-700">
              <Github className="h-4 w-4 mr-2" />
              Anslut GitHub
            </Button>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Background */}
      <ShaderBackground color="#150025" speed={0.12} opacity={0.2} />

      {/* Header */}
      <header className="relative z-20 h-14 border-b border-gray-800 flex items-center justify-between px-4 bg-black/80 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Link href="/projects">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-gray-400 hover:text-white hover:bg-gray-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Projekt
            </Button>
          </Link>
          <div className="h-5 w-px bg-gray-800" />
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-400" />
            <span className="font-semibold text-white">AI Studio</span>
            <span className="text-gray-600">|</span>
            <span className="text-gray-400 font-mono text-sm">
              {displayName}
            </span>
            {!isProjectLoading && projectFiles.length > 0 && (
              <span className="text-gray-500 text-xs">
                · {projectFiles.length} filer
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Diamond counter */}
          <Link href="/buy-credits">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/50 border border-amber-500/30 hover:border-amber-500/60 transition-colors cursor-pointer group">
              <Diamond className="h-4 w-4 text-amber-400 group-hover:text-amber-300" />
              <span className="text-sm font-semibold text-amber-400 group-hover:text-amber-300">
                {diamonds ?? 0}
              </span>
            </div>
          </Link>

          <div className="h-5 w-px bg-gray-800" />

          {/* Toggle preview */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
            className="gap-2 text-gray-400 hover:text-white"
          >
            {showPreview ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRight className="h-4 w-4" />
            )}
          </Button>

          {/* Download ZIP button (only for Redis mode) */}
          {!isGitHubMode && projectId && (
            <a
              href={`/api/projects/${encodeURIComponent(projectId)}/download`}
              download
            >
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-gray-700 text-gray-300 hover:bg-gray-800"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">ZIP</span>
              </Button>
            </a>
          )}

          {/* GitHub link (only show in GitHub mode) */}
          {isGitHubMode && repoFullName && (
            <a
              href={`https://github.com/${repoFullName}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-gray-700 text-gray-300 hover:bg-gray-800"
              >
                <Github className="h-4 w-4" />
                <span className="hidden sm:inline">GitHub</span>
                <ExternalLink className="h-3 w-3" />
              </Button>
            </a>
          )}
        </div>
      </header>

      {/* Main content - Split view */}
      <div className="relative z-10 flex-1 flex overflow-hidden">
        {/* Chat Panel */}
        <div
          className={`flex flex-col bg-black/70 backdrop-blur-sm ${
            showPreview ? "w-1/2 border-r border-gray-800" : "w-full"
          }`}
        >
          {isProjectLoading && (
            <div className="px-4 py-3 border-b border-purple-800 bg-purple-500/10 text-sm text-purple-300 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
              <span>Laddar projektfiler från Redis...</span>
            </div>
          )}
          {projectLoadError && (
            <div className="px-4 py-3 border-b border-red-800 bg-red-500/10 text-sm text-red-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span>{projectLoadError}</span>
            </div>
          )}
          {!isProjectLoading &&
            !projectLoadError &&
            projectFiles.length === 0 && (
              <div className="px-4 py-3 border-b border-amber-800 bg-amber-500/10 text-sm text-amber-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span>
                  Inga filer hittades i projektet. Gör en takeover från Builder
                  först.
                </span>
              </div>
            )}
          {!isProjectLoading &&
            !projectLoadError &&
            projectFiles.length > 0 && (
              <div className="px-4 py-3 border-b border-gray-800 text-sm text-gray-400 flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>
                  {projectFiles.length} filer laddade. Välj ett läge och beskriv
                  din ändring.
                </span>
              </div>
            )}
          {/* Welcome message if no messages */}
          {messages.length === 0 && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-4 max-w-md">
                <div className="p-4 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full w-fit mx-auto">
                  <Sparkles className="h-8 w-8 text-purple-400" />
                </div>
                <h2 className="text-xl font-semibold text-white">AI Studio</h2>
                <p className="text-gray-400">
                  Beskriv vad du vill göra med ditt projekt. AI:n väljer
                  automatiskt rätt verktyg.
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                  <div className="flex items-center gap-2 p-2 bg-gray-800/30 rounded">
                    <FileCode className="h-3 w-3 text-emerald-400" />
                    <span>Kod &amp; komponenter</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-gray-800/30 rounded">
                    <ImageIcon className="h-3 w-3 text-pink-400" />
                    <span>Bilder &amp; loggor</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-gray-800/30 rounded">
                    <Globe className="h-3 w-3 text-amber-400" />
                    <span>Sök &amp; research</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-gray-800/30 rounded">
                    <Sparkles className="h-3 w-3 text-purple-400" />
                    <span>Refaktorering</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.length > 0 && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] p-4 rounded-2xl ${
                      msg.role === "user"
                        ? "bg-purple-600/80 text-white"
                        : "bg-gray-800/80 text-gray-200"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>

                    {/* Updated files list */}
                    {msg.updatedFiles && msg.updatedFiles.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-700/50 space-y-2">
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <FileCode className="h-3 w-3" />
                          Uppdaterade filer:
                        </p>
                        {msg.updatedFiles.map((file, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 text-sm"
                          >
                            <Check className="h-3 w-3 text-green-500" />
                            <code className="text-teal-400 font-mono text-xs">
                              {file.path}
                            </code>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Generated images */}
                    {msg.generatedImages && msg.generatedImages.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-700/50 space-y-2">
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <ImageIcon className="h-3 w-3" />
                          Genererade bilder:
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {msg.generatedImages.map((img, idx) => (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              key={idx}
                              src={`data:image/png;base64,${img.base64}`}
                              alt={`Generated ${idx + 1}`}
                              className="rounded-lg border border-gray-700 max-h-40 object-cover"
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Web search sources */}
                    {msg.webSearchSources &&
                      msg.webSearchSources.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-700/50 space-y-2">
                          <p className="text-xs text-gray-400 flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            Källor:
                          </p>
                          {msg.webSearchSources
                            .slice(0, 5)
                            .map((source, idx) => (
                              <a
                                key={idx}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300"
                              >
                                <ExternalLink className="h-3 w-3" />
                                {source.title}
                              </a>
                            ))}
                        </div>
                      )}

                    <p className="text-xs text-gray-500 mt-2">
                      {msg.timestamp.toLocaleTimeString("sv-SE", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-800/80 p-4 rounded-2xl">
                    <div className="flex items-center gap-2 text-gray-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>AI:n arbetar...</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview regenerating indicator */}
              {!isLoading && isRegeneratingPreview && (
                <div className="flex justify-start">
                  <div className="bg-purple-800/50 p-4 rounded-2xl border border-purple-500/30">
                    <div className="flex items-center gap-2 text-purple-300">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Uppdaterar live preview...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input area */}
          <div className="p-4 border-t border-gray-800">
            {error && (
              <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Beskriv vad du vill göra..."
                rows={2}
                className="flex-1 px-4 py-3 bg-gray-800/80 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
                disabled={isLoading}
              />
              <Button
                onClick={handleSend}
                disabled={
                  !input.trim() ||
                  isLoading ||
                  isProjectLoading ||
                  !!projectLoadError ||
                  diamonds < 1
                }
                className="px-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>

            <p className="mt-2 text-xs text-gray-500 text-center">
              Enter = skicka • Shift+Enter = ny rad
            </p>
          </div>
        </div>

        {/* Preview Panel */}
        {showPreview && (
          <div className="w-1/2 p-4 relative">
            <PreviewPanel
              previewUrl={projectDemoUrl || undefined}
              lastUpdatedFile={
                lastUpdatedFile ||
                (projectFiles.length > 0 ? projectFiles[0] : undefined)
              }
              generatedImage={lastGeneratedImage || undefined}
              projectFiles={projectFiles}
              isLoading={isProjectLoading || isRegeneratingPreview}
              className="h-full"
              projectId={projectId}
              onPreviewGenerated={(demoUrl) => setProjectDemoUrl(demoUrl)}
            />
            {/* Show regenerating indicator */}
            {isRegeneratingPreview && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-xl">
                <div className="text-center space-y-2">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-400 mx-auto" />
                  <p className="text-sm text-white">Uppdaterar preview...</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Loading fallback
function LoadingFallback() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-3 h-3 bg-purple-500 animate-pulse"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function OwnedProjectPage() {
  return (
    <ClientOnly fallback={<LoadingFallback />}>
      <OwnedProjectContent />
    </ClientOnly>
  );
}
