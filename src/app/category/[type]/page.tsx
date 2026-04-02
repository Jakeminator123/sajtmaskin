"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { PromptWizardModalV2, type WizardData } from "@/components/modals";
import { MinimalFooter } from "@/components/layout/minimal-footer";
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
import { PreviewModal } from "@/components/templates";
import { toast } from "sonner";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText, Globe, LayoutDashboard, Wand2, Zap, Puzzle, Lock, Palette, Layout, Gamepad2, HelpCircle,
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
  const displayCategory = v0Category || category;

  if (!displayCategory) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">Kategorin hittades inte</p>
          <Link href="/templates"><Button variant="outline" size="sm">Tillbaka</Button></Link>
        </div>
      </div>
    );
  }

  const Icon: React.ComponentType<{ className?: string }> = iconMap[displayCategory.icon] || FileText;

  const createPromptHandoff = async (value: string, projectId: string): Promise<string | null> => {
    try {
      const response = await fetch("/api/prompts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: value, source: `category:${type}`, projectId }),
      });
      const data = (await response.json().catch(() => null)) as { success?: boolean; promptId?: string; error?: string } | null;
      if (!response.ok || !data?.promptId) throw new Error(data?.error || "Kunde inte spara prompten");
      return data.promptId;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kunde inte spara prompten");
      return null;
    }
  };

  const navigateToBuilder = async (promptText: string, projectName: string) => {
    setIsCreating(true);
    try {
      const project = await createProject(projectName, type, promptText.substring(0, 100));
      const promptId = await createPromptHandoff(promptText, project.id);
      if (!promptId) { setIsCreating(false); return; }
      const p = new URLSearchParams();
      p.set("project", project.id); p.set("type", type);
      p.set("promptId", promptId); p.set("buildIntent", buildIntent); p.set("buildMethod", "category");
      router.push(`/builder?${p.toString()}`);
    } catch (error) {
      console.error("Failed to create project:", error);
      setIsCreating(false);
    }
  };

  const handlePromptSubmit = () => {
    if (prompt.trim() && !isCreating) {
      navigateToBuilder(prompt.trim(), `${displayCategory.title} - ${new Date().toLocaleDateString("sv-SE")}`);
    }
  };

  const handleQuickPrompt = (qp: QuickPrompt) => {
    if (!isCreating) navigateToBuilder(qp.prompt, `${qp.label} - ${new Date().toLocaleDateString("sv-SE")}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handlePromptSubmit(); }
  };

  const handleWizardComplete = async (wizardData: WizardData, expandedPrompt: string) => {
    setShowWizard(false);
    setPrompt(expandedPrompt);
    setIsCreating(true);
    try {
      const projectName = wizardData.companyName
        ? `${wizardData.companyName} - ${displayCategory.title}`
        : `${displayCategory.title} - ${new Date().toLocaleDateString("sv-SE")}`;
      const project = await createProject(projectName, type, expandedPrompt.substring(0, 100));
      if (wizardData.companyName) {
        fetch("/api/company-profile", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: project.id, company_name: wizardData.companyName,
            industry: wizardData.industry, location: wizardData.location,
            existing_website: wizardData.existingWebsite, website_analysis: wizardData.websiteAnalysis,
            site_likes: wizardData.siteLikes, site_dislikes: wizardData.siteDislikes,
            site_feedback: wizardData.siteOtherFeedback, target_audience: wizardData.targetAudience,
            purposes: wizardData.purposes, special_wishes: wizardData.specialWishes,
            color_palette_name: wizardData.palette?.name,
            color_primary: wizardData.customColors?.primary || wizardData.palette?.primary,
            color_secondary: wizardData.customColors?.secondary || wizardData.palette?.secondary,
            color_accent: wizardData.customColors?.accent || wizardData.palette?.accent,
            industry_trends: wizardData.industryTrends, inspiration_sites: wizardData.inspirationSites,
            voice_transcript: wizardData.voiceTranscript,
          }),
        }).catch((err) => console.error("Failed to save company profile:", err));
      }
      const promptId = await createPromptHandoff(expandedPrompt, project.id);
      if (!promptId) { setIsCreating(false); return; }
      const p = new URLSearchParams();
      p.set("project", project.id); p.set("type", type);
      p.set("promptId", promptId); p.set("buildIntent", buildIntent); p.set("buildMethod", "category");
      router.push(`/builder?${p.toString()}`);
    } catch (error) {
      console.error("Failed to create project:", error);
      setIsCreating(false);
    }
  };

  return (
    <>
      <main className="bg-background min-h-screen">
        <PromptWizardModalV2
          isOpen={showWizard} onClose={() => setShowWizard(false)}
          onComplete={handleWizardComplete} initialPrompt={prompt}
          categoryType={type} buildIntent={buildIntent}
        />

        <div className="mx-auto max-w-4xl px-6 py-8">
          <Link href="/templates" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Mallar
          </Link>

          <div className="mb-8 flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Icon className="text-primary h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">{displayCategory.title}</h1>
              <p className="text-xs text-muted-foreground">{displayCategory.description}</p>
            </div>
          </div>

          <div className="space-y-8">
            {/* Prompt input */}
            <section>
              <div className="rounded-xl border border-border p-4">
                <div className="flex gap-3">
                  <div className="flex flex-1 flex-col">
                    <textarea
                      value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={handleKeyDown}
                      placeholder={`Beskriv din ${displayCategory.title.toLowerCase()}...`}
                      className="h-20 flex-1 resize-none rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:outline-none"
                    />
                    <div className="mt-2 flex items-center justify-end">
                      <button type="button" onClick={() => setShowWizard(true)} disabled={isCreating}
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                        <Wand2 className="h-3 w-3" /> Bygg ut med AI
                      </button>
                    </div>
                  </div>
                  <Button onClick={handlePromptSubmit} disabled={!prompt.trim() || isCreating} className="h-20 gap-1.5 px-5">
                    {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                    <span className="hidden sm:inline">{isCreating ? "Skapar…" : "Skapa"}</span>
                  </Button>
                </div>
              </div>
            </section>

            {/* Quick prompts */}
            {displayCategory.quickPrompts && displayCategory.quickPrompts.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Zap className="h-4 w-4 text-primary" /> Snabbval
                </h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {displayCategory.quickPrompts.map((qp) => (
                    <button key={qp.label} onClick={() => handleQuickPrompt(qp)} disabled={isCreating}
                      className="rounded-lg border border-border px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/50 disabled:opacity-50">
                      {qp.label}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Templates */}
            {v0Templates.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Layout className="h-4 w-4 text-primary" /> Mallar
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {v0Templates.map((template) => (
                    <V0TemplateCard key={template.id} template={template} disabled={isCreating} buildIntent={buildIntent} />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
      <MinimalFooter />
    </>
  );
}

function V0TemplateCard({ template, disabled, buildIntent }: { template: Template; disabled: boolean; buildIntent: BuildIntent }) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const imageUrl = getTemplateImageUrl(template);
  const useUnoptimizedPreview = imageUrl.startsWith("https://v0.app/chat/api/og/");
  const type = useParams().type as string;

  const handlePreviewClick = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!disabled && imageUrl) setShowModal(true);
  };

  const handleEdit = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (disabled || isCreating) return;
    setIsCreating(true);
    try {
      const project = await createProject(
        `${template.title || template.id} - ${new Date().toLocaleDateString("sv-SE")}`,
        type, `Baserat på template: ${template.id}`,
      );
      const p = new URLSearchParams();
      p.set("project", project.id); p.set("templateId", template.id);
      p.set("buildIntent", buildIntent); p.set("buildMethod", "category");
      router.push(`/builder?${p.toString()}`);
    } catch (error) {
      console.error("Failed to create project from template:", error);
      setIsCreating(false);
    }
  };

  return (
    <>
      <div className="group overflow-hidden rounded-xl border border-border transition-colors hover:border-primary/30">
        <div className="relative aspect-video bg-muted">
          <Image src={imageUrl} alt={template.title || template.id} fill
            className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            loading="lazy" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" />
        </div>
        <div className="p-3 space-y-2">
          <h3 className="truncate text-sm font-medium text-foreground">{template.title || template.id}</h3>
          <div className="flex gap-2">
            <button onClick={handlePreviewClick} disabled={disabled || !imageUrl}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 disabled:opacity-50">
              <Play className="h-3 w-3" /> Visa
            </button>
            <button onClick={handleEdit} disabled={disabled || isCreating}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs text-foreground hover:bg-muted/50 disabled:opacity-50">
              {isCreating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Edit className="h-3 w-3" />}
              {isCreating ? "Skapar…" : "Redigera"}
            </button>
          </div>
        </div>
      </div>
      {imageUrl && <PreviewModal isOpen={showModal} onClose={() => setShowModal(false)} imageUrl={imageUrl} title={template.title || template.id} />}
    </>
  );
}
