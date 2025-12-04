"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef, KeyboardEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ClientOnly } from "@/components/client-only";
import { ShaderBackground } from "@/components/shader-background";
import { useAuth } from "@/lib/auth-store";
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
} from "lucide-react";

/**
 * Owned Project Editor
 *
 * This page is for editing "taken over" projects using the OpenAI Agent.
 * Instead of v0 refinement, changes are made directly to the GitHub repo.
 *
 * URL: /project/[repoId]?owner=username
 * Example: /project/my-site?owner=johndoe
 */

interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  updatedFiles?: { path: string; content: string }[];
  timestamp: Date;
}

interface AgentResponse {
  success: boolean;
  message?: string;
  error?: string;
  updatedFiles?: { path: string; content: string }[];
  responseId?: string;
  newBalance?: number;
  requireAuth?: boolean;
  requireGitHub?: boolean;
  requireCredits?: boolean;
}

function OwnedProjectContent() {
  const params = useParams();
  const searchParams = useSearchParams();

  const repoId = params.repoId as string;
  const owner = searchParams.get("owner");
  const repoFullName = owner ? `${owner}/${repoId}` : null;

  const { user, isAuthenticated, diamonds, fetchUser, hasGitHub } = useAuth();

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [previousResponseId, setPreviousResponseId] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

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
    if (!input.trim() || isLoading || !repoFullName) return;

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
      const response = await fetch("/api/agent/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: userMessage.content,
          repoFullName,
          previousResponseId,
        }),
      });

      const data: AgentResponse = await response.json();

      if (data.success) {
        const assistantMessage: AgentMessage = {
          id: `msg_${Date.now()}`,
          role: "assistant",
          content: data.message || "Ändringar genomförda.",
          updatedFiles: data.updatedFiles,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setPreviousResponseId(data.responseId || null);

        // Refresh user to update diamond balance
        if (data.newBalance !== undefined) {
          fetchUser();
        }
      } else {
        setError(data.error || "Något gick fel");

        // Add error as assistant message
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

  // Missing repo info
  if (!repoFullName) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto" />
          <h1 className="text-xl font-semibold text-white">Repo saknas</h1>
          <p className="text-gray-400">
            URL måste inkludera owner parameter, t.ex.
            <code className="ml-2 px-2 py-1 bg-gray-800 rounded text-teal-400">
              /project/my-site?owner=username
            </code>
          </p>
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

  // No GitHub connected
  if (!hasGitHub) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <Github className="h-12 w-12 text-gray-500 mx-auto" />
          <h1 className="text-xl font-semibold text-white">
            Anslut GitHub först
          </h1>
          <p className="text-gray-400">
            Du måste ansluta ditt GitHub-konto för att redigera projekt.
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
      <ShaderBackground color="#200030" speed={0.15} opacity={0.25} />

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
            <span className="font-semibold text-white">AI Editor</span>
            <span className="text-gray-600">|</span>
            <span className="text-gray-400 font-mono text-sm">
              {repoFullName}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Diamond counter */}
          <Link href="/buy-credits">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/50 border border-amber-500/30 hover:border-amber-500/60 transition-colors cursor-pointer group">
              <Diamond className="h-4 w-4 text-amber-400 group-hover:text-amber-300" />
              <span className="text-sm font-semibold text-amber-400 group-hover:text-amber-300">
                {diamonds}
              </span>
            </div>
          </Link>

          <div className="h-5 w-px bg-gray-800" />

          {/* GitHub link */}
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
              Visa på GitHub
              <ExternalLink className="h-3 w-3" />
            </Button>
          </a>
        </div>
      </header>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex overflow-hidden">
        {/* Chat Panel */}
        <div className="w-full max-w-3xl mx-auto flex flex-col bg-black/70 backdrop-blur-sm">
          {/* Welcome message if no messages */}
          {messages.length === 0 && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-4 max-w-md">
                <div className="p-4 bg-purple-500/20 rounded-full w-fit mx-auto">
                  <Sparkles className="h-8 w-8 text-purple-400" />
                </div>
                <h2 className="text-xl font-semibold text-white">
                  AI-driven kodredigering
                </h2>
                <p className="text-gray-400">
                  Beskriv vad du vill ändra i din kod. AI:n läser dina filer,
                  gör ändringarna och committar direkt till GitHub.
                </p>
                <div className="p-4 bg-gray-800/50 rounded-xl text-left space-y-2">
                  <p className="text-sm text-gray-500">
                    Exempel på instruktioner:
                  </p>
                  <ul className="text-sm text-gray-400 space-y-1">
                    <li>• &quot;Ändra färgtemat till mörkblått&quot;</li>
                    <li>• &quot;Lägg till en kontaktsektion&quot;</li>
                    <li>• &quot;Gör hero-sektionen större&quot;</li>
                    <li>• &quot;Byt typsnitt till Inter&quot;</li>
                  </ul>
                </div>
                <p className="text-xs text-gray-500">
                  💎 1 diamant per redigering
                </p>
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
                    className={`max-w-[80%] p-4 rounded-2xl ${
                      msg.role === "user"
                        ? "bg-purple-600 text-white"
                        : "bg-gray-800 text-gray-200"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>

                    {/* Updated files list */}
                    {msg.updatedFiles && msg.updatedFiles.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-700 space-y-2">
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
                  <div className="bg-gray-800 p-4 rounded-2xl">
                    <div className="flex items-center gap-2 text-gray-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>AI:n arbetar...</span>
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
                placeholder="Beskriv vad du vill ändra..."
                rows={2}
                className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
                disabled={isLoading}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
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
              Tryck Enter för att skicka, Shift+Enter för ny rad
            </p>
          </div>
        </div>
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
