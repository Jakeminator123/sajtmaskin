import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { LandingFooter } from "@/components/landing-v2/landing-footer";
import { SiteBackground } from "@/components/layout/site-background";
import { Button } from "@/components/ui/button";
import {
  getReadyRelatedSeoLandingSlugs,
  getSeoLandingEntry,
  SEO_LANDING_CTA_HREF,
  type SeoLandingSlug,
} from "@/lib/seo-landing-pages/registry";

const SLUG = "hemsida-utan-kod" as const;

const STEPS = [
  {
    title: "Beskriv",
    body: "Skriv vad sidan ska göra, för vem och vilket nästa steg besökaren ska ta. Det är briefen — inte ett färdigt manus.",
  },
  {
    title: "Få struktur och utkast",
    body: "Verktyget föreslår sektioner och texter. I Sajtmaskin kommer utkastet som en Next.js-sajt i preview, inte som en kodfil du måste skriva själv.",
  },
  {
    title: "Ändra på svenska",
    body: "Du styr med följdtext i byggaren: “gör hero tydligare”, “byt CTA till Boka genomgång”. Det är inte en klassisk punkt-och-klicka-editor.",
  },
  {
    title: "Publicera v1",
    body: "Preview är arbetsytan. Publicering är ett separat steg och debiterar credits. Kolla mobil och fakta innan du går live.",
  },
] as const;

const NL_EDITS = [
  "Gör hero-rubriken kortare och mer konkret",
  "Byt primär knapp till “Boka genomgång”",
  "Flytta kontakt högt på mobilen",
] as const;

const WHEN_CODE = [
  "Komplex affärslogik, inloggning eller regler som inte ryms i ett utkast",
  "Skräddarsydda integrationer mot bokning, betalning eller ert eget system",
  "Ett redan låst designsystem som måste återskapas pixel för pixel",
  "Tung e-handel med lager, moms och kassa från dag ett",
] as const;

const MISTAKES = [
  "Publicera AI-utkastet utan att kolla namn, priser och öppettider",
  "Hoppa över mobilvyn — de flesta öppnar sidan i telefon",
  "Fem konkurrerande knappar i stället för ett primärt nästa steg",
  "Ingen kontaktväg, eller ett formulär ni inte svarar på",
  "Glömma att någon måste underhålla texter och bilder efter publicering",
] as const;

const FAQS = [
  {
    q: "Vad är skillnaden mot “skapa hemsida med AI”?",
    a: "Den här sidan handlar om att göra det själv utan att skriva programmering. AI-flödessidan går steg för steg genom Sajtmaskins process från beskrivning till första version. De överlappar — men frågan här är vad no-code faktiskt tar bort.",
  },
  {
    q: "Behöver jag en designer?",
    a: "Inte för en första förtroendesida. Du behöver däremot egna bilder, ett tydligt erbjudande och någon som faktagranskar. En designer eller byrå blir mer värd när varumärket eller designsystemet är låst.",
  },
  {
    q: "Kan jag byta senare?",
    a: "Som inloggad ägare kan du ladda ner projektet som ZIP eller exportera till GitHub. Med följer den genererade koden, inte databasen, API-nycklar eller domänregistrering.",
  },
  {
    q: "Hur kommer jag till egen domän?",
    a: "Preview under bygget är inte den publicerade sajten. Efter publicering kan du koppla en domän du redan äger; kopplingen kan vara stängd i vissa miljöer. Köp av ny domän i appen är inte allmänt live. Utan egen domän får sidan en Vercel-adress.",
  },
  {
    q: "Slipper jag allt jobb om jag skippar kod?",
    a: "Nej. Du slipper syntax. Du slipper inte välja erbjudande, bevis och nästa steg — och du slipper inte granska utkastet. “Utan ansträngning” är inte ett ärligt löfte.",
  },
] as const;

function CtaButton({ children }: { children: ReactNode }) {
  return (
    <Button
      asChild
      size="lg"
      className="btn-3d btn-glow bg-primary px-8 text-base font-medium text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary-hover"
    >
      <Link href={SEO_LANDING_CTA_HREF}>
        {children}
        <ArrowRight className="ml-1 h-4 w-4" />
      </Link>
    </Button>
  );
}

function NoCodePreview() {
  return (
    <figure className="overflow-hidden rounded-[28px] border border-border/25 bg-card/60 shadow-[0_28px_80px_rgba(6,10,20,0.35)]">
      <div className="flex items-center gap-2 border-b border-border/20 px-4 py-3">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <p className="ml-2 truncate text-[11px] text-muted-foreground">
          Beskrivning → sektioner · ingen kodrad
        </p>
      </div>
      <div className="space-y-3 px-5 py-6 md:px-7 md:py-8">
        <p className="text-[11px] font-medium tracking-[0.18em] text-primary uppercase">
          Du skriver
        </p>
        <div className="rounded-2xl border border-border/40 bg-background/40 px-4 py-3">
          <p className="text-sm text-foreground/90">
            Lokal konsultfirma. Startsida, tjänster och en tydlig offertknapp.
          </p>
        </div>
        <p className="text-[11px] font-medium tracking-[0.18em] text-primary uppercase">
          Du får
        </p>
        <div className="grid grid-cols-3 gap-2">
          {["Hero", "Tjänster", "Kontakt"].map((label) => (
            <div
              key={label}
              className="rounded-2xl border border-border/40 bg-background/30 px-3 py-4 text-sm text-foreground/90"
            >
              {label}
            </div>
          ))}
        </div>
      </div>
      <figcaption className="px-5 py-3 text-xs leading-relaxed text-muted-foreground">
        Illustrerat flöde — inte ett löfte om att sidan blir klar utan beslut eller granskning.
      </figcaption>
    </figure>
  );
}

function RelatedLink({ slug }: { slug: SeoLandingSlug }) {
  const related = getSeoLandingEntry(slug);
  return (
    <Link
      href={`/${slug}`}
      className="text-sm text-foreground/90 underline-offset-4 hover:text-foreground hover:underline"
    >
      {related.title}
    </Link>
  );
}

export const readyRelatedSeoLandingSlugs = getReadyRelatedSeoLandingSlugs;

export function HemsidaUtanKodContent() {
  const entry = getSeoLandingEntry(SLUG);
  const readyRelated = readyRelatedSeoLandingSlugs(entry.relatedSlugs);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <SiteBackground tint="analyserad" />

      <div className="relative z-10">
        <header className="flex items-center justify-between gap-4 border-b border-border/20 px-6 py-3.5">
          <Link href="/" className="text-sm font-semibold text-foreground">
            Sajtmaskin
            <span className="ml-2 hidden rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium tracking-wider text-primary uppercase sm:inline-flex">
              Beta
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/teknik"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              Teknik
            </Link>
            <Link
              href="/faq"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              FAQ
            </Link>
            <Button
              asChild
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary-hover"
            >
              <Link href={entry.ctaHref}>Börja utan kod</Link>
            </Button>
          </div>
        </header>

        <main>
          <section className="px-6 pt-14 pb-10 md:pt-24 md:pb-16">
            <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div>
                <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                  Skapa hemsida utan kod
                </p>
                <h1 className="text-balance font-(--font-heading) text-3xl leading-[1.1] tracking-tight text-foreground md:text-5xl">
                  {entry.plannedH1}
                </h1>
                <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
                  Utan kod betyder att du bygger och publicerar utan att skriva programmering. Du
                  slipper syntax — men inte beslut om erbjudande, bevis och nästa steg. AI-flödet
                  är en väg; en visuell editor är en annan. Den här sidan svarar på vad du kan göra
                  själv, inte på hur Sajtmaskins AI-steg ser ut i detalj.
                </p>
                <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <CtaButton>Börja utan kod</CtaButton>
                  <Button
                    asChild
                    size="lg"
                    variant="ghost"
                    className="text-base text-muted-foreground hover:text-foreground"
                  >
                    <Link href="/skapa-hemsida-med-ai">Se AI-flödet steg för steg</Link>
                  </Button>
                </div>
              </div>
              <NoCodePreview />
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Vad no-code tar bort
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Fyra steg utan att skriva syntax
              </h2>
              <ol className="mt-10 grid gap-3 md:grid-cols-4">
                {STEPS.map((step, index) => (
                  <li
                    key={step.title}
                    className="rounded-2xl border border-border/40 bg-card/70 p-4 md:p-5"
                  >
                    <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <h3 className="mt-3 text-sm font-medium text-foreground md:text-base">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section id="exempel" className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Ändra utan kod
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Följdtext i stället för en kodrad
              </h2>
              <div className="mt-8 overflow-hidden rounded-[28px] border border-border/25 bg-card/60">
                <div className="flex items-center gap-2 border-b border-border/20 px-4 py-3">
                  <span className="size-2.5 rounded-full bg-border" />
                  <span className="size-2.5 rounded-full bg-border" />
                  <span className="size-2.5 rounded-full bg-border" />
                  <p className="ml-2 text-[11px] text-muted-foreground">exempel · NL-edit</p>
                </div>
                <div className="grid gap-0 lg:grid-cols-2">
                  <div className="space-y-3 border-b border-border/15 p-6 lg:border-r lg:border-b-0">
                    <p className="text-xs font-medium tracking-widest text-primary uppercase">
                      Första utkastet
                    </p>
                    <p className="text-sm leading-relaxed text-foreground/90">
                      Hero, tre tjänster och ett generiskt “Kontakta oss”. I Sajtmaskin är första
                      bygget max tre sidor — tillräckligt för startsida plus det som bär
                      erbjudandet.
                    </p>
                  </div>
                  <div className="space-y-3 p-6">
                    <p className="text-xs font-medium tracking-widest text-primary uppercase">
                      Du skriver i byggaren
                    </p>
                    <ul className="space-y-2 text-sm text-foreground/90">
                      {NL_EDITS.map((item) => (
                        <li
                          key={item}
                          className="rounded-2xl border border-border/40 bg-background/30 px-3 py-2"
                        >
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-3xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Mobil och publicering
              </p>
              <h2 className="text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Kolla telefonen innan sidan går live
              </h2>
              <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
                En sida som bara fungerar på bred skärm är inte klar. Titta på smal bredd med era
                egna bilder. Preview är inte publicering. Utan egen domän får den publicerade
                sidan en Vercel-adress; koppling av en domän ni redan äger kan vara stängd i
                vissa miljöer.
              </p>
              <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
                I Sajtmaskin betalar du credits som engångsköp, utan prenumeration. Publicering
                debiterar credits. Aktuella paket finns på{" "}
                <Link href="/#priser" className="text-foreground underline-offset-4 hover:underline">
                  prissidan
                </Link>
                . Formulär och bokning i första utkastet är demo tills ni uttryckligen bygger
                integrationerna.
              </p>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto grid max-w-6xl items-start gap-4 lg:grid-cols-2">
              <div className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <h2 className="font-(--font-heading) text-xl text-foreground md:text-2xl">
                  När kod fortfarande behövs
                </h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {WHEN_CODE.map((item) => (
                    <li key={item} className="flex gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <h2 className="font-(--font-heading) text-xl text-foreground md:text-2xl">
                  Vanliga misstag
                </h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {MISTAKES.map((item) => (
                    <li key={item} className="flex gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-3xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Vanliga frågor
              </p>
              <h2 className="text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Svar som matchar produkten i dag
              </h2>
              <dl className="mt-8 space-y-3">
                {FAQS.map((faq) => (
                  <div
                    key={faq.q}
                    className="rounded-2xl border border-border/40 bg-card/70 px-5 py-5"
                  >
                    <dt className="font-medium text-foreground">{faq.q}</dt>
                    <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{faq.a}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          {readyRelated.length > 0 ? (
            <section className="border-t border-border/15 px-6 py-12">
              <div className="mx-auto max-w-6xl">
                <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                  Relaterat
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Den teknikneutrala vägen, AI-flödet och verktygstyperna ligger på egna sidor.
                </p>
                <ul className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
                  {readyRelated.map((slug) => (
                    <li key={slug}>
                      <RelatedLink slug={slug} />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}

          <section className="border-t border-border/15 px-6 py-20 md:py-28">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Bygg första utkastet utan kod
              </h2>
              <p className="mx-auto mt-4 max-w-md text-pretty leading-relaxed text-muted-foreground">
                Beskriv verksamheten i byggaren. Titta på utkastet, rätta bevisen och publicera
                först när nästa steg är tydligt.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <CtaButton>Börja utan kod</CtaButton>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="text-base text-muted-foreground hover:text-foreground"
                >
                  <Link href="/skapa-hemsida-med-ai">Se AI-flödet steg för steg</Link>
                </Button>
              </div>
            </div>
          </section>
        </main>

        <LandingFooter />
      </div>
    </div>
  );
}
