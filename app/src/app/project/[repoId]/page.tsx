"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef, KeyboardEvent, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ClientOnly } from "@/components/client-only";
import { ShaderBackground } from "@/components/shader-background";
import { useAuth } from "@/lib/auth-store";
import {
  AgentModeSelector,
  AgentMode,
  getModeCost,
} from "@/components/agent-mode-selector";
import { PreviewPanel } from "@/components/preview-panel";
import { CostIndicator } from "@/components/cost-indicator";
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
  const projectId = useMemo(() => isGitHubMode ? `${owner}_${repoId}` : repoId, [isGitHubMode, owner, repoId]);
  const repoFullName = useMemo(() => isGitHubMode ? `${owner}/${repoId}` : null, [isGitHubMode, owner, repoId]);
  const displayName = useMemo(() => repoFullName || repoId, [repoFullName, repoId]);

  const { user, isAuthenticated, diamonds, fetchUser, hasGitHub, refreshUser } = useAuth();

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [previousResponseId, setPreviousResponseId] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  // New state for advanced features
  const [selectedMode, setSelectedMode] = useState<AgentMode>("code_edit");
  const [showPreview, setShowPreview] = useState(true);
  const [lastUpdatedFile, setLastUpdatedFile] = useState<{
    path: string;
    content: string;
  } | null>(null);
  const [lastGeneratedImage, setLastGeneratedImage] = useState<{
    base64: string;
    path: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch user on mount
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // Handle sending a message
  const handleSend = async () => {
    if (!input.trim() || isLoading || !projectId) return;

    const cost = getModeCost(selectedMode);
    if (diamonds < cost) {
      setError(`Du behöver ${cost} diamanter för denna åtgärd.`);
      return;
    }

    const userMessage: AgentMessage = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: input.trim(),
      mode: selectedMode,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/agent/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: userMessage.content,
          projectId, // Use the resolved projectId (works for both Redis and GitHub mode)
          taskType: selectedMode,
          previousResponseId,
        }),
      });

      let data: AgentResponse;
      try {
        data = await response.json();
      } catch (jsonError) {
        const errorMsg = jsonError instanceof Error ? jsonError.message : "Okänt fel";
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
        setPreviousResponseId(data.responseId || null);

        // Update preview state
        if (data.updatedFiles && data.updatedFiles.length > 0) {
          setLastUpdatedFile(data.updatedFiles[data.updatedFiles.length - 1]);
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

  // No GitHub connected (only required for GitHub mode)
  // Refresh user data to ensure hasGitHub is up-to-date
  useEffect(() => {
    if (isGitHubMode) {
      refreshUser();
    }
  }, [isGitHubMode, refreshUser]);
  
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
            <a href={`/api/projects/${encodeURIComponent(projectId)}/download`} download>
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

      {/* Mode selector bar */}
      <div className="relative z-20 px-4 py-2 border-b border-gray-800 bg-black/60 backdrop-blur-sm flex items-center justify-between">
        <AgentModeSelector
          selectedMode={selectedMode}
          onModeChange={setSelectedMode}
          disabled={isLoading}
        />
        <CostIndicator mode={selectedMode} currentBalance={diamonds} />
      </div>

      {/* Main content - Split view */}
      <div className="relative z-10 flex-1 flex overflow-hidden">
        {/* Chat Panel */}
        <div
          className={`flex flex-col bg-black/70 backdrop-blur-sm ${
            showPreview ? "w-1/2 border-r border-gray-800" : "w-full"
          }`}
        >
          {/* Welcome message if no messages */}
          {messages.length === 0 && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-4 max-w-md">
                <div className="p-4 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full w-fit mx-auto">
                  <Sparkles className="h-8 w-8 text-purple-400" />
                </div>
                <h2 className="text-xl font-semibold text-white">
                  AI Studio - GPT-5
                </h2>
                <p className="text-gray-400">
                  Välj ett läge ovan och beskriv vad du vill göra. AI:n använder
                  rätt modell och verktyg automatiskt.
                </p>
                <div className="grid grid-cols-2 gap-3 text-left">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <FileCode className="h-4 w-4 text-emerald-400 mb-1" />
                    <p className="text-xs text-emerald-400 font-medium">Kod</p>
                    <p className="text-xs text-gray-500">
                      Redigera komponenter, lägg till sektioner
                    </p>
                  </div>
                  <div className="p-3 bg-pink-500/10 border border-pink-500/20 rounded-lg">
                    <ImageIcon className="h-4 w-4 text-pink-400 mb-1" />
                    <p className="text-xs text-pink-400 font-medium">Media</p>
                    <p className="text-xs text-gray-500">
                      Generera loggor, hero-bilder
                    </p>
                  </div>
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <Globe className="h-4 w-4 text-amber-400 mb-1" />
                    <p className="text-xs text-amber-400 font-medium">Sök</p>
                    <p className="text-xs text-gray-500">
                      Hitta inspiration, ikoner, typsnitt
                    </p>
                  </div>
                  <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                    <Sparkles className="h-4 w-4 text-purple-400 mb-1" />
                    <p className="text-xs text-purple-400 font-medium">
                      Avancerat
                    </p>
                    <p className="text-xs text-gray-500">
                      Tung refaktorering, design system
                    </p>
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
                    {/* Mode badge for user messages */}
                    {msg.role === "user" && msg.mode && (
                      <span className="inline-block px-2 py-0.5 mb-2 text-xs bg-white/10 rounded text-white/70">
                        {msg.mode === "code_edit" && "Kod"}
                        {msg.mode === "copy" && "Copy"}
                        {msg.mode === "image" && "Media"}
                        {msg.mode === "web_search" && "Sök"}
                        {msg.mode === "code_refactor" && "Avancerat"}
                      </span>
                    )}

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
                      <span>
                        {selectedMode === "image"
                          ? "Genererar bild..."
                          : selectedMode === "web_search"
                          ? "Söker på webben..."
                          : selectedMode === "code_refactor"
                          ? "Analyserar kodbas..."
                          : "AI:n arbetar..."}
                      </span>
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
                placeholder={
                  selectedMode === "code_edit"
                    ? "Beskriv vad du vill ändra i koden..."
                    : selectedMode === "copy"
                    ? "Beskriv vilken text du vill generera..."
                    : selectedMode === "image"
                    ? "Beskriv bilden du vill generera (logga, hero, etc)..."
                    : selectedMode === "web_search"
                    ? "Vad vill du söka efter?"
                    : "Beskriv den stora ändringen du vill göra..."
                }
                rows={2}
                className="flex-1 px-4 py-3 bg-gray-800/80 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
                disabled={isLoading}
              />
              <Button
                onClick={handleSend}
                disabled={
                  !input.trim() ||
                  isLoading ||
                  diamonds < getModeCost(selectedMode)
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
              Enter = skicka • Shift+Enter = ny rad • GPT-5{" "}
              {selectedMode === "code_refactor" || selectedMode === "image"
                ? ""
                : "-mini"}
            </p>
          </div>
        </div>

        {/* Preview Panel */}
        {showPreview && (
          <div className="w-1/2 p-4">
            <PreviewPanel
              previewUrl={undefined} // TODO: Add render/github pages URL
              lastUpdatedFile={lastUpdatedFile || undefined}
              generatedImage={lastGeneratedImage || undefined}
              className="h-full"
            />
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
