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
import { useBuilderStore, GeneratedFile } from "@/lib/store";
import { getProject } from "@/lib/project-client";
import { ArrowLeft, Download, Rocket, RefreshCw, Save } from "lucide-react";

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

  const {
    quality,
    setQuality,
    clearChat,
    demoUrl,
    setProjectId,
    loadFromProject,
    isSaving,
    lastSaved,
  } = useBuilderStore();

  const [projectName, setProjectName] = useState<string | null>(null);

  // Load project data on mount
  useEffect(() => {
    if (projectId) {
      setProjectId(projectId);

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
    }
  }, [projectId, setProjectId, loadFromProject]);

  // Handle starting a new design
  const handleNewDesign = () => {
    clearChat();
  };

  const title = projectName
    ? projectName
    : templateId
    ? "Template"
    : type
    ? categoryTitles[type] || type
    : prompt
    ? "Egen beskrivning"
    : "Ny webbplats";

  return (
    <div
      className="min-h-screen bg-zinc-950 flex flex-col"
      suppressHydrationWarning
    >
      {/* Header */}
      <header className="h-14 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-900/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-zinc-400 hover:text-zinc-100"
            >
              <ArrowLeft className="h-4 w-4" />
              Tillbaka
            </Button>
          </Link>
          <div className="h-5 w-px bg-zinc-800" />
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-blue-500" />
            <span className="font-semibold text-zinc-100">SajtMaskin</span>
            <span className="text-zinc-500">|</span>
            <span className="text-zinc-400">{title}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <QualitySelector value={quality} onChange={setQuality} />
          <div className="h-5 w-px bg-zinc-800" />
          {/* Saving indicator */}
          {projectId && (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              {isSaving ? (
                <>
                  <Save className="h-3 w-3 animate-pulse" />
                  Sparar...
                </>
              ) : lastSaved ? (
                <>
                  <Save className="h-3 w-3 text-green-500" />
                  Sparad
                </>
              ) : null}
            </div>
          )}
          {demoUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewDesign}
              className="gap-2 text-zinc-400 hover:text-zinc-100"
            >
              <RefreshCw className="h-4 w-4" />
              Ny design
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            <Download className="h-4 w-4" />
            Ladda ner
            <HelpTooltip text="Laddar ner alla genererade filer som en ZIP-fil. Packa upp och lägg filerna i ditt projekt." />
          </Button>
          <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-500">
            <Rocket className="h-4 w-4" />
            Publicera
            <HelpTooltip text="Publicerar din webbplats live på internet med ett klick. Du får en unik URL inom ~60 sekunder." />
          </Button>
        </div>
      </header>

      {/* Main content - 2 panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Panel (30%) */}
        <div className="w-[30%] min-w-[300px] border-r border-zinc-800 bg-zinc-900/30">
          <ChatPanel
            categoryType={type || undefined}
            initialPrompt={prompt || undefined}
            templateId={templateId || undefined}
          />
        </div>

        {/* Preview Panel (70%) */}
        <div className="flex-1">
          <CodePreview />
        </div>
      </div>

      {/* Step indicator */}
      <div className="h-10 border-t border-zinc-800 flex items-center justify-center bg-zinc-900/50">
        <p className="text-xs text-zinc-500">
          Granska och förfina din design
          <HelpTooltip text="Du kan fortsätta förfina din design genom att skicka fler instruktioner i chatten. När du är nöjd, ladda ner eller publicera!" />
        </p>
      </div>
    </div>
  );
}

// Loading fallback component
function LoadingFallback() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"
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
