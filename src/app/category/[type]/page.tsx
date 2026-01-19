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
} from "lucide-react";
import {
  getCategory,
  type QuickPrompt,
  V0_CATEGORIES,
  getTemplatesByCategory,
  getTemplateImageUrl,
  type Template,
} from "@/lib/templates/template-data";
import { createProject } from "@/lib/project-client";
import Image from "next/image";
import { PreviewModal } from "@/components/templates";

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

  // Use v0 category if available, otherwise use legacy category
  const displayCategory = v0Category || category;

  if (!displayCategory) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
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

  const handlePromptSubmit = async () => {
    if (prompt.trim() && !isCreating) {
      setIsCreating(true);
      try {
        // Create project in database first
        const project = await createProject(
          `${displayCategory.title} - ${new Date().toLocaleDateString(
            "sv-SE"
          )}`,
          type,
          prompt.trim().substring(0, 100)
        );
        router.push(
          `/builder?project=${
            project.id
          }&type=${type}&prompt=${encodeURIComponent(prompt.trim())}`
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
        quickPrompt.prompt.substring(0, 100)
      );
      router.push(
        `/builder?project=${
          project.id
        }&type=${type}&prompt=${encodeURIComponent(quickPrompt.prompt)}`
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
  const handleWizardComplete = async (
    wizardData: WizardData,
    expandedPrompt: string
  ) => {
    // Close wizard and start creating
    setShowWizard(false);
    setPrompt(expandedPrompt);
    setIsCreating(true);

    try {
      // Create project in database with company name if available
      const projectName = wizardData.companyName
        ? `${wizardData.companyName} - ${displayCategory.title}`
        : `${displayCategory.title} - ${new Date().toLocaleDateString(
            "sv-SE"
          )}`;

      const project = await createProject(
        projectName,
        type,
        expandedPrompt.substring(0, 100)
      );

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
            color_primary:
              wizardData.customColors?.primary || wizardData.palette?.primary,
            color_secondary:
              wizardData.customColors?.secondary ||
              wizardData.palette?.secondary,
            color_accent:
              wizardData.customColors?.accent || wizardData.palette?.accent,
            industry_trends: wizardData.industryTrends,
            inspiration_sites: wizardData.inspirationSites,
            voice_transcript: wizardData.voiceTranscript,
          }),
        }).catch((err) =>
          console.error("Failed to save company profile:", err)
        );
      }

      // Navigate directly to builder with the expanded prompt
      router.push(
        `/builder?project=${
          project.id
        }&type=${type}&prompt=${encodeURIComponent(expandedPrompt)}`
      );
    } catch (error) {
      console.error("Failed to create project:", error);
      setIsCreating(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
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
        <div className="max-w-5xl mx-auto mb-8">
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-gray-400 hover:text-white hover:bg-gray-800 mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Tillbaka
            </Button>
          </Link>

          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-brand-teal/20 border border-brand-teal/30">
              <Icon className="h-6 w-6 text-brand-teal" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                {displayCategory.title}
              </h1>
              <p className="text-gray-400">{displayCategory.description}</p>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto space-y-10">
          {/* Section 1: Custom prompt */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-5 w-5 text-brand-teal" />
              <h2 className="text-lg font-semibold text-white">
                Beskriv med egna ord
              </h2>
              <HelpTooltip text="Skriv en beskrivning av vad du vill skapa så genererar AI:n det åt dig." />
            </div>

            <div className="bg-black/50 border border-gray-800 p-4">
              <div className="flex gap-4">
                <div className="flex-1 flex flex-col">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Beskriv din ${displayCategory.title.toLowerCase()}...`}
                    className="flex-1 h-24 bg-black/50 border border-gray-800 p-3 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-teal/50 resize-none"
                  />
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-gray-500">
                      {prompt.length} tecken
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowWizard(true)}
                      disabled={isCreating}
                      className="gap-1.5 text-brand-teal hover:text-brand-teal/80 hover:bg-brand-teal/10 h-7 px-2"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      <span className="text-xs">Bygg ut med AI</span>
                    </Button>
                  </div>
                </div>
                <Button
                  onClick={handlePromptSubmit}
                  disabled={!prompt.trim() || isCreating}
                  className="h-24 px-6 gap-2 bg-brand-teal hover:bg-brand-teal/90"
                >
                  {isCreating ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Rocket className="h-5 w-5" />
                  )}
                  <span className="hidden sm:inline">
                    {isCreating ? "Skapar..." : "Skapa"}
                  </span>
                </Button>
              </div>
            </div>
          </section>

          {/* Section 2: Quick prompts */}
          {displayCategory.quickPrompts &&
            displayCategory.quickPrompts.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="h-5 w-5 text-brand-amber" />
                  <h2 className="text-lg font-semibold text-white">Snabbval</h2>
                  <HelpTooltip text="Klicka på ett snabbval för att snabbt komma igång med en fördefinierad design." />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {displayCategory.quickPrompts.map((quickPrompt) => (
                    <Button
                      key={quickPrompt.label}
                      onClick={() => handleQuickPrompt(quickPrompt)}
                      disabled={isCreating}
                      variant="outline"
                      className="h-auto py-4 px-4 flex flex-col items-start text-left gap-1 bg-black/50 border-gray-800 hover:border-brand-amber/50 hover:bg-brand-amber/5 transition-all group disabled:opacity-50"
                    >
                      <span className="font-medium text-gray-200 group-hover:text-brand-amber/80">
                        {quickPrompt.label}
                      </span>
                      <span className="text-xs text-gray-500 line-clamp-2">
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
              <div className="flex items-center gap-2 mb-4">
                <Layout className="h-5 w-5 text-brand-teal" />
                <h2 className="text-lg font-semibold text-white">
                  V0 Templates
                </h2>
                <HelpTooltip text="Templates från v0.app. Klicka för att öppna i v0.app." />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {v0Templates.map((template) => (
                  <V0TemplateCard
                    key={template.id}
                    template={template}
                    disabled={isCreating}
                  />
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
function V0TemplateCard({
  template,
  disabled,
}: {
  template: Template;
  disabled: boolean;
}) {
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
        `${template.title || template.id} - ${new Date().toLocaleDateString(
          "sv-SE"
        )}`,
        type,
        `Baserat på v0 template: ${template.id}`
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
      <div className="group bg-black/50 border border-gray-800 rounded-lg overflow-hidden hover:border-brand-teal/50 transition-all cursor-pointer">
        <div className="relative aspect-video bg-gray-900 overflow-hidden">
          <Image
            src={imageUrl}
            alt={template.title || template.id}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
        </div>
        <div className="p-4 space-y-3">
          <h3 className="font-medium text-white text-sm line-clamp-1">
            {template.title || template.id}
          </h3>
          <div className="flex gap-2">
            <button
              onClick={handlePreviewClick}
              disabled={disabled || !imageUrl}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-brand-teal/20 hover:bg-brand-teal/30 border border-brand-teal/30 rounded text-brand-teal text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="h-3.5 w-3.5" />
              Preview
            </button>
            <button
              onClick={handleEdit}
              disabled={disabled || isCreating}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-gray-300 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
