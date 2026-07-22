import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";
import { SiteBackground } from "@/components/layout/site-background";
import { TemplatesBrowser } from "@/components/templates/templates-browser";
import { Wand2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Webbplatsmallar",
  description:
    "Bläddra bland professionella webbplatsmallar. AI-genererade mallar för alla branscher och behov.",
};

export default function TemplatesPage() {
  return (
    <>
      <main className="relative bg-background text-foreground min-h-screen">
        {/* Samma lätta, WebGL-fria bakgrund som förstasidan/övriga sidor. */}
        <SiteBackground tint="template" />

        <div className="relative z-10 mx-auto max-w-6xl px-6 py-16">
          {/* Hero */}
          <div className="mb-12 text-center">
            <h1 className="text-foreground mb-4 text-4xl font-semibold tracking-tight">
              Webbplatsmallar
            </h1>
            <p className="text-muted-foreground mx-auto max-w-xl text-lg leading-relaxed">
              Välj en mall och skapa din professionella webbplats på minuter med AI.
              Alla mallar är anpassningsbara. Lokala repo-baserade v0-mallar markeras inne i respektive kategori.
            </p>
          </div>

          {/* Sök + kategori-galleri (client-side smart sök) */}
          <TemplatesBrowser />

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
