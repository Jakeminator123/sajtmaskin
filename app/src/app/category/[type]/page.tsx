"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/help-tooltip";
import { LocalTemplateCard } from "@/components/local-template-card";
import {
  PromptWizardModal,
  type WizardData,
} from "@/components/prompt-wizard-modal";
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
} from "lucide-react";
import { getCategory, type QuickPrompt } from "@/lib/template-data";
import {
  getLocalTemplatesForCategory,
  type LocalTemplate,
} from "@/lib/local-templates";
import { createProject } from "@/lib/project-client";

// Icon mapping
const iconMap: Record<string, React.ElementType> = {
  FileText,
  Globe,
  LayoutDashboard,
  Sparkles,
};

export default function CategoryPage() {
  const params = useParams();
  const router = useRouter();
  const type = params.type as string;
  const [prompt, setPrompt] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  const category = getCategory(type);
  const templates = getLocalTemplatesForCategory(type);

  if (!category) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-zinc-400">Kategorin hittades inte</p>
          <Link href="/">
            <Button variant="outline">Tillbaka till start</Button>
          </Link>
        </div>
      </div>
    );
  }

  const Icon = iconMap[category.icon] || FileText;

  const handlePromptSubmit = async () => {
    if (prompt.trim() && !isCreating) {
      setIsCreating(true);
      try {
        // Create project in database first
        const project = await createProject(
          `${category.title} - ${new Date().toLocaleDateString("sv-SE")}`,
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

  const handleTemplateSelect = async (
    template: LocalTemplate,
    previewChatId?: string
  ) => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      // Create project in database
      const project = await createProject(
        `${template.name} - ${new Date().toLocaleDateString("sv-SE")}`,
        type,
        `Baserat på lokal mall: ${template.name}`
      );
      // Navigate to builder with localTemplateId and optional previewChatId
      // previewChatId allows seamless refinement of previewed templates
      const url = `/builder?project=${project.id}&localTemplateId=${
        template.id
      }${previewChatId ? `&chatId=${previewChatId}` : ""}`;
      router.push(url);
    } catch (error) {
      console.error("Failed to create project from template:", error);
      setIsCreating(false);
      // Re-throw so template-card can reset its loading state
      throw error;
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
        ? `${wizardData.companyName} - ${category.title}`
        : `${category.title} - ${new Date().toLocaleDateString("sv-SE")}`;

      const project = await createProject(
        projectName,
        type,
        expandedPrompt.substring(0, 100)
      );

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
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900">
      {/* Prompt Wizard Modal */}
      <PromptWizardModal
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        onComplete={handleWizardComplete}
        initialPrompt={prompt}
        categoryType={type}
      />

      {/* Background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent pointer-events-none" />

      <div className="relative min-h-screen px-4 py-8">
        {/* Header */}
        <div className="max-w-5xl mx-auto mb-8">
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-zinc-400 hover:text-zinc-100 mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Tillbaka
            </Button>
          </Link>

          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-lg shadow-blue-500/20">
              <Icon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                {category.title}
              </h1>
              <p className="text-zinc-400">{category.description}</p>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto space-y-10">
          {/* Section 1: Custom prompt */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-5 w-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-zinc-100">
                Beskriv med egna ord
              </h2>
              <HelpTooltip text="Skriv en beskrivning av vad du vill skapa så genererar AI:n det åt dig." />
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
              <div className="flex gap-4">
                <div className="flex-1 flex flex-col">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Beskriv din ${category.title.toLowerCase()}...`}
                    className="flex-1 h-24 bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                  />
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-zinc-500">
                      {prompt.length} tecken
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowWizard(true)}
                      disabled={isCreating}
                      className="gap-1.5 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 h-7 px-2"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      <span className="text-xs">Bygg ut med AI</span>
                    </Button>
                  </div>
                </div>
                <Button
                  onClick={handlePromptSubmit}
                  disabled={!prompt.trim() || isCreating}
                  className="h-24 px-6 gap-2 bg-blue-600 hover:bg-blue-500"
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
          {category.quickPrompts && category.quickPrompts.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Zap className="h-5 w-5 text-amber-400" />
                <h2 className="text-lg font-semibold text-zinc-100">
                  Snabbval
                </h2>
                <HelpTooltip text="Klicka på ett snabbval för att snabbt komma igång med en fördefinierad design." />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {category.quickPrompts.map((quickPrompt) => (
                  <Button
                    key={quickPrompt.label}
                    onClick={() => handleQuickPrompt(quickPrompt)}
                    disabled={isCreating}
                    variant="outline"
                    className="h-auto py-4 px-4 flex flex-col items-start text-left gap-1 bg-zinc-900/50 border-zinc-700 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all group disabled:opacity-50"
                  >
                    <span className="font-medium text-zinc-200 group-hover:text-amber-300">
                      {quickPrompt.label}
                    </span>
                    <span className="text-xs text-zinc-500 line-clamp-2">
                      AI genererar baserat på fördefinierad beskrivning
                    </span>
                  </Button>
                ))}
              </div>
            </section>
          )}

          {/* Section 3: Local pre-made templates */}
          {templates.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Layout className="h-5 w-5 text-emerald-400" />
                <h2 className="text-lg font-semibold text-zinc-100">
                  Färdiga mallar
                </h2>
                <HelpTooltip text="Nedladdade mallar från v0-communityt. Klicka för att använda som startpunkt och anpassa efter dina behov." />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((template) => (
                  <LocalTemplateCard
                    key={template.id}
                    template={template}
                    onSelect={handleTemplateSelect}
                    disabled={isCreating}
                  />
                ))}
              </div>

              <p className="text-xs text-zinc-600 text-center mt-4">
                Klicka på en mall för att använda den som grund för ditt projekt
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
