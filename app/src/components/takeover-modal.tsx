"use client";

import { useState, useEffect } from "react";
import {
  X,
  Github,
  Check,
  Loader2,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-store";

interface TakeoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
}

interface TakeoverResult {
  success: boolean;
  message?: string;
  error?: string;
  requireGitHub?: boolean;
  github?: {
    repoUrl: string;
    cloneUrl: string;
    fullName: string;
    owner: string;
    repoName: string;
  };
  filesCount?: number;
}

export function TakeoverModal({
  isOpen,
  onClose,
  projectId,
  projectName,
}: TakeoverModalProps) {
  const { user, refreshUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TakeoverResult | null>(null);
  const [customRepoName, setCustomRepoName] = useState("");

  // Check if user has GitHub connected
  const hasGitHub = !!(user?.github_token && user?.github_username);

  // Generate default repo name
  const defaultRepoName = `sajt-${projectName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")}`;

  useEffect(() => {
    if (isOpen) {
      setResult(null);
      setCustomRepoName("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnectGitHub = () => {
    // Redirect to GitHub OAuth
    const returnTo = window.location.pathname;
    window.location.href = `/api/auth/github?returnTo=${encodeURIComponent(
      returnTo
    )}`;
  };

  const handleTakeover = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/takeover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoName: customRepoName || undefined,
        }),
      });

      const data: TakeoverResult = await response.json();
      setResult(data);

      if (data.success) {
        // Refresh user data in case we need it
        refreshUser();
      }
    } catch (error) {
      setResult({
        success: false,
        error: "Något gick fel. Försök igen.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Sparkles className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Ta över projekt
              </h2>
              <p className="text-sm text-gray-400">
                Flytta till GitHub för full kontroll
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Success state */}
          {result?.success && result.github && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                <Check className="h-6 w-6 text-green-500" />
                <div>
                  <p className="text-green-400 font-medium">
                    Projektet har tagits över!
                  </p>
                  <p className="text-sm text-gray-400">
                    {result.filesCount} filer pushade till GitHub
                  </p>
                </div>
              </div>

              <div className="p-4 bg-gray-800/50 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <Github className="h-5 w-5 text-gray-400" />
                  <span className="text-white font-mono text-sm">
                    {result.github.fullName}
                  </span>
                </div>

                <a
                  href={result.github.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-teal-400 hover:text-teal-300 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Öppna på GitHub
                </a>
              </div>

              <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl">
                <p className="text-sm text-purple-300">
                  <strong>Nästa steg:</strong> Du kan nu redigera projektet med
                  AI direkt från editorn. Alla ändringar sparas automatiskt till
                  GitHub!
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {result && !result.success && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-red-400">{result.error}</p>
              {result.requireGitHub && (
                <Button
                  onClick={handleConnectGitHub}
                  className="mt-3 bg-gray-800 hover:bg-gray-700"
                >
                  <Github className="h-4 w-4 mr-2" />
                  Anslut GitHub
                </Button>
              )}
            </div>
          )}

          {/* Initial state - not started */}
          {!result && (
            <>
              {/* GitHub connection check */}
              {!hasGitHub ? (
                <div className="space-y-4">
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                    <p className="text-amber-400">
                      Du måste ansluta ditt GitHub-konto för att kunna ta över
                      projekt.
                    </p>
                  </div>

                  <Button
                    onClick={handleConnectGitHub}
                    className="w-full bg-gray-800 hover:bg-gray-700"
                  >
                    <Github className="h-5 w-5 mr-2" />
                    Anslut GitHub-konto
                  </Button>
                </div>
              ) : (
                <>
                  {/* GitHub connected - show takeover options */}
                  <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                    <Github className="h-5 w-5 text-gray-400" />
                    <span className="text-gray-300">
                      Ansluten som{" "}
                      <strong className="text-white">
                        {user?.github_username}
                      </strong>
                    </span>
                    <Check className="h-4 w-4 text-green-500 ml-auto" />
                  </div>

                  {/* What happens */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-gray-400">
                      Vad händer?
                    </h3>
                    <ul className="space-y-2 text-sm text-gray-300">
                      <li className="flex items-start gap-2">
                        <span className="text-teal-500 mt-0.5">1.</span>
                        Ett nytt privat repo skapas på ditt GitHub
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-teal-500 mt-0.5">2.</span>
                        All kod pushas dit automatiskt
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-teal-500 mt-0.5">3.</span>
                        Du kan sedan redigera med AI (1 💎/ändring)
                      </li>
                    </ul>
                  </div>

                  {/* Custom repo name */}
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">
                      Repo-namn (valfritt)
                    </label>
                    <input
                      type="text"
                      value={customRepoName}
                      onChange={(e) => setCustomRepoName(e.target.value)}
                      placeholder={defaultRepoName}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-800 flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
            disabled={isLoading}
          >
            {result?.success ? "Stäng" : "Avbryt"}
          </Button>

          {!result?.success && hasGitHub && (
            <Button
              onClick={handleTakeover}
              disabled={isLoading}
              className="flex-1 bg-purple-600 hover:bg-purple-500 text-white"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Tar över...
                </span>
              ) : (
                <>
                  <Github className="h-4 w-4 mr-2" />
                  Ta över till GitHub
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
