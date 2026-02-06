import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout";
import { getAllV0Categories, getTemplatesByCategory } from "@/lib/templates/template-data";
import {
  Wand2,
  Zap,
  Puzzle,
  Lock,
  FileText,
  Palette,
  Layout,
  Globe,
  Gamepad2,
  HelpCircle,
  Triangle,
  ArrowRight,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Webbplatsmallar",
  description:
    "Bläddra bland professionella webbplatsmallar. AI-genererade templates för alla branscher och behov.",
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Wand2,
  Zap,
  Puzzle,
  Lock,
  FileText,
  Palette,
  Layout,
  Globe,
  Gamepad2,
  HelpCircle,
  Triangle,
};

export default function TemplatesPage() {
  const categories = getAllV0Categories().filter((c) => c.id !== "uncategorized");

  return (
    <>
      <main className="bg-background text-foreground min-h-screen">
        <div className="mx-auto max-w-6xl px-6 py-16">
          {/* Hero */}
          <div className="mb-16 text-center">
            <h1 className="text-foreground mb-4 text-4xl font-semibold tracking-tight">
              Webbplatsmallar
            </h1>
            <p className="text-muted-foreground mx-auto max-w-xl text-lg leading-relaxed">
              Välj en mall och skapa din professionella webbplats på minuter med AI.
              Alla mallar är anpassningsbara.
            </p>
          </div>

          {/* Category grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => {
              const Icon = ICON_MAP[category.icon] || HelpCircle;
              const templateCount = getTemplatesByCategory(category.id).length;

              return (
                <Link
                  key={category.id}
                  href={`/category/${category.id}`}
                  className="bg-card hover:bg-card/80 border-border group flex flex-col rounded-lg border p-6 transition-all hover:shadow-lg"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-foreground font-medium tracking-tight">
                        {category.title}
                      </h2>
                      {templateCount > 0 && (
                        <span className="text-muted-foreground text-xs">
                          {templateCount} mallar
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-muted-foreground mb-4 flex-1 text-sm leading-relaxed">
                    {category.description}
                  </p>
                  <div className="text-primary flex items-center gap-1 text-sm font-medium opacity-0 transition-opacity group-hover:opacity-100">
                    Utforska <ArrowRight className="h-4 w-4" />
                  </div>
                </Link>
              );
            })}
          </div>

          {/* CTA */}
          <div className="mt-16 text-center">
            <p className="text-muted-foreground mb-4 text-sm">
              Hittar du inte vad du söker? Beskriv din idé och låt AI skapa en unik design.
            </p>
            <Link
              href="/"
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-colors"
            >
              <Wand2 className="h-4 w-4" />
              Skapa med AI
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
