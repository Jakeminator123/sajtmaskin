"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HelpTooltip, ShaderBackground } from "@/components/layout";
import { PromptWizardModalV2, type WizardData } from "@/components/modals";
import {
  ArrowLeft,
  Rocket,
  Sparkles,
  FileText,
  Globe,
  LayoutDashboard,
  Zap,
  Loader2,
  Layout,
  Wand2,
  Puzzle,
  Lock,
  Palette,
  Gamepad2,
  Edit,
  Play,
  HelpCircle,
  Triangle,
  ExternalLink,
  Github,
} from "lucide-react";
import {
  getCategory,
  type QuickPrompt,
  V0_CATEGORIES,
  getTemplatesByCategory,
  getTemplateImageUrl,
  type Template,
  getAllVercelTemplates,
  type VercelTemplate,
} from "@/lib/templates/template-data";
import { createProject } from "@/lib/project-client";
import Image from "next/image";
import { PreviewModal } from "@/components/templates";
import toast from "react-hot-toast";

// Icon mapping - includes all icons used in V0_CATEGORIES and legacy CATEGORIES
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText,
  Globe,
  LayoutDashboard,
  Sparkles,
  Zap,
  Puzzle,
  Lock,
  Palette,
  Layout,
  Gamepad2,
  HelpCircle,
  Triangle, // Vercel logo
};

export default function CategoryPage() {
  const params = useParams();
  const router = useRouter();
  const type = params.type as string;
  const [prompt, setPrompt] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  const category = getCategory(type);
  const v0Category = V0_CATEGORIES[type];
  const v0Templates = v0Category ? getTemplatesByCategory(type) : [];

  // Check if this is the Vercel templates category
  const isVercelTemplatesCategory = type === "vercel-templates";
  const vercelTemplates = isVercelTemplatesCategory ? getAllVercelTemplates() : [];

  // Use v0 category if available, otherwise use legacy category
  const displayCategory = v0Category || category;

  if (!displayCategory) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="space-y-4 text-center">
          <p className="text-gray-400">Kategorin hittades inte</p>
          <Link href="/">
            <Button variant="outline">Tillbaka till start</Button>
          </Link>
        </div>
      </div>
    );
  }

  const Icon: React.ComponentType<{ className?: string }> =
    iconMap[displayCategory.icon] || FileText;

  const createPromptHandoff = async (value: string, projectId: string): Promise<string | null> => {
    try {
      const response = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: value,
          source: `category:${type}`,
          projectId,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        success?: boolean;
        promptId?: string;
        error?: string;
      } | null;
      if (!response.ok || !data?.promptId) {
        const message = data?.error || "Kunde inte spara prompten";
        throw new Error(message);
      }
      return data.promptId;
    } catch (error) {
      console.error("[Category] Failed to create prompt handoff:", error);
      toast.error(error instanceof Error ? error.message : "Kunde inte spara prompten");
      return null;
    }
  };

  const handlePromptSubmit = async () => {
    if (prompt.trim() && !isCreating) {
      setIsCreating(true);
      try {
        // Create project in database first
        const project = await createProject(
          `${displayCategory.title} - ${new Date().toLocaleDateString("sv-SE")}`,
          type,
          prompt.trim().substring(0, 100),
        );
        const promptId = await createPromptHandoff(prompt.trim(), project.id);
        if (!promptId) {
          setIsCreating(false);
          return;
        }
        router.push(
          `/builder?project=${project.id}&type=${type}&promptId=${encodeURIComponent(promptId)}`,
        );
      } catch (error) {
        console.error("Failed to create project:", error);
        setIsCreating(false);
      }
    }
  };

  const handleQuickPrompt = async (quickPrompt: QuickPrompt) => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      // Create project in database first
      const project = await createProject(
        `${quickPrompt.label} - ${new Date().toLocaleDateString("sv-SE")}`,
        type,
        quickPrompt.prompt.substring(0, 100),
      );
      const promptId = await createPromptHandoff(quickPrompt.prompt, project.id);
      if (!promptId) {
        setIsCreating(false);
        return;
      }
      router.push(
        `/builder?project=${project.id}&type=${type}&promptId=${encodeURIComponent(promptId)}`,
      );
    } catch (error) {
      console.error("Failed to create project:", error);
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handlePromptSubmit();
    }
  };

  // Handle wizard completion - create project and navigate to builder immediately
  const handleWizardComplete = async (wizardData: WizardData, expandedPrompt: string) => {
    // Close wizard and start creating
    setShowWizard(false);
    setPrompt(expandedPrompt);
    setIsCreating(true);

    try {
      // Create project in database with company name if available
      const projectName = wizardData.companyName
        ? `${wizardData.companyName} - ${displayCategory.title}`
        : `${displayCategory.title} - ${new Date().toLocaleDateString("sv-SE")}`;

      const project = await createProject(projectName, type, expandedPrompt.substring(0, 100));

      // Save company profile linked to project (fire and forget)
      if (wizardData.companyName) {
        fetch("/api/company-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: project.id, // Link to project!
            company_name: wizardData.companyName,
            industry: wizardData.industry,
            location: wizardData.location,
            existing_website: wizardData.existingWebsite,
            website_analysis: wizardData.websiteAnalysis,
            site_likes: wizardData.siteLikes,
            site_dislikes: wizardData.siteDislikes,
            site_feedback: wizardData.siteOtherFeedback,
            target_audience: wizardData.targetAudience,
            purposes: wizardData.purposes,
            special_wishes: wizardData.specialWishes,
            color_palette_name: wizardData.palette?.name,
            color_primary: wizardData.customColors?.primary || wizardData.palette?.primary,
            color_secondary: wizardData.customColors?.secondary || wizardData.palette?.secondary,
            color_accent: wizardData.customColors?.accent || wizardData.palette?.accent,
            industry_trends: wizardData.industryTrends,
            inspiration_sites: wizardData.inspirationSites,
            voice_transcript: wizardData.voiceTranscript,
          }),
        }).catch((err) => console.error("Failed to save company profile:", err));
      }

      const promptId = await createPromptHandoff(expandedPrompt, project.id);
      if (!promptId) {
        setIsCreating(false);
        return;
      }
      // Navigate directly to builder with the expanded prompt
      router.push(
        `/builder?project=${project.id}&type=${type}&promptId=${encodeURIComponent(promptId)}`,
      );
    } catch (error) {
      console.error("Failed to create project:", error);
      setIsCreating(false);
    }
  };

  return (
    <main className="bg-background min-h-screen">
      {/* Shader Background */}
      <ShaderBackground theme="blue" speed={0.2} opacity={0.35} />

      {/* Prompt Wizard Modal - Optimized V2 with 5 steps instead of 11 */}
      <PromptWizardModalV2
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        onComplete={handleWizardComplete}
        initialPrompt={prompt}
        categoryType={type}
      />

      <div className="relative z-10 min-h-screen px-4 py-8">
        {/* Header */}
        <div className="mx-auto mb-8 max-w-5xl">
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="mb-6 gap-2 text-gray-400 hover:bg-gray-800 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Tillbaka
            </Button>
          </Link>

          <div className="mb-4 flex items-center gap-4">
            <div className="bg-brand-teal/20 border-brand-teal/30 border p-3">
              <Icon className="text-brand-teal h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{displayCategory.title}</h1>
              <p className="text-gray-400">{displayCategory.description}</p>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-5xl space-y-10">
          {/* Section 1: Custom prompt */}
          <section>
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="text-brand-teal h-5 w-5" />
              <h2 className="text-lg font-semibold text-white">Beskriv med egna ord</h2>
              <HelpTooltip text="Skriv en beskrivning av vad du vill skapa så genererar AI:n det åt dig." />
            </div>

            <div className="border border-gray-800 bg-black/50 p-4">
              <div className="flex gap-4">
                <div className="flex flex-1 flex-col">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Beskriv din ${displayCategory.title.toLowerCase()}...`}
                    className="focus:ring-brand-teal/50 h-24 flex-1 resize-none border border-gray-800 bg-black/50 p-3 text-white placeholder:text-gray-500 focus:ring-2 focus:outline-none"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{prompt.length} tecken</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowWizard(true)}
                      disabled={isCreating}
                      className="text-brand-teal hover:text-brand-teal/80 hover:bg-brand-teal/10 h-7 gap-1.5 px-2"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      <span className="text-xs">Bygg ut med AI</span>
                    </Button>
                  </div>
                </div>
                <Button
                  onClick={handlePromptSubmit}
                  disabled={!prompt.trim() || isCreating}
                  className="bg-brand-teal hover:bg-brand-teal/90 h-24 gap-2 px-6"
                >
                  {isCreating ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Rocket className="h-5 w-5" />
                  )}
                  <span className="hidden sm:inline">{isCreating ? "Skapar..." : "Skapa"}</span>
                </Button>
              </div>
            </div>
          </section>

          {/* Section 2: Quick prompts */}
          {displayCategory.quickPrompts && displayCategory.quickPrompts.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Zap className="text-brand-amber h-5 w-5" />
                <h2 className="text-lg font-semibold text-white">Snabbval</h2>
                <HelpTooltip text="Klicka på ett snabbval för att snabbt komma igång med en fördefinierad design." />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {displayCategory.quickPrompts.map((quickPrompt) => (
                  <Button
                    key={quickPrompt.label}
                    onClick={() => handleQuickPrompt(quickPrompt)}
                    disabled={isCreating}
                    variant="outline"
                    className="hover:border-brand-amber/50 hover:bg-brand-amber/5 group flex h-auto flex-col items-start gap-1 border-gray-800 bg-black/50 px-4 py-4 text-left transition-all disabled:opacity-50"
                  >
                    <span className="group-hover:text-brand-amber/80 font-medium text-gray-200">
                      {quickPrompt.label}
                    </span>
                    <span className="line-clamp-2 text-xs text-gray-500">
                      AI genererar baserat på fördefinierad beskrivning
                    </span>
                  </Button>
                ))}
              </div>
            </section>
          )}

          {/* Section 3: V0 Templates */}
          {v0Templates.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Layout className="text-brand-teal h-5 w-5" />
                <h2 className="text-lg font-semibold text-white">V0 Templates</h2>
                <HelpTooltip text="Templates från v0.app. Klicka för att öppna i v0.app." />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {v0Templates.map((template) => (
                  <V0TemplateCard key={template.id} template={template} disabled={isCreating} />
                ))}
              </div>
            </section>
          )}

          {/* Section 4: Vercel Templates (GitHub repos) */}
          {vercelTemplates.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Triangle className="h-5 w-5 text-white" />
                <h2 className="text-lg font-semibold text-white">Vercel Templates</h2>
                <HelpTooltip text="Officiella templates från vercel.com/templates. Importeras från GitHub." />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {vercelTemplates.map((template) => (
                  <VercelTemplateCard key={template.id} template={template} disabled={isCreating} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

// V0 Template Card Component
function V0TemplateCard({ template, disabled }: { template: Template; disabled: boolean }) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const imageUrl = getTemplateImageUrl(template);
  const type = useParams().type as string;

  const handlePreviewClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled || !imageUrl) return;
    setShowModal(true);
  };
  const handleEdit = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled || isCreating) return;

    setIsCreating(true);
    try {
      // Create project in database
      const project = await createProject(
        `${template.title || template.id} - ${new Date().toLocaleDateString("sv-SE")}`,
        type,
        `Baserat på v0 template: ${template.id}`,
      );
      // Navigate to builder with templateId parameter
      router.push(`/builder?project=${project.id}&templateId=${template.id}`);
    } catch (error) {
      console.error("Failed to create project from v0 template:", error);
      setIsCreating(false);
    }
  };

  return (
    <>
      <div className="group hover:border-brand-teal/50 cursor-pointer overflow-hidden rounded-lg border border-gray-800 bg-black/50 transition-all">
        <div className="relative aspect-video overflow-hidden bg-gray-900">
          <Image
            src={imageUrl}
            alt={template.title || template.id}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
        </div>
        <div className="space-y-3 p-4">
          <h3 className="line-clamp-1 text-sm font-medium text-white">
            {template.title || template.id}
          </h3>
          <div className="flex gap-2">
            <button
              onClick={handlePreviewClick}
              disabled={disabled || !imageUrl}
              className="bg-brand-teal/20 hover:bg-brand-teal/30 border-brand-teal/30 text-brand-teal flex flex-1 items-center justify-center gap-2 rounded border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              Preview
            </button>
            <button
              onClick={handleEdit}
              disabled={disabled || isCreating}
              className="flex flex-1 items-center justify-center gap-2 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Edit className="h-3.5 w-3.5" />
              )}
              {isCreating ? "Skapar..." : "Edit"}
            </button>
          </div>
        </div>
      </div>

      {imageUrl && (
        <PreviewModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          imageUrl={imageUrl}
          title={template.title || template.id}
        />
      )}
    </>
  );
}

// Vercel Template Card Component (GitHub repo-based templates)
function VercelTemplateCard({
  template,
  disabled,
}: {
  template: VercelTemplate;
  disabled: boolean;
}) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);

  const handleImport = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled || isCreating) return;

    setIsCreating(true);
    try {
      // Create project in database
      const project = await createProject(
        `${template.title} - ${new Date().toLocaleDateString("sv-SE")}`,
        "vercel-templates",
        template.description,
      );

      // Initialize chat from Vercel template
      const response = await fetch("/api/v0/chats/init-vercel-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.id,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || "Failed to import template");
      }

      const data = await response.json();
      toast.success(`Template "${template.title}" importerad!`);

      const nextChatId =
        data.id || data.chatId || data.v0ChatId || data.chat?.id || data.internalChatId || "";
      if (!nextChatId) {
        throw new Error("Ingen chat hittades för mallen");
      }
      // Navigate to builder with the app project ID and v0 chat ID
      router.push(`/builder?project=${project.id}&chatId=${nextChatId}`);
    } catch (error) {
      console.error("Failed to import Vercel template:", error);
      toast.error(error instanceof Error ? error.message : "Kunde inte importera template");
      setIsCreating(false);
    }
  };

  const handleViewDemo = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (template.demoUrl) {
      window.open(template.demoUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleViewRepo = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(template.repoUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="group cursor-pointer overflow-hidden rounded-lg border border-gray-800 bg-black/50 transition-all hover:border-white/30">
      <div className="relative aspect-video overflow-hidden bg-gray-900">
        {template.previewImageUrl ? (
          <Image
            src={template.previewImageUrl}
            alt={template.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Triangle className="h-12 w-12 text-gray-700" />
          </div>
        )}
        {/* Framework badge */}
        <div className="absolute top-2 right-2 rounded bg-black/70 px-2 py-0.5 text-xs text-gray-300">
          {template.framework}
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <h3 className="line-clamp-1 text-sm font-medium text-white">{template.title}</h3>
          <p className="mt-1 line-clamp-2 text-xs text-gray-400">{template.description}</p>
        </div>
        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {template.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400">
              {tag}
            </span>
          ))}
        </div>
        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleImport}
            disabled={disabled || isCreating}
            className="flex flex-1 items-center justify-center gap-2 rounded border border-white/20 bg-white/10 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Edit className="h-3.5 w-3.5" />
            )}
            {isCreating ? "Importerar..." : "Importera"}
          </button>
          {template.demoUrl && (
            <button
              onClick={handleViewDemo}
              disabled={disabled}
              className="flex items-center justify-center gap-1 rounded border border-gray-700 bg-gray-800 px-2 py-2 text-xs text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-50"
              title="Öppna demo"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={handleViewRepo}
            disabled={disabled}
            className="flex items-center justify-center gap-1 rounded border border-gray-700 bg-gray-800 px-2 py-2 text-xs text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-50"
            title="Öppna GitHub repo"
          >
            <Github className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
