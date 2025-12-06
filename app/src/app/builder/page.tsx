"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { QualitySelector } from "@/components/quality-selector";
import { ChatPanel } from "@/components/chat-panel";
import { CodePreview } from "@/components/code-preview";
import { HelpTooltip } from "@/components/help-tooltip";
import { ClientOnly } from "@/components/client-only";
import { ShaderBackground } from "@/components/shader-background";
import { BackofficeOptionModal } from "@/components/backoffice-option-modal";
import { TakeoverModal } from "@/components/takeover-modal";
import { useBuilderStore, GeneratedFile } from "@/lib/store";
import { useAuth } from "@/lib/auth-store";
import { getProject } from "@/lib/project-client";
import {
  ArrowLeft,
  Download,
  Rocket,
  RefreshCw,
  Save,
  Diamond,
  MessageSquare,
  Eye,
  Menu,
  Github,
} from "lucide-react";
import { FloatingAvatar, useAvatarAgent } from "@/components/avatar";
import { useAvatar } from "@/contexts/AvatarContext";

// Hook to detect mobile
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isMobile;
}

// Category titles in Swedish
const categoryTitles: Record<string, string> = {
  "landing-page": "Landing Page",
  website: "Hemsida",
  dashboard: "Dashboard",
};

function BuilderContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");
  const type = searchParams.get("type");
  const prompt = searchParams.get("prompt");
  const templateId = searchParams.get("templateId");
  const localTemplateId = searchParams.get("localTemplateId");

  const {
    quality,
    setQuality,
    clearChat,
    demoUrl,
    chatId,
    versionId,
    setProjectId,
    loadFromProject,
    isSaving,
    lastSaved,
    hasUserSaved,
    explicitSave,
    isLoading,
  } = useBuilderStore();

  const { isAuthenticated, diamonds, fetchUser } = useAuth();
  const [projectName, setProjectName] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("chat");
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showBackofficeModal, setShowBackofficeModal] = useState(false);
  const [backofficeMode, setBackofficeMode] = useState<"download" | "publish">(
    "download"
  );
  const [isDownloading, setIsDownloading] = useState(false);
  const [showTakeoverModal, setShowTakeoverModal] = useState(false);
  const isMobile = useIsMobile();

  // Avatar context for triggering reactions
  const { triggerReaction } = useAvatar();

  // Avatar agent - monitors builder state and provides feedback
  useAvatarAgent();

  // Track if we've already auto-switched to preview (prevents repeated switches)
  const [hasAutoSwitched, setHasAutoSwitched] = useState(false);

  // Reset auto-switch flag when a new generation starts (isLoading becomes true and demoUrl is cleared)
  // This allows auto-switch to happen again for subsequent generations
  useEffect(() => {
    if (isLoading && !demoUrl) {
      setHasAutoSwitched(false);
    }
  }, [isLoading, demoUrl]);

  // Auto-switch to preview ONCE when generation completes on mobile
  // Using a flag to prevent re-switching when user manually goes back to chat
  useEffect(() => {
    if (isMobile && demoUrl && !isLoading && !hasAutoSwitched) {
      setMobileTab("preview");
      setHasAutoSwitched(true);
    }
  }, [demoUrl, isLoading, isMobile, hasAutoSwitched]);

  // Fetch user on mount to get diamond balance
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // Track if we've already loaded this project (prevents double-load from StrictMode)
  const [hasLoadedProject, setHasLoadedProject] = useState<string | null>(null);

  // Load project data on mount
  useEffect(() => {
    // Skip if already loaded this project (React StrictMode protection)
    if (!projectId || hasLoadedProject === projectId) {
      return;
    }

    setProjectId(projectId);
    setHasLoadedProject(projectId);

    // Clear any stale state from localStorage before loading fresh data
    clearChat();

    // Load existing project data if any
    getProject(projectId)
      .then(({ project, data }) => {
        setProjectName(project.name);

        // If project has existing data (from a previous session), load it
        if (data && data.chat_id) {
          loadFromProject({
            chatId: data.chat_id,
            demoUrl: data.demo_url,
            currentCode: data.current_code,
            files: data.files as GeneratedFile[],
            messages: data.messages,
          });
        }
      })
      .catch((err) => {
        console.error("Failed to load project:", err);
      });
  }, [projectId, setProjectId, loadFromProject, clearChat, hasLoadedProject]);

  // Handle starting a new design
  const handleNewDesign = () => {
    clearChat();
    setHasAutoSwitched(false); // Reset so auto-switch works for new generation
    if (isMobile) {
      setMobileTab("chat"); // Switch back to chat on mobile when starting new design
    }
    triggerReaction(
      "generation_start",
      "Ny design! Låt oss skapa något fantastiskt!"
    );
  };

  // Handle download button click - show modal
  const handleDownloadClick = () => {
    setBackofficeMode("download");
    setShowBackofficeModal(true);
  };

  // Handle publish button click - show modal
  const handlePublishClick = () => {
    setBackofficeMode("publish");
    setShowBackofficeModal(true);
  };

  // Handle backoffice modal confirmation
  const handleBackofficeConfirm = async (
    includeBackoffice: boolean,
    password?: string
  ) => {
    if (!chatId || !versionId) return;

    if (backofficeMode === "download") {
      setIsDownloading(true);
      try {
        const params = new URLSearchParams({
          chatId,
          versionId,
          ...(includeBackoffice && { includeBackoffice: "true" }),
          ...(includeBackoffice && password && { password }),
        });

        // Open download in new tab with password included for .env generation
        window.open(`/api/download?${params}`, "_blank");

        setShowBackofficeModal(false);
        triggerReaction(
          "generation_complete",
          includeBackoffice
            ? "Din sajt med backoffice laddas ner! Kolla BACKOFFICE-SETUP.md för instruktioner."
            : "Din sajt laddas ner!"
        );
      } finally {
        setIsDownloading(false);
      }
    } else {
      // Publish mode - TODO: implement publish with backoffice
      setShowBackofficeModal(false);
      triggerReaction(
        "generation_start",
        "Publicering kommer snart! För nu, ladda ner och deploya manuellt."
      );
    }
  };

  const title = projectName
    ? projectName
    : localTemplateId
    ? "Lokal mall"
    : templateId
    ? "Template"
    : type
    ? categoryTitles[type] || type
    : prompt
    ? "Egen beskrivning"
    : "Ny webbplats";

  return (
    <div
      className="min-h-screen bg-black flex flex-col"
      suppressHydrationWarning
    >
      {/* Shader Background - very subtle for builder */}
      <ShaderBackground color="#002020" speed={0.15} opacity={0.25} />

      {/* Header - Desktop */}
      <header className="relative z-20 h-14 border-b border-gray-800 hidden md:flex items-center justify-between px-4 bg-black/80 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-gray-400 hover:text-white hover:bg-gray-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Tillbaka
            </Button>
          </Link>
          <div className="h-5 w-px bg-gray-800" />
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-teal-500" />
            <span className="font-semibold text-white">SajtMaskin</span>
            <span className="text-gray-600">|</span>
            <span className="text-gray-400">{title}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Diamond counter */}
          {isAuthenticated && (
            <>
              <Link href="/buy-credits">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/50 border border-amber-500/30 hover:border-amber-500/60 transition-colors cursor-pointer group">
                  <Diamond className="h-4 w-4 text-amber-400 group-hover:text-amber-300" />
                  <span className="text-sm font-semibold text-amber-400 group-hover:text-amber-300">
                    {diamonds ?? 0}
                  </span>
                </div>
              </Link>
              <div className="h-5 w-px bg-gray-800" />
            </>
          )}
          <QualitySelector value={quality} onChange={setQuality} />
          <div className="h-5 w-px bg-gray-800" />
          {/* Saving indicator and save button */}
          {projectId && (
            <div className="flex items-center gap-2">
              {isSaving ? (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Save className="h-3 w-3 animate-pulse" />
                  Sparar...
                </span>
              ) : hasUserSaved ? (
                <span className="flex items-center gap-1 text-xs text-teal-500">
                  <Save className="h-3 w-3" />
                  Sparad
                </span>
              ) : (
                <>
                  <span className="text-xs text-amber-500">Ej sparad</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => explicitSave()}
                    className="gap-1 h-7 px-2 border-amber-600 text-amber-500 hover:bg-amber-900/20 hover:text-amber-400"
                  >
                    <Save className="h-3 w-3" />
                    Spara
                  </Button>
                </>
              )}
            </div>
          )}
          {demoUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewDesign}
              className="gap-2 text-gray-400 hover:text-white hover:bg-gray-800"
            >
              <RefreshCw className="h-4 w-4" />
              Ny design
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
            disabled={!chatId || !versionId}
            onClick={handleDownloadClick}
          >
            <Download className="h-4 w-4" />
            Ladda ner
            <HelpTooltip text="Laddar ner alla genererade filer som en ZIP-fil med möjlighet att inkludera backoffice." />
          </Button>
          <Button
            size="sm"
            className="gap-2 bg-teal-600 hover:bg-teal-500 text-white"
            disabled={!chatId || !versionId}
            onClick={handlePublishClick}
          >
            <Rocket className="h-4 w-4" />
            Publicera
            <HelpTooltip text="Publicerar din webbplats live på internet med ett klick. Du får en unik URL inom ~60 sekunder." />
          </Button>
          {/* GitHub Takeover button */}
          {isAuthenticated && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-purple-600 text-purple-400 hover:bg-purple-900/20 hover:text-purple-300"
              disabled={!chatId}
              onClick={() => setShowTakeoverModal(true)}
            >
              <Github className="h-4 w-4" />
              Ta över
              <HelpTooltip text="Flytta projektet till ditt GitHub-konto för full kontroll. Redigera sedan med AI direkt i koden!" />
            </Button>
          )}
        </div>
      </header>

      {/* Header - Mobile */}
      <header className="relative z-20 h-12 border-b border-gray-800 flex md:hidden items-center justify-between px-3 bg-black/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-gray-400"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <Rocket className="h-4 w-4 text-teal-500" />
          <span className="font-medium text-white text-sm truncate max-w-[120px]">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isAuthenticated && (
            <Link href="/buy-credits">
              <div className="flex items-center gap-1 px-2 py-1 bg-black/50 border border-amber-500/30 rounded">
                <Diamond className="h-3 w-3 text-amber-400" />
                <span className="text-xs font-semibold text-amber-400">
                  {diamonds ?? 0}
                </span>
              </div>
            </Link>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-gray-400"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Mobile Menu Dropdown */}
      {showMobileMenu && (
        <div className="absolute z-30 top-12 right-0 left-0 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 p-3 flex flex-col gap-2 md:hidden">
          <QualitySelector value={quality} onChange={setQuality} />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2 border-gray-700 text-gray-300"
              disabled={!chatId || !versionId}
              onClick={() => {
                setShowMobileMenu(false);
                handleDownloadClick();
              }}
            >
              <Download className="h-4 w-4" />
              Ladda ner
            </Button>
            <Button
              size="sm"
              className="flex-1 gap-2 bg-teal-600 hover:bg-teal-500"
              disabled={!chatId || !versionId}
              onClick={() => {
                setShowMobileMenu(false);
                handlePublishClick();
              }}
            >
              <Rocket className="h-4 w-4" />
              Publicera
            </Button>
          </div>
          {demoUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                handleNewDesign();
                setShowMobileMenu(false);
              }}
              className="gap-2 text-gray-400"
            >
              <RefreshCw className="h-4 w-4" />
              Ny design
            </Button>
          )}
        </div>
      )}

      {/* Main content - Desktop: 2 panel layout */}
      <div className="relative z-10 flex-1 hidden md:flex overflow-hidden">
        {/* Chat Panel (30%) */}
        <div className="w-[30%] min-w-[300px] border-r border-gray-800 bg-black/70 backdrop-blur-sm">
          <ChatPanel
            categoryType={type || undefined}
            initialPrompt={prompt || undefined}
            templateId={templateId || undefined}
            localTemplateId={localTemplateId || undefined}
            onTakeoverClick={() => setShowTakeoverModal(true)}
          />
        </div>

        {/* Preview Panel (70%) */}
        <div className="flex-1 bg-black/50">
          <CodePreview />
        </div>
      </div>

      {/* Main content - Mobile: Tabbed layout */}
      {/* IMPORTANT: Using CSS hidden instead of conditional rendering to prevent 
          ChatPanel from unmounting/remounting when switching tabs (which causes re-generation) */}
      <div className="relative z-10 flex-1 flex flex-col md:hidden overflow-hidden">
        {/* Mobile Tab Content - Both panels stay mounted, visibility controlled by CSS */}
        <div className="flex-1 overflow-hidden relative">
          <div
            className={`absolute inset-0 bg-black/70 ${
              mobileTab !== "chat" ? "hidden" : ""
            }`}
          >
            <ChatPanel
              categoryType={type || undefined}
              initialPrompt={prompt || undefined}
              templateId={templateId || undefined}
              localTemplateId={localTemplateId || undefined}
              onTakeoverClick={() => setShowTakeoverModal(true)}
            />
          </div>
          <div
            className={`absolute inset-0 bg-black/50 ${
              mobileTab !== "preview" ? "hidden" : ""
            }`}
          >
            <CodePreview />
          </div>
        </div>

        {/* Mobile Tab Bar */}
        <div className="h-14 border-t border-gray-800 flex bg-black/90 backdrop-blur-sm">
          <button
            onClick={() => setMobileTab("chat")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
              mobileTab === "chat"
                ? "text-teal-400 bg-teal-500/10"
                : "text-gray-500"
            }`}
          >
            <MessageSquare className="h-5 w-5" />
            <span className="text-xs">Chat</span>
          </button>
          <button
            onClick={() => setMobileTab("preview")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors relative ${
              mobileTab === "preview"
                ? "text-teal-400 bg-teal-500/10"
                : "text-gray-500"
            }`}
          >
            <Eye className="h-5 w-5" />
            <span className="text-xs">Preview</span>
            {/* Notification dot when preview is ready */}
            {demoUrl && mobileTab === "chat" && (
              <span className="absolute top-2 right-1/4 w-2 h-2 bg-teal-500 rounded-full animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {/* Step indicator - Desktop only */}
      <div className="relative z-10 h-10 border-t border-gray-800 hidden md:flex items-center justify-center bg-black/80">
        <p className="text-xs text-gray-500">
          Granska och förfina din design
          <HelpTooltip text="Du kan fortsätta förfina din design genom att skicka fler instruktioner i chatten. När du är nöjd, ladda ner eller publicera!" />
        </p>
      </div>

      {/* 3D Avatar Guide - Desktop only */}
      {!isMobile && <FloatingAvatar section="builder" showWelcome={false} />}

      {/* Backoffice Option Modal */}
      <BackofficeOptionModal
        isOpen={showBackofficeModal}
        onClose={() => setShowBackofficeModal(false)}
        onConfirm={handleBackofficeConfirm}
        mode={backofficeMode}
        isLoading={isDownloading}
      />

      {/* Takeover Modal */}
      {projectId && (
        <TakeoverModal
          isOpen={showTakeoverModal}
          onClose={() => setShowTakeoverModal(false)}
          projectId={projectId}
          projectName={projectName || title}
        />
      )}
    </div>
  );
}

// Loading fallback component
function LoadingFallback() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-3 h-3 bg-teal-500 animate-pulse"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function BuilderPage() {
  return (
    <ClientOnly fallback={<LoadingFallback />}>
      <Suspense fallback={<LoadingFallback />}>
        <BuilderContent />
      </Suspense>
    </ClientOnly>
  );
}
