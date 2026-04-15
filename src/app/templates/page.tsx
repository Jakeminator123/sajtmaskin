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
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="mb-10 text-center sm:mb-12">
            <h1 className="text-foreground mb-2 text-3xl font-semibold tracking-tight">Mallar</h1>
            <p className="text-muted-foreground text-sm">Välj kategori.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => {
              const Icon = ICON_MAP[category.icon] || HelpCircle;
              const count = getTemplatesByCategory(category.id).length;

              return (
                <Link
                  key={category.id}
                  href={`/category/${category.id}`}
                  title={category.description}
                  className="group flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm transition-[border-color,box-shadow,background-color] duration-200 hover:border-primary/25 hover:bg-muted/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <Icon className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold tracking-tight text-foreground">{category.title}</p>
                    <p className="text-[11px] text-muted-foreground">{count}</p>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-10 text-center sm:mt-12">
            <Link
              href="/"
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex min-h-11 items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium transition-colors"
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
