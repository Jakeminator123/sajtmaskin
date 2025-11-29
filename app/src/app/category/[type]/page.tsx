"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import {
  ArrowLeft,
  ArrowRight,
  Rocket,
  Sparkles,
  FileText,
  Globe,
  LayoutDashboard,
  ShoppingCart,
  Briefcase,
  Gamepad2,
  Puzzle,
  LogIn,
} from "lucide-react";
import { getCategory, type Template } from "@/lib/template-data";

// Icon mapping
const iconMap: Record<string, React.ElementType> = {
  FileText,
  Globe,
  LayoutDashboard,
  ShoppingCart,
  Briefcase,
  Gamepad2,
  Puzzle,
  LogIn,
  Sparkles,
};

export default function CategoryPage() {
  const params = useParams();
  const router = useRouter();
  const type = params.type as string;
  const [prompt, setPrompt] = useState("");

  const category = getCategory(type);

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

  const handlePromptSubmit = () => {
    if (prompt.trim()) {
      router.push(
        `/builder?type=${type}&prompt=${encodeURIComponent(prompt.trim())}`
      );
    }
  };

  const handleTemplateSelect = (template: Template) => {
    router.push(`/builder?templateId=${template.id}&type=${type}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handlePromptSubmit();
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900">
      {/* Background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent pointer-events-none" />

      <div className="relative min-h-screen px-4 py-8">
        {/* Header */}
        <div className="max-w-4xl mx-auto mb-8">
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

        {/* Two-column layout */}
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
          {/* Left: Prompt input */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-5 w-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-zinc-100">
                Beskriv med egna ord
              </h2>
              <HelpTooltip text="Skriv en beskrivning av vad du vill skapa så genererar AI:n det åt dig." />
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-4">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Beskriv din ${category.title.toLowerCase()}...`}
                className="w-full h-32 bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
              />
              <Button
                onClick={handlePromptSubmit}
                disabled={!prompt.trim()}
                className="w-full gap-2 bg-blue-600 hover:bg-blue-500"
              >
                <Rocket className="h-4 w-4" />
                Skapa med AI
              </Button>
            </div>

            <p className="text-xs text-zinc-500 text-center">
              Tryck Enter för att skicka
            </p>
          </div>

          {/* Right: Template gallery */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-5 w-5 text-emerald-400" />
              <h2 className="text-lg font-semibold text-zinc-100">
                Eller välj en template
              </h2>
              <HelpTooltip text="Börja från en färdig design och anpassa den efter dina behov." />
            </div>

            {category.templates.length > 0 ? (
              <div className="space-y-3">
                {category.templates.map((template) => (
                  <Card
                    key={template.id}
                    onClick={() => handleTemplateSelect(template)}
                    className="group cursor-pointer bg-zinc-900/50 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/50 transition-all"
                  >
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium text-zinc-100 group-hover:text-white">
                          {template.name}
                        </h3>
                        <p className="text-sm text-zinc-500">
                          {template.description}
                        </p>
                      </div>
                      <ArrowRight className="h-5 w-5 text-zinc-600 group-hover:text-blue-400 transition-colors" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 text-center">
                <p className="text-zinc-500">
                  Inga templates tillgängliga för denna kategori ännu.
                </p>
                <p className="text-zinc-600 text-sm mt-2">
                  Använd prompten till vänster för att skapa något nytt!
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
