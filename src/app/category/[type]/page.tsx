"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/layout/help-tooltip";
import { ShaderBackground } from "@/components/layout/shader-background";
import { PromptWizardModalV2, type WizardData } from "@/components/modals/prompt-wizard-modal-v2";
import {
  ArrowLeft,
  Rocket,
  Wand2,
  FileText,
  Globe,
  LayoutDashboard,
  Zap,
  Loader2,
  Layout,
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
import type { BuildIntent } from "@/lib/builder/build-intent";
import { getTemplateCatalogItemById } from "@/lib/templates/template-catalog";
import Image from "next/image";
import { PreviewModal } from "@/components/templates/preview-modal";
import { toast } from "sonner";

// Icon mapping - includes all icons used in V0_CATEGORIES and legacy CATEGORIES
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText,
  Globe,
  LayoutDashboard,
  Wand2,
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
  const buildIntent: BuildIntent = "template";
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <p className="text-muted-foreground text-sm">Hittades inte.</p>
          <Link href="/">
            <Button variant="outline">Till start</Button>
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
        const params = new URLSearchParams();
        params.set("project", project.id);
        params.set("type", type);
        params.set("promptId", promptId);
        params.set("buildIntent", buildIntent);
        params.set("buildMethod", "category");
        router.push(`/builder?${params.toString()}`);
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
      const params = new URLSearchParams();
      params.set("project", project.id);
      params.set("type", type);
      params.set("promptId", promptId);
      params.set("buildIntent", buildIntent);
      params.set("buildMethod", "category");
      router.push(`/builder?${params.toString()}`);
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
      const params = new URLSearchParams();
      params.set("project", project.id);
      params.set("type", type);
      params.set("promptId", promptId);
      params.set("buildIntent", buildIntent);
      params.set("buildMethod", "category");
      router.push(`/builder?${params.toString()}`);
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
        buildIntent={buildIntent}
      />

      <div className="relative z-10 min-h-screen px-4 py-8">
        {/* Header */}
        <div className="mx-auto mb-8 max-w-5xl">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground hover:bg-muted hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Tillbaka
            </Button>
          </Link>

          <div className="mb-4 flex items-center gap-4">
            <div className="rounded-2xl border border-border bg-primary/10 p-3">
              <Icon className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{displayCategory.title}</h1>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{displayCategory.description}</p>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-5xl space-y-10">
          {/* Section 1: Custom prompt */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              <h2 className="text-foreground text-base font-semibold tracking-tight">Eget</h2>
              <HelpTooltip text="Beskriv vad du vill skapa." />
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                <div className="flex flex-1 flex-col">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`${displayCategory.title.toLowerCase()}…`}
                    className="h-28 flex-1 resize-none rounded-xl border border-input bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-[3px] focus:ring-ring/50"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-muted-foreground text-xs tabular-nums">{prompt.length}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowWizard(true)}
                      disabled={isCreating}
                      className="text-primary hover:bg-primary/10 h-8 gap-1.5 px-2"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      <span className="text-xs">Utöka</span>
                    </Button>
                  </div>
                </div>
                <Button
                  onClick={handlePromptSubmit}
                  disabled={!prompt.trim() || isCreating}
                  className="h-auto min-h-[7rem] shrink-0 gap-2 px-6 sm:w-36"
                >
                  {isCreating ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Rocket className="h-5 w-5" />
                  )}
                  <span>{isCreating ? "…" : "Skapa"}</span>
                </Button>
              </div>
            </div>
          </section>

          {/* Section 2: Quick prompts */}
          {displayCategory.quickPrompts && displayCategory.quickPrompts.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <h2 className="text-foreground text-base font-semibold tracking-tight">Snabbval</h2>
                <HelpTooltip text="Starta med fördefinierat innehåll." />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {displayCategory.quickPrompts.map((quickPrompt) => (
                  <Button
                    key={quickPrompt.label}
                    onClick={() => handleQuickPrompt(quickPrompt)}
                    disabled={isCreating}
                    variant="outline"
                    className="group flex h-auto min-h-[4.5rem] flex-col items-start gap-0.5 rounded-2xl border-border bg-card px-4 py-4 text-left shadow-sm transition-[border-color,box-shadow,background-color] duration-200 hover:border-primary/25 hover:bg-muted/50 hover:shadow-md disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <span className="font-semibold tracking-tight text-foreground">{quickPrompt.label}</span>
                  </Button>
                ))}
              </div>
            </section>
          )}

          {/* Section 3: Templates */}
          {v0Templates.length > 0 && (
            <section>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Layout className="h-5 w-5 text-primary" />
                <h2 className="text-foreground text-base font-semibold tracking-tight">Mallar</h2>
                <HelpTooltip text="Starta en färdig mall i buildern." />
              </div>
              <p className="text-muted-foreground mb-4 text-xs">Förhandsgranska eller öppna i builder.</p>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {v0Templates.map((template) => (
                  <V0TemplateCard
                    key={template.id}
                    template={template}
                    disabled={isCreating}
                    buildIntent={buildIntent}
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
  buildIntent,
}: {
  template: Template;
  disabled: boolean;
  buildIntent: BuildIntent;
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
      const catalogItem = getTemplateCatalogItemById(template.id);
      const resolvedIntent: BuildIntent = catalogItem?.buildIntent ?? buildIntent;
      const project = await createProject(
        `${template.title || template.id} - ${new Date().toLocaleDateString("sv-SE")}`,
        type,
        `Baserat på mall: ${template.title || template.id}`,
      );
      const params = new URLSearchParams();
      params.set("project", project.id);
      params.set("templateId", template.id);
      params.set("buildIntent", resolvedIntent);
      params.set("buildMethod", "category");
      router.push(`/builder?${params.toString()}`);
    } catch (error) {
      console.error("Failed to create project from template:", error);
      setIsCreating(false);
    }
  };

  return (
    <>
      <div className="group cursor-pointer overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-primary/20 hover:shadow-md">
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          <Image
            src={imageUrl}
            alt={template.title || template.id}
            fill
            className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
            loading="lazy"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            unoptimized
          />
        </div>
        <div className="space-y-3 p-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-start gap-2">
              <h3 className="line-clamp-2 text-sm font-semibold tracking-tight text-foreground">
                {template.title || template.id}
              </h3>
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Mall
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePreviewClick}
              disabled={disabled || !imageUrl}
              className="border-primary/25 bg-primary/10 text-primary hover:bg-primary/15 flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Play className="h-3.5 w-3.5" />
              Visa
            </button>
            <button
              type="button"
              onClick={handleEdit}
              disabled={disabled || isCreating}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {isCreating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Edit className="h-3.5 w-3.5" />
              )}
              {isCreating ? "…" : "Öppna"}
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

