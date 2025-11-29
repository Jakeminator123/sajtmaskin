import { TemplateGallery } from "@/components/template-gallery";
import { PromptInput } from "@/components/prompt-input";
import { HelpTooltip } from "@/components/help-tooltip";
import { Rocket } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900">
      {/* Background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent pointer-events-none" />

      <div className="relative flex flex-col items-center justify-center min-h-screen px-4 py-16 space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-lg shadow-blue-500/20">
              <Rocket className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              SajtMaskin
            </h1>
          </div>
          <h2 className="text-xl sm:text-2xl text-zinc-300 font-medium flex items-center justify-center gap-2">
            Vad vill du bygga idag?
            <HelpTooltip text="Välj en kategori för att komma igång snabbt, eller beskriv din webbplats med egna ord i textfältet nedan." />
          </h2>
          <p className="text-sm text-zinc-500 max-w-md mx-auto">
            Skapa professionella webbplatser på minuter med hjälp av AI. Välj en
            mall eller beskriv din vision.
          </p>
        </div>

        {/* Template Gallery */}
        <TemplateGallery />

        {/* Divider */}
        <div className="flex items-center gap-4 w-full max-w-md">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
          <span className="text-sm font-medium text-zinc-500 uppercase tracking-wider">
            Eller
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
        </div>

        {/* Prompt Input */}
        <PromptInput />

        {/* Footer hint */}
        <p className="text-xs text-zinc-600 text-center max-w-sm">
          Tryck Enter för att skicka, Shift+Enter för ny rad.
          <br />
          AI genererar kod som du kan ladda ner och använda.
        </p>
      </div>
    </main>
  );
}
