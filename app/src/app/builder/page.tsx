"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { QualitySelector } from "@/components/quality-selector";
import { ChatPanel } from "@/components/chat-panel";
import { CodePreview } from "@/components/code-preview";
import { HelpTooltip } from "@/components/help-tooltip";
import { ClientOnly } from "@/components/client-only";
import { ShaderBackground } from "@/components/shader-background";
import { FinalizeModal } from "@/components/finalize-modal";
import { useBuilderStore } from "@/lib/store";
import { useAuth } from "@/lib/auth-store";
import { getProject, createProject } from "@/lib/project-client";
import {
  ArrowLeft,
  Check,
  Rocket,
  RefreshCw,
  Save,
  Diamond,
  MessageSquare,
  Eye,
  Menu,
} from "lucide-react";
import { FloatingAvatar, useAvatarAgent } from "@/components/avatar";
import { useAvatar } from "@/contexts/AvatarContext";

// Hook to detect mobile
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
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
  const router = useRouter();
  const urlProjectId = searchParams.get("project");
  const type = searchParams.get("type");
  const prompt = searchParams.get("prompt");
  const templateId = searchParams.get("templateId");
  const localTemplateId = searchParams.get("localTemplateId");
  // Reuse chatId from preview (if template was previewed before selection)

  // Track the active projectId (from URL or auto-created)
  const [projectId, setLocalProjectId] = useState<string | null>(urlProjectId);

  const {
    quality,
    setQuality,
    clearChat,
    demoUrl,
    chatId,
    versionId,
    files,
    setProjectId,
    loadFromProject,
    isSaving,
    hasUserSaved,
    explicitSave,
    isLoading,
  } = useBuilderStore();

  const { isAuthenticated, diamonds, fetchUser } = useAuth();
  const [projectName, setProjectName] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("chat");
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const isMobile = useIsMobile();
  const hasLoggedMountRef = useRef(false);

  // #region agent log
  useEffect(() => {
    if (hasLoggedMountRef.current) return;
    hasLoggedMountRef.current = true;
    fetch("http://127.0.0.1:7242/ingest/6b09075a-aee5-4a07-956c-0248b3430cfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "pre-fix",
        hypothesisId: "H3",
        location: "builder/page.tsx:mount",
        message: "BuilderContent mount",
        data: {
          isMobileInitial: isMobile,
          mobileTab,
          demoUrl: !!demoUrl,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }, [demoUrl, hasLoggedMountRef, isMobile, mobileTab]);
  // #endregion

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

  // #region agent log
  useEffect(() => {
    fetch("http://127.0.0.1:7242/ingest/6b09075a-aee5-4a07-956c-0248b3430cfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "pre-fix",
        hypothesisId: "H1",
        location: "builder/page.tsx:mobile-tab",
        message: "Mobile tab changed",
        data: { mobileTab, isMobile, demoUrl: !!demoUrl },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }, [mobileTab, isMobile, demoUrl]);
  // #endregion

  // Fetch user on mount to get diamond balance
  // Use ref to prevent duplicate calls in StrictMode
  const hasFetchedUserRef = useRef(false);
  useEffect(() => {
    if (hasFetchedUserRef.current) {
      return;
    }
    hasFetchedUserRef.current = true;
    fetchUser();
  }, [fetchUser]);

  // Track if we've already loaded this project (prevents double-load from StrictMode)
  // Use ref instead of state to prevent race conditions in StrictMode
  const hasLoadedProjectRef = useRef<string | null>(null);
  // Track which project is currently being loaded (null = not loading, string = projectId being loaded)
  const isLoadingProjectRef = useRef<string | null>(null);

  // Track if we're still loading project data (prevents race condition with ChatPanel)
  const [isProjectDataLoading, setIsProjectDataLoading] = useState(true);

  // Track if project has existing saved data (prevents re-generation if data exists)
  const [hasExistingData, setHasExistingData] = useState(false);

  // Ref to prevent double project creation from React StrictMode
  const isCreatingProjectRef = useRef(false);

  // Auto-create project if user arrives with prompt/template but no projectId yet
  useEffect(() => {
    const shouldAutoCreate =
      !projectId && (prompt || templateId || localTemplateId);

    if (!shouldAutoCreate) {
      if (!projectId && !isCreatingProjectRef.current) {
        setIsProjectDataLoading(false);
        setHasExistingData(false);
      }
      return;
    }

    // Prevent double creation from React StrictMode
    if (isCreatingProjectRef.current) {
      console.log("[Builder] Project creation already in progress, skipping");
      return;
    }

    // CRITICAL: Keep isProjectDataLoading = true while creating project
    // This prevents ChatPanel from starting generation before project exists
    setIsProjectDataLoading(true);

    const autoCreateProject = async () => {
      isCreatingProjectRef.current = true;
      try {
        // Extract company name from prompt if possible, otherwise use generic name
        const dateLabel = new Date().toLocaleDateString("sv-SE");
        const nameMatch = prompt?.match(/for\s+([^,\.]+)/i);
        const promptName = nameMatch
          ? nameMatch[1].trim()
          : prompt?.split("\n")[0]?.slice(0, 60)?.trim();
        const projectName =
          promptName ||
          (templateId
            ? `v0-template ${templateId}`
            : localTemplateId
            ? `Lokal mall ${localTemplateId}`
            : `Webbprojekt - ${dateLabel}`);

        const description = prompt
          ? prompt.substring(0, 100)
          : templateId
          ? `Baserat på v0 template: ${templateId}`
          : localTemplateId
          ? `Baserat på lokal mall: ${localTemplateId}`
          : undefined;

        console.log("[Builder] Auto-creating project:", projectName);
        const project = await createProject(
          projectName,
          type || "website",
          description
        );

        // Update local state with the new projectId
        setLocalProjectId(project.id);
        setProjectId(project.id);

        // Update URL without full page reload (keeps incoming params intact)
        const params = new URLSearchParams();
        params.set("project", project.id);
        if (prompt) {
          params.set("prompt", prompt);
        }
        if (type) {
          params.set("type", type);
        }
        if (templateId) {
          params.set("templateId", templateId);
        }
        if (localTemplateId) {
          params.set("localTemplateId", localTemplateId);
        }
        router.replace(`/builder?${params.toString()}`);

        console.log("[Builder] Project auto-created:", project.id);
        // Reset ref so project can be loaded normally
        isCreatingProjectRef.current = false;
        // isProjectDataLoading will be set to false by the project data loading effect below
      } catch (error) {
        console.error("[Builder] Failed to auto-create project:", error);
        // Continue without projectId - user can still use the builder
        setIsProjectDataLoading(false);
        isCreatingProjectRef.current = false;
      }
    };

    autoCreateProject();
  }, [
    prompt,
    projectId,
    templateId,
    localTemplateId,
    type,
    router,
    setProjectId,
  ]);

  // Load project data on mount
  useEffect(() => {
    // If no projectId, check if we're creating one (don't set loading to false yet)
    if (!projectId) {
      // Only set to false if we're NOT creating a project (no prompt means manual entry)
      if (
        !prompt &&
        !templateId &&
        !localTemplateId &&
        !isCreatingProjectRef.current
      ) {
        setIsProjectDataLoading(false);
        setHasExistingData(false);
      }
      // If prompt exists, project creation is in progress - keep loading = true
      return;
    }

    // Skip if already SUCCESSFULLY loaded this project (React StrictMode protection)
    // IMPORTANT: Only skip if we actually loaded the data, not just started loading
    if (hasLoadedProjectRef.current === projectId) {
      console.log(
        "[Builder] Project already loaded successfully, skipping:",
        projectId
      );
      // Make sure loading state is correct
      setIsProjectDataLoading(false);
      return;
    }

    // Skip if currently loading this same project (prevents duplicate requests)
    if (isLoadingProjectRef.current === projectId) {
      console.log("[Builder] Project already loading, skipping:", projectId);
      return;
    }

    // Mark as loading immediately (synchronous ref update)
    // Note: Don't set hasLoadedProjectRef yet - only set it AFTER successful load
    isLoadingProjectRef.current = projectId;
    setProjectId(projectId);
    setIsProjectDataLoading(true);

    // Clear any stale state BEFORE fetching new project data
    // This prevents old project data from being visible briefly
    clearChat();

    // Track if this effect is still mounted (for cleanup)
    let isMounted = true;

    console.log("[Builder] Loading project data:", projectId);

    // Load existing project data if any
    getProject(projectId)
      .then(({ project, data }) => {
        // Guard against unmounted component - BUT allow retry if unmounted
        if (!isMounted) {
          console.log(
            "[Builder] Component unmounted during fetch, will retry on remount"
          );
          // Reset loading ref so next mount will retry
          if (isLoadingProjectRef.current === projectId) {
            isLoadingProjectRef.current = null;
          }
          return;
        }

        setProjectName(project.name);

        // Check if project has ANY existing data (not just chat_id)
        // IMPORTANT: Only consider it "has data" if there's actual content (code/files/demoUrl)
        // Having just chat_id without content means generation didn't complete
        const hasData =
          data &&
          ((data.demo_url && data.demo_url.length > 0) ||
            (data.current_code && data.current_code.length > 0) ||
            (data.files && data.files.length > 0));

        console.log("[Builder] Project data loaded:", {
          projectId,
          hasData,
          hasChatId: !!data?.chat_id,
          hasDemoUrl: !!data?.demo_url,
          hasCode: !!data?.current_code,
          filesCount: data?.files?.length || 0,
        });

        if (hasData) {
          loadFromProject({
            chatId: data.chat_id,
            demoUrl: data.demo_url,
            currentCode: data.current_code,
            files: data.files,
            messages: data.messages,
          });
          setHasExistingData(true);
        } else {
          setHasExistingData(false);
        }

        // Mark as successfully loaded ONLY after data is applied
        hasLoadedProjectRef.current = projectId;
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("[Builder] Failed to load project:", err);
        setHasExistingData(false);
        // Reset refs on error so we can retry
        isLoadingProjectRef.current = null;
        hasLoadedProjectRef.current = null;
      })
      .finally(() => {
        if (!isMounted) return;
        // Mark loading as complete so ChatPanel knows it can proceed
        isLoadingProjectRef.current = null;
        setIsProjectDataLoading(false);
      });

    // Cleanup: mark as unmounted if effect re-runs or component unmounts
    return () => {
      isMounted = false;
      // Reset loading ref if we were loading this project - allows retry on remount
      if (isLoadingProjectRef.current === projectId) {
        isLoadingProjectRef.current = null;
      }
    };
  }, [
    projectId,
    setProjectId,
    loadFromProject,
    clearChat,
    prompt,
    templateId,
    localTemplateId,
  ]);

  // Handle starting a new design
  const handleNewDesign = () => {
    clearChat();
    setHasAutoSwitched(false); // Reset so auto-switch works for new generation
    setHasExistingData(false); // Allow new generation
    hasLoadedProjectRef.current = null; // Reset project tracking
    isLoadingProjectRef.current = null; // Reset loading flag
    if (isMobile) {
      setMobileTab("chat"); // Switch back to chat on mobile when starting new design
    }
    triggerReaction(
      "generation_start",
      "Ny design! Låt oss skapa något fantastiskt!"
    );
  };

  // Handle "Klar" button click - show finalize modal
  const handleKlarClick = () => {
    setShowFinalizeModal(true);
  };

  // Handle download from finalize modal
  // Uses POST with body for security (password not exposed in URL/browser history)
  const handleFinalizeDownload = async (
    includeBackoffice: boolean,
    password?: string
  ) => {
    if (!chatId || !versionId) return;

    setIsDownloading(true);
    try {
      // Use POST to keep password secure (not in URL/browser history)
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          versionId,
          includeBackoffice,
          password: includeBackoffice ? password : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Nedladdning misslyckades");
      }

      // Create blob and trigger download
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = includeBackoffice
        ? `sajtmaskin-${chatId}-with-backoffice.zip`
        : `sajtmaskin-${chatId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setShowFinalizeModal(false);
      triggerReaction(
        "generation_complete",
        includeBackoffice
          ? "Din sajt med backoffice laddas ner! Kolla BACKOFFICE-SETUP.md för instruktioner."
          : "Din sajt laddas ner!"
      );
    } catch (error) {
      console.error("[Builder] Download failed:", error);
      triggerReaction(
        "generation_error",
        error instanceof Error ? error.message : "Nedladdning misslyckades"
      );
    } finally {
      setIsDownloading(false);
    }
  };

  // Handle publish from finalize modal
  const handleFinalizePublish = async (
    includeBackoffice: boolean,
    password?: string
  ) => {
    // Placeholder until publish flow is implemented
    void includeBackoffice;
    void password;

    if (!chatId || !versionId) return;

    setIsPublishing(true);
    try {
      // TODO: implement actual publish with backoffice
      setShowFinalizeModal(false);
      triggerReaction(
        "generation_start",
        "Publicering kommer snart! För nu, ladda ner och deploya manuellt."
      );
    } finally {
      setIsPublishing(false);
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
            size="sm"
            className="gap-2 bg-teal-600 hover:bg-teal-500 text-white"
            disabled={!chatId || !versionId}
            onClick={handleKlarClick}
          >
            <Check className="h-4 w-4" />
            Klar
            <HelpTooltip text="Kolla domäntillgänglighet, ladda ner eller publicera din webbplats." />
          </Button>
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
          <Button
            size="sm"
            className="gap-2 bg-teal-600 hover:bg-teal-500"
            disabled={!chatId || !versionId}
            onClick={() => {
              setShowMobileMenu(false);
              handleKlarClick();
            }}
          >
            <Check className="h-4 w-4" />
            Klar
          </Button>
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
        {/* Chat Panel (30%) - Desktop (PRIMARY instance that triggers generation) */}
        <div className="w-[30%] min-w-[300px] border-r border-gray-800 bg-black/70 backdrop-blur-sm">
          <ChatPanel
            categoryType={type || undefined}
            initialPrompt={prompt || undefined}
            templateId={templateId || undefined}
            localTemplateId={localTemplateId || undefined}
            instanceId="desktop"
            isPrimaryInstance={true}
            isProjectDataLoading={isProjectDataLoading}
            hasExistingData={hasExistingData}
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
            {/* Mobile instance - NOT primary, won't trigger duplicate generation */}
            <ChatPanel
              categoryType={type || undefined}
              initialPrompt={prompt || undefined}
              templateId={templateId || undefined}
              localTemplateId={localTemplateId || undefined}
              instanceId="mobile"
              isPrimaryInstance={false}
              isProjectDataLoading={isProjectDataLoading}
              hasExistingData={hasExistingData}
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

      {/* Finalize Modal */}
      <FinalizeModal
        isOpen={showFinalizeModal}
        onClose={() => setShowFinalizeModal(false)}
        onDownload={handleFinalizeDownload}
        onPublish={handleFinalizePublish}
        projectTitle={title}
        projectId={projectId || undefined}
        fileCount={files?.length || 0}
        isDownloading={isDownloading}
        isPublishing={isPublishing}
      />
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
