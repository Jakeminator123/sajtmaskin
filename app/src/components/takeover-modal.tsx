"use client";

import { useState, useEffect } from "react";
import {
  X,
  Github,
  Check,
  Loader2,
  ExternalLink,
  Sparkles,
  Zap,
  Cloud,
  ArrowRight,
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
  mode?: "redis" | "github";
  requireGitHub?: boolean;
  github?: {
    repoUrl: string;
    cloneUrl: string;
    fullName: string;
    owner: string;
    repoName: string;
  };
  filesCount?: number;
  files?: { path: string; size: number }[];
}

type TakeoverMode = "simple" | "github";

export function TakeoverModal({
  isOpen,
  onClose,
  projectId,
  projectName,
}: TakeoverModalProps) {
  const { user, refreshUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TakeoverResult | null>(null);
  const [selectedMode, setSelectedMode] = useState<TakeoverMode>("simple");
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
      setSelectedMode("simple");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnectGitHub = () => {
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
          mode: selectedMode === "simple" ? "redis" : "github",
          repoName:
            selectedMode === "github" ? customRepoName || undefined : undefined,
        }),
      });

      const data: TakeoverResult = await response.json();
      setResult(data);

      if (data.success) {
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
                Redigera med AI när som helst
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
          {/* Success state - Redis */}
          {result?.success && result.mode === "redis" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                <Check className="h-6 w-6 text-green-500" />
                <div>
                  <p className="text-green-400 font-medium">
                    Projektet är redo att redigera!
                  </p>
                  <p className="text-sm text-gray-400">
                    {result.filesCount} filer sparade
                  </p>
                </div>
              </div>

              <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl">
                <p className="text-sm text-purple-300">
                  <strong>Nästa steg:</strong> Gå till &quot;Mina projekt&quot;
                  och klicka på projektet för att börja redigera med AI. Varje
                  ändring kostar 1 💎.
                </p>
              </div>
            </div>
          )}

          {/* Success state - GitHub */}
          {result?.success && result.mode === "github" && result.github && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                <Check className="h-6 w-6 text-green-500" />
                <div>
                  <p className="text-green-400 font-medium">
                    Projektet har pushats till GitHub!
                  </p>
                  <p className="text-sm text-gray-400">
                    {result.filesCount} filer i ditt repo
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
                  <strong>Du äger nu all kod!</strong> Redigera med AI från
                  editorn, eller klona repot och jobba lokalt.
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

          {/* Initial state - Mode selection */}
          {!result && (
            <>
              {/* Mode selection cards */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-400">
                  Välj hur du vill ta över projektet:
                </h3>

                {/* Simple mode (Redis) */}
                <button
                  onClick={() => setSelectedMode("simple")}
                  className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                    selectedMode === "simple"
                      ? "border-teal-500 bg-teal-500/10"
                      : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        selectedMode === "simple"
                          ? "bg-teal-500/20"
                          : "bg-gray-700"
                      }`}
                    >
                      <Zap
                        className={`h-5 w-5 ${
                          selectedMode === "simple"
                            ? "text-teal-400"
                            : "text-gray-400"
                        }`}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">
                          Snabb & Enkel
                        </span>
                        <span className="px-2 py-0.5 text-xs bg-teal-500/20 text-teal-400 rounded-full">
                          Rekommenderad
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        Börja redigera direkt med AI. Inget GitHub-konto krävs.
                        Du kan ladda ner koden som ZIP när som helst.
                      </p>
                    </div>
                    {selectedMode === "simple" && (
                      <Check className="h-5 w-5 text-teal-500" />
                    )}
                  </div>
                </button>

                {/* GitHub mode */}
                <button
                  onClick={() => setSelectedMode("github")}
                  className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                    selectedMode === "github"
                      ? "border-purple-500 bg-purple-500/10"
                      : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        selectedMode === "github"
                          ? "bg-purple-500/20"
                          : "bg-gray-700"
                      }`}
                    >
                      <Github
                        className={`h-5 w-5 ${
                          selectedMode === "github"
                            ? "text-purple-400"
                            : "text-gray-400"
                        }`}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">
                          Pusha till GitHub
                        </span>
                        <span className="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded-full">
                          För utvecklare
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        Skapa ett repo på ditt GitHub. Du äger all kod och kan
                        klona, deploya och versionshantera.
                      </p>
                    </div>
                    {selectedMode === "github" && (
                      <Check className="h-5 w-5 text-purple-500" />
                    )}
                  </div>
                </button>
              </div>

              {/* GitHub-specific options */}
              {selectedMode === "github" && (
                <div className="space-y-4 pt-2">
                  {!hasGitHub ? (
                    <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                      <p className="text-amber-400 text-sm">
                        Du behöver ansluta ditt GitHub-konto först.
                      </p>
                      <Button
                        onClick={handleConnectGitHub}
                        className="mt-3 bg-gray-800 hover:bg-gray-700"
                        size="sm"
                      >
                        <Github className="h-4 w-4 mr-2" />
                        Anslut GitHub
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                        <Github className="h-5 w-5 text-gray-400" />
                        <span className="text-gray-300 text-sm">
                          Ansluten som{" "}
                          <strong className="text-white">
                            {user?.github_username}
                          </strong>
                        </span>
                        <Check className="h-4 w-4 text-green-500 ml-auto" />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm text-gray-400">
                          Repo-namn (valfritt)
                        </label>
                        <input
                          id="repo-name"
                          name="repo-name"
                          type="text"
                          autoComplete="off"
                          value={customRepoName}
                          onChange={(e) => setCustomRepoName(e.target.value)}
                          placeholder={defaultRepoName}
                          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Cost info */}
              <div className="p-3 bg-gray-800/30 rounded-lg">
                <p className="text-xs text-gray-500 text-center">
                  💎 AI-redigering kostar 1 diamant per ändring
                </p>
              </div>
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

          {!result?.success && (
            <Button
              onClick={handleTakeover}
              disabled={isLoading || (selectedMode === "github" && !hasGitHub)}
              className={`flex-1 text-white ${
                selectedMode === "simple"
                  ? "bg-teal-600 hover:bg-teal-500"
                  : "bg-purple-600 hover:bg-purple-500"
              }`}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Tar över...
                </span>
              ) : (
                <>
                  {selectedMode === "simple" ? (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      Ta över nu
                    </>
                  ) : (
                    <>
                      <Github className="h-4 w-4 mr-2" />
                      Pusha till GitHub
                    </>
                  )}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
