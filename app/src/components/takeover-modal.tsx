"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Github,
  Check,
  Loader2,
  ExternalLink,
  Download,
  Sparkles,
  Zap,
  Cloud,
  ArrowRight,
  BarChart3,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-store";
import { useBuilderStore } from "@/lib/store";

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
  mode?: "github" | "sqlite";
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

interface AnalysisResult {
  success: boolean;
  analysis?: string;
  filesAnalyzed?: number;
  error?: string;
}

type TakeoverMode = "simple" | "github";

export function TakeoverModal({
  isOpen,
  onClose,
  projectId,
  projectName,
}: TakeoverModalProps) {
  const { user, refreshUser } = useAuth();
  const { setProjectOwned } = useBuilderStore();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TakeoverResult | null>(null);
  const [selectedMode, setSelectedMode] = useState<TakeoverMode>("simple");
  const [customRepoName, setCustomRepoName] = useState("");

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null
  );
  const [showAnalysis, setShowAnalysis] = useState(true);

  // Check if user has GitHub connected
  const hasGitHub = !!(user?.github_token && user?.github_username);

  // Generate default repo name (sanitize for GitHub requirements)
  const defaultRepoName = `sajt-${projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 100)}`; // GitHub max length is 100 chars

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (isOpen) {
      // Reset all state when modal opens
      setResult(null);
      setCustomRepoName("");
      setSelectedMode("simple");
      setAnalysisResult(null);
      setIsAnalyzing(false);
      setShowAnalysis(true);
      isMountedRef.current = true;
    }
    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Run automatic project analysis
  const runAnalysis = async () => {
    if (!isMountedRef.current) return;

    setIsAnalyzing(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error(
          `Analysis failed: ${response.status} ${response.statusText}`
        );
      }

      const data: AnalysisResult = await response.json();

      // Only update state if component is still mounted
      if (isMountedRef.current) {
        setAnalysisResult(data);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Okänt fel";
      console.error("[TakeoverModal] Analysis error:", errorMessage);

      // Only update state if component is still mounted
      if (isMountedRef.current) {
        setAnalysisResult({
          success: false,
          error: `Kunde inte analysera projektet: ${errorMessage}`,
        });
      }
    } finally {
      // Only update state if component is still mounted
      if (isMountedRef.current) {
        setIsAnalyzing(false);
      }
    }
  };

  const handleConnectGitHub = () => {
    if (typeof window === "undefined") return;
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
          mode: selectedMode === "simple" ? "sqlite" : "github",
          repoName:
            selectedMode === "github" ? customRepoName || undefined : undefined,
        }),
      });

      const data: TakeoverResult = await response.json();
      setResult(data);

      if (data.success) {
        // Update ownership state in store
        setProjectOwned(true, data.mode === "github" ? "github" : "sqlite");
        // Refresh user data (diamonds may have changed)
        refreshUser();
        // Note: Analysis is now manual - user can click "Analysera" button if needed
        // Removed automatic runAnalysis() to avoid unnecessary API calls
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
          {/* Success state - SQLite (source-of-truth, Redis cache) */}
          {result?.success && (result.mode === "sqlite" || !result.mode) && (
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
                  <p className="text-xs text-gray-500">
                    Lagring: SQLite (källan) med kortlivad Redis-cache.
                  </p>
                </div>
              </div>

              {/* Project Analysis Section */}
              <div className="border border-gray-700 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowAnalysis(!showAnalysis)}
                  className="w-full flex items-center justify-between p-4 bg-gray-800/50 hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-teal-400" />
                    <span className="text-sm font-medium text-white">
                      Projektanalys
                    </span>
                    {isAnalyzing && (
                      <Loader2 className="h-3 w-3 text-teal-400 animate-spin" />
                    )}
                    {analysisResult?.success && (
                      <span className="text-xs text-gray-500">
                        ({analysisResult.filesAnalyzed} filer analyserade)
                      </span>
                    )}
                  </div>
                  {showAnalysis ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
                </button>

                {showAnalysis && (
                  <div className="p-4 border-t border-gray-700 max-h-64 overflow-y-auto">
                    {isAnalyzing && (
                      <div className="flex items-center gap-2 text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Analyserar projektet...</span>
                      </div>
                    )}
                    {analysisResult?.success && analysisResult.analysis && (
                      <div className="prose prose-sm prose-invert max-w-none">
                        <div className="text-sm text-gray-300 whitespace-pre-wrap [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-4 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4">
                          {analysisResult.analysis
                            .split("\n")
                            .map((line, idx) => {
                              if (line.startsWith("## ")) {
                                return (
                                  <h2
                                    key={idx}
                                    className="text-base font-semibold text-white mt-4 mb-2"
                                  >
                                    {line.replace(/^## /, "")}
                                  </h2>
                                );
                              }
                              if (line.startsWith("- ")) {
                                return (
                                  <div key={idx} className="ml-4">
                                    • {line.replace(/^- /, "")}
                                  </div>
                                );
                              }
                              return <div key={idx}>{line || "\u00A0"}</div>;
                            })}
                        </div>
                      </div>
                    )}
                    {analysisResult && !analysisResult.success && (
                      <p className="text-sm text-amber-400">
                        {analysisResult.error ||
                          "Kunde inte analysera projektet"}
                      </p>
                    )}
                    {!isAnalyzing && !analysisResult && (
                      <button
                        onClick={runAnalysis}
                        className="text-sm text-teal-400 hover:text-teal-300"
                      >
                        Klicka för att analysera
                      </button>
                    )}
                  </div>
                )}
              </div>

              <a
                href={`/api/projects/${encodeURIComponent(projectId)}/download`}
                className="flex items-center justify-center gap-2 p-4 bg-gray-800 hover:bg-gray-700 rounded-xl text-white font-medium transition-colors border border-gray-700"
              >
                <Download className="h-5 w-5" />
                Ladda ner ZIP
                <ArrowRight className="h-4 w-4" />
              </a>

              <a
                href={`/project/${projectId}`}
                className="flex items-center justify-center gap-2 p-4 bg-purple-600 hover:bg-purple-500 rounded-xl text-white font-medium transition-colors"
              >
                <Sparkles className="h-5 w-5" />
                Öppna AI Studio
                <ArrowRight className="h-4 w-4" />
              </a>

              <p className="text-xs text-gray-500 text-center">
                💎 AI-redigering kostar 1-5 diamanter per ändring
              </p>
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

              {/* Project Analysis Section */}
              <div className="border border-gray-700 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowAnalysis(!showAnalysis)}
                  className="w-full flex items-center justify-between p-4 bg-gray-800/50 hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-teal-400" />
                    <span className="text-sm font-medium text-white">
                      Projektanalys
                    </span>
                    {isAnalyzing && (
                      <Loader2 className="h-3 w-3 text-teal-400 animate-spin" />
                    )}
                  </div>
                  {showAnalysis ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
                </button>

                {showAnalysis && (
                  <div className="p-4 border-t border-gray-700 max-h-64 overflow-y-auto">
                    {isAnalyzing && (
                      <div className="flex items-center gap-2 text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Analyserar projektet...</span>
                      </div>
                    )}
                    {analysisResult?.success && analysisResult.analysis && (
                      <div className="text-sm text-gray-300 whitespace-pre-wrap [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-4 [&_h2]:mb-2">
                        {(() => {
                          // Limit analysis length to prevent performance issues (max 10KB)
                          const MAX_ANALYSIS_LENGTH = 10000;
                          const analysis =
                            analysisResult.analysis.length > MAX_ANALYSIS_LENGTH
                              ? analysisResult.analysis.substring(
                                  0,
                                  MAX_ANALYSIS_LENGTH
                                ) +
                                "\n\n[... analysen är för lång för att visas fullt ut ...]"
                              : analysisResult.analysis;

                          return analysis.split("\n").map((line, idx) => {
                            if (line.startsWith("## ")) {
                              return (
                                <h2
                                  key={idx}
                                  className="text-base font-semibold text-white mt-4 mb-2"
                                >
                                  {line.replace(/^## /, "")}
                                </h2>
                              );
                            }
                            if (line.startsWith("- ")) {
                              return (
                                <div key={idx} className="ml-4">
                                  • {line.replace(/^- /, "")}
                                </div>
                              );
                            }
                            return <div key={idx}>{line || "\u00A0"}</div>;
                          });
                        })()}
                      </div>
                    )}
                    {analysisResult && !analysisResult.success && (
                      <p className="text-sm text-amber-400">
                        {analysisResult.error}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <a
                href={`/api/projects/${encodeURIComponent(projectId)}/download`}
                className="flex items-center justify-center gap-2 p-4 bg-gray-800 hover:bg-gray-700 rounded-xl text-white font-medium transition-colors border border-gray-700"
              >
                <Download className="h-5 w-5" />
                Ladda ner ZIP
                <ArrowRight className="h-4 w-4" />
              </a>

              <a
                href={`/project/${encodeURIComponent(
                  result.github.repoName || ""
                )}?owner=${encodeURIComponent(result.github.owner || "")}`}
                className="flex items-center justify-center gap-2 p-4 bg-purple-600 hover:bg-purple-500 rounded-xl text-white font-medium transition-colors"
              >
                <Sparkles className="h-5 w-5" />
                Öppna AI Studio
                <ArrowRight className="h-4 w-4" />
              </a>

              <p className="text-xs text-gray-500 text-center">
                💎 AI-redigering kostar 1-5 diamanter per ändring
              </p>
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

                {/* Simple mode (SQLite + Redis cache) */}
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
