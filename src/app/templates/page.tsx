import type { Metadata } from "next";
import Link from "next/link";
import { MinimalFooter } from "@/components/layout";
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
} from "lucide-react";

export const metadata: Metadata = {
  title: "Mallar",
  description: "Professionella webbplatsmallar. AI-genererade för alla branscher.",
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Wand2, Zap, Puzzle, Lock, FileText, Palette, Layout, Globe, Gamepad2, HelpCircle,
};

export default function TemplatesPage() {
  const categories = getAllV0Categories().filter((c) => c.id !== "uncategorized");

  return (
    <>
      <main className="bg-background text-foreground min-h-screen">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="mb-12 text-center">
            <h1 className="text-foreground mb-2 text-3xl font-semibold tracking-tight">Mallar</h1>
            <p className="text-muted-foreground">Välj en mall och kom igång.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => {
              const Icon = ICON_MAP[category.icon] || HelpCircle;
              const count = getTemplatesByCategory(category.id).length;

              return (
                <Link
                  key={category.id}
                  href={`/category/${category.id}`}
                  title={category.description}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-all hover:border-primary/30 hover:bg-muted/50"
                >
                  <Icon className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{category.title}</p>
                    <p className="text-[11px] text-muted-foreground">{count} mallar</p>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-12 text-center">
            <Link
              href="/"
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
            >
              <Wand2 className="h-4 w-4" />
              Skapa med AI
            </Link>
          </div>
        </div>
      </main>
      <MinimalFooter />
    </>
  );
}
