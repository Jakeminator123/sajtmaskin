import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";
import { SiteBackground } from "@/components/layout/site-background";
import { TemplatesBrowser } from "@/components/templates/templates-browser";
import { publicPageAlternates } from "@/lib/public-canonical-url";
import { Wand2 } from "lucide-react";

// Search Console (2026-11-18): /templates ranks just below page one for "hemsidemallar".
// Title, description and the short guide below the gallery target that query.
export const metadata: Metadata = {
  title: "Hemsidemallar – färdiga mallar att anpassa med AI",
  description:
    "Hemsidemallar för företag: landningssidor, webbplatsmallar, portfolio och e-handel. Välj en mall och anpassa texter och design med AI i Sajtmaskin.",
  alternates: publicPageAlternates("/templates"),
};

const TEMPLATE_GUIDE = [
  {
    heading: "Utgå från vad sidan ska göra",
    text: "En landningssida passar ett erbjudande med en tydlig knapp. En webbplatsmall passar ett företag med flera tjänster och sidor. Portfolio visar jobb du har gjort, e-handel säljer produkter.",
  },
  {
    heading: "Anpassa med vanliga meningar",
    text: "När du väljer en mall blir den ett eget projekt i byggaren. Där ändrar du texter, färger och sektioner genom att skriva vad du vill ha.",
  },
  {
    heading: "Byt exemplen innan du publicerar",
    text: "Namn, priser och bilder i mallarna är exempel. Ersätt dem med företagets egna uppgifter innan sidan går live.",
  },
] as const;

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
              Hemsidemallar
            </h1>
            <p className="text-foreground/80 mx-auto max-w-xl text-lg leading-relaxed">
              Färdiga hemsidemallar för småföretag: landningssidor, webbplatsmallar, portfolio och
              e-handel. Välj en mall och gör den till din egen med AI. Varje mall importeras som ett
              komplett projekt med sin egen kod.
            </p>
          </div>

          {/* Sök + kategori-galleri (client-side smart sök) */}
          <TemplatesBrowser />

          <section className="mx-auto mt-16 max-w-4xl" aria-labelledby="valj-hemsidemall">
            <h2
              id="valj-hemsidemall"
              className="text-foreground mb-6 text-center text-2xl font-semibold tracking-tight"
            >
              Så väljer du hemsidemall
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {TEMPLATE_GUIDE.map((item) => (
                <div key={item.heading} className="border-border bg-card/60 rounded-2xl border p-5">
                  <h3 className="text-foreground mb-2 font-medium">{item.heading}</h3>
                  <p className="text-foreground/80 text-sm leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <div className="mt-16 text-center">
            <p className="text-foreground/80 mb-4 text-sm">
              Hittar du inte vad du söker? Beskriv din idé och låt AI skapa en unik design.
              Eller läs{" "}
              <Link href="/skapa-hemsida-med-ai" className="text-foreground underline-offset-4 hover:underline">
                hur du skapar hemsida med AI
              </Link>{" "}
              och{" "}
              <Link href="/hemsideprogram" className="text-foreground underline-offset-4 hover:underline">
                jämför hemsideprogram
              </Link>{" "}
              eller{" "}
              <Link
                href="/wordpress-alternativ"
                className="text-foreground underline-offset-4 hover:underline"
              >
                alternativ till WordPress
              </Link>
              .
            </p>
            <Link
              href="/"
              className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-colors"
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
