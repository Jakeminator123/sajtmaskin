import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { LandingFooter } from "@/components/landing-v2/landing-footer";
import { SiteBackground } from "@/components/layout/site-background";
import { Button } from "@/components/ui/button";
import {
  getSeoLandingEntry,
  SEO_LANDING_CTA_HREF,
  type SeoLandingSlug,
} from "@/lib/seo-landing-pages/registry";

const SLUG = "skapa-hemsida-med-ai" as const;

const PROCESS_STEPS = [
  {
    title: "Beskriv företaget eller idén",
    body: "Skriv vad ni gör, var ni finns och vad sidan ska åstadkomma. Fritext räcker. Vill du styra mer kan du gå en kort genomgång innan bygget startar.",
  },
  {
    title: "AI planerar sidan",
    body: "Sajtmaskin tar fram sidstruktur, sektioner och en visuell riktning. Det är ett förslag — inte en låst mall du måste leva med.",
  },
  {
    title: "Första versionen skapas",
    body: "Du får ett konkret utkast i kod, som en riktig Next.js-sajt. Du öppnar den i preview och ser vad som faktiskt byggdes.",
  },
  {
    title: "Granska och ändra",
    body: "Säg vad som ska bort, läggas till eller skrivas om. Nästa version bygger vidare på den du just tittade på.",
  },
  {
    title: "Publicera eller ta med koden",
    body: "När du är nöjd kan du publicera till en live-adress, eller exportera projektet som ZIP eller till GitHub. Preview under bygget är inte samma sak som en publicerad sajt.",
  },
] as const;

const AI_DOES = [
  {
    title: "Struktur",
    body: "Föreslår startsida och undersidor, och hur sektionerna hänger ihop. I första bygget väljer du sidantal i preview — taket där är tre sidor.",
  },
  {
    title: "Layout och design",
    body: "Väljer scaffold, visuell variant, typografi och färdriktning så utkastet ser ut som en sajt, inte som en tom editor.",
  },
  {
    title: "Innehåll",
    body: "Skriver utkast till rubriker, brödtext och sektioner utifrån din beskrivning. Det är ett startläge, inte publiceringsklart faktaunderlag.",
  },
  {
    title: "Iteration",
    body: "Tar emot följdinstruktioner och ändrar design, texter eller struktur utan att du behöver koda.",
  },
] as const;

const HUMAN_STILL_DOES = [
  {
    title: "Faktakontroll",
    body: "Öppettider, priser, namn, adress och organisationsuppgifter måste stämma. AI:n gissar om du inte har skrivit dem.",
  },
  {
    title: "Bilder och avsändare",
    body: "Byt ut placeholder-bilder mot era egna. En företagssida blir trovärdig först när den ser ut som er, inte som ett generellt exempel.",
  },
  {
    title: "Erbjudandet",
    body: "Vad ni säljer, till vem och varför någon ska höra av sig. Det kan AI hjälpa till att formulera, men bara du vet vad som är sant.",
  },
  {
    title: "Juridik och publicering",
    body: "Integritet, cookies och villkor är ert ansvar. Du avgör också när utkastet är tillräckligt bra för att gå live.",
  },
] as const;

const COMPARISON_ROWS = [
  {
    aspect: "Första version",
    ai: "Utkast i kod efter en beskrivning",
    agency: "Research, skiss och produktion",
    cms: "Du bygger sida för sida själv",
  },
  {
    aspect: "Ändringar",
    ai: "Följdtext i chatten, ny version att granska",
    agency: "Ny brief och ny leverans",
    cms: "Du redigerar tema, block eller kod",
  },
  {
    aspect: "Teknik",
    ai: "React, Next.js och TypeScript från start",
    agency: "Beror på byrån",
    cms: "Ofta ett CMS med tillägg och teman",
  },
  {
    aspect: "Kontroll",
    ai: "Du styr med text; kod går att exportera",
    agency: "Hög, men via någon annan",
    cms: "Hög om du kan verktyget",
  },
  {
    aspect: "Passar sämre när",
    ai: "Du behöver en stor, integrationstung sajt från dag ett",
    agency: "Du bara vill testa en enkel närvaro snabbt",
    cms: "Du inte vill lägga tid på verktyget",
  },
] as const;

const FAQS = [
  {
    q: "Kan AI skapa en hel hemsida?",
    a: "AI kan skapa en första version: struktur, layout och texter som en riktig sajt. Det är ett utkast att granska, inte ett löfte om att allt är klart för kunder samma sekund. Undersidor i första bygget är begränsade, och integrationer som betalning eller inloggning är demo tills du uttryckligen bygger dem.",
  },
  {
    q: "Behöver jag kunna koda?",
    a: "Nej. Du beskriver vad du behöver och ändrar med vanliga meningar. Under huven är det React och Next.js, så du kan ta över koden senare om du vill — men det krävs inte för att komma igång.",
  },
  {
    q: "Kan jag ändra sidan efteråt?",
    a: "Ja. Efter första versionen skickar du följdinstruktioner i buildern. Varje ny version går att öppna i preview innan du går vidare. Godkänn en plan när du blir ombedd; bygget startar inte av sig självt.",
  },
  {
    q: "Kan jag använda egen domän?",
    a: "Efter publicering finns ett flöde för att koppla en domän du redan äger. Kopplingen kan vara stängd i vissa miljöer, och köp av ny domän i appen är inte allmänt live. Utan egen domän får den publicerade sajten en Vercel-adress.",
  },
  {
    q: "Kan jag exportera sidan?",
    a: "Ja. Som inloggad ägare kan du ladda ner projektet som ZIP eller exportera till GitHub. Med följer den genererade koden, inte databasen, API-nycklar eller domänregistrering.",
  },
  {
    q: "Vad kostar det?",
    a: "Du kan börja utan kreditkort. Ett konto får en första slutförd generering utan coin-debitering. Därefter köper du credits i engångspaket — 49, 99 eller 179 kronor — utan prenumeration. Publicering debiterar credits. Aktuella paket finns på prissidan.",
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

function ExampleSitePreview() {
  return (
    <figure className="overflow-hidden rounded-[28px] border border-border/25 bg-card/60 shadow-[0_28px_80px_rgba(6,10,20,0.35)]">
      <div className="flex items-center gap-2 border-b border-border/20 px-4 py-3">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <p className="ml-2 truncate text-[11px] text-muted-foreground">
          Exempel · första version · Nordljus Frisör
        </p>
      </div>
      <div className="bg-[hsl(32_18%_10%)] px-5 py-6 md:px-7 md:py-8">
        <div className="mb-6 flex items-center justify-between gap-3 text-[11px] tracking-wide text-[hsl(32_20%_72%)] uppercase">
          <span className="font-medium">Nordljus</span>
          <span>Priser · Team · Boka</span>
        </div>
        <p className="text-[11px] font-medium tracking-[0.18em] text-[hsl(32_40%_62%)] uppercase">
          Majorna, Göteborg
        </p>
        <p className="mt-2 font-(--font-heading) text-2xl leading-tight text-[hsl(36_40%_94%)] md:text-3xl">
          Klippning och färg i ett lugnare tempo
        </p>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-[hsl(32_12%_70%)]">
          Tre frisörer, drop-in när det finns luckor, och bokning när du vill vara säker på tid.
        </p>
        <div className="mt-5 inline-flex rounded-full bg-[hsl(32_40%_62%)] px-4 py-2 text-xs font-medium text-[hsl(32_18%_10%)]">
          Boka tid
        </div>
        <div className="mt-8 grid grid-cols-3 gap-2">
          {["Klippning", "Färg", "Team"].map((label) => (
            <div
              key={label}
              className="rounded-2xl border border-[hsl(32_14%_22%)] bg-[hsl(32_16%_13%)] px-3 py-4"
            >
              <div className="mb-3 h-10 rounded-lg bg-[hsl(32_14%_20%)]" />
              <p className="text-[11px] text-[hsl(32_20%_78%)]">{label}</p>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="px-5 py-3 text-xs leading-relaxed text-muted-foreground">
        Illustrerat exempel utifrån en typisk brief — inte en livekundsajt och inte ett
        resultatlöfte.
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

export function SkapaHemsidaMedAiContent() {
  const entry = getSeoLandingEntry(SLUG);

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
              <Link href={entry.ctaHref}>Skapa hemsida med AI</Link>
            </Button>
          </div>
        </header>

        <main>
          <section className="px-6 pt-14 pb-10 md:pt-24 md:pb-16">
            <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div>
                <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                  Skapa hemsida med AI
                </p>
                <h1 className="text-balance font-(--font-heading) text-3xl leading-[1.1] tracking-tight text-foreground md:text-5xl">
                  {entry.plannedH1}
                </h1>
                <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
                  Du beskriver vad du behöver. Sajtmaskin tar fram ett första förslag — struktur,
                  layout och texter — som en riktig sajt du kan fortsätta arbeta med. AI:n gör
                  utkastet. Du avgör vad som är tillräckligt bra.
                </p>
                <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <CtaButton>Skapa hemsida med AI</CtaButton>
                  <Button
                    asChild
                    size="lg"
                    variant="ghost"
                    className="text-base text-muted-foreground hover:text-foreground"
                  >
                    <Link href="#processen">Se processen</Link>
                  </Button>
                </div>
              </div>
              <ExampleSitePreview />
            </div>
          </section>

          <section
            id="processen"
            className="border-t border-border/15 px-6 py-16 md:py-24"
          >
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Processen
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Från en mening till en första version
              </h2>
              <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
                Det är samma väg som i Sajtmaskin i dag: beskriv, bygg, titta, ändra. Preview under
                arbetet är en arbetsyta. Publicering är ett medvetet sista steg.
              </p>
              <ol className="mt-10 grid gap-3 md:grid-cols-5">
                {PROCESS_STEPS.map((step, index) => (
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
            <div className="mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-2">
              <div>
                <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                  Exempel på brief
                </p>
                <h2 className="text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                  Ju konkretare du är, desto bättre blir utkastet
                </h2>
                <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
                  En bra beskrivning nämner verksamhet, plats, vad sidan ska göra och vad den inte
                  ska låtsas ha. Så här kan en första prompt se ut:
                </p>
                <blockquote className="mt-6 rounded-2xl border border-border/40 bg-card/70 p-5 text-sm leading-relaxed text-foreground/90">
                  Jag driver Nordljus Frisör i Majorna, Göteborg. Vi är tre frisörer och tar både
                  drop-in och bokning. Jag vill ha en lugn, varm startsida med priser, team och en
                  tydlig väg att boka tid. Inga kundfoton än, och hitta inte på recensioner.
                </blockquote>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  Samma sorts mening går att skriva för en restaurang, en konsult eller en butik.
                  Det som saknas i briefen får AI:n antingen fråga efter eller fylla med tydliga
                  platshållare.
                </p>
              </div>
              <div className="rounded-2xl border border-border/40 bg-card/70 p-5 md:p-6">
                <h3 className="font-(--font-heading) text-lg text-foreground">
                  Vad ett bra utkast brukar innehålla
                </h3>
                <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  <li className="flex gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    En startsida som säger vem ni är på några sekunder
                  </li>
                  <li className="flex gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    Sektioner för erbjudande, bevis och nästa steg
                  </li>
                  <li className="flex gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    Undersidor bara där de faktiskt behövs
                  </li>
                  <li className="flex gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    Platshållare där fakta eller bilder saknas, i stället för påhitt
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Arbetsfördelning
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Vad AI gör — och vad du fortfarande behöver göra
              </h2>
              <div className="mt-10 grid gap-4 lg:grid-cols-2">
                <div className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                  <h3 className="font-(--font-heading) text-xl text-foreground">AI:n hjälper med</h3>
                  <div className="mt-6 space-y-5">
                    {AI_DOES.map((item) => (
                      <div key={item.title}>
                        <h4 className="text-sm font-medium text-foreground">{item.title}</h4>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          {item.body}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                  <h3 className="font-(--font-heading) text-xl text-foreground">
                    Du behöver fortfarande
                  </h3>
                  <div className="mt-6 space-y-5">
                    {HUMAN_STILL_DOES.map((item) => (
                      <div key={item.title}>
                        <h4 className="text-sm font-medium text-foreground">{item.title}</h4>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          {item.body}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Jämförelse
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                AI-hemsidebyggare eller traditionellt sätt?
              </h2>
              <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
                Inget arbetssätt vinner alltid. Sajtmaskin är stark när du vill se en första
                företagssida snabbt och sedan styra den med text. En byrå eller ett klassiskt CMS
                kan vara bättre när omfattningen, integrationerna eller redaktionen ser annorlunda
                ut.
              </p>
              <div className="mt-8 overflow-x-auto rounded-2xl border border-border/20">
                <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                  <caption className="sr-only">
                    Jämförelse mellan AI-hemsidebyggare, byrå och att bygga själv i ett CMS
                  </caption>
                  <thead className="bg-card/50 text-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Fråga
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        AI-hemsidebyggare
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Byrå
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Bygga själv i CMS
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    {COMPARISON_ROWS.map((row) => (
                      <tr key={row.aspect} className="border-t border-border/15">
                        <th scope="row" className="px-4 py-3 font-medium text-foreground">
                          {row.aspect}
                        </th>
                        <td className="px-4 py-3">{row.ai}</td>
                        <td className="px-4 py-3">{row.agency}</td>
                        <td className="px-4 py-3">{row.cms}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
              <p className="mt-6 text-sm text-muted-foreground">
                Mer om credits och paket finns på{" "}
                <Link href="/#priser" className="text-foreground underline-offset-4 hover:underline">
                  prissidan
                </Link>
                . Tekniken bakom sajterna finns på{" "}
                <Link href="/teknik" className="text-foreground underline-offset-4 hover:underline">
                  /teknik
                </Link>
                .
              </p>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-12">
            <div className="mx-auto max-w-6xl">
              <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                Relaterat
              </p>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                De här ämnena hör ihop med att skapa hemsida med AI. AI-kategorin, den
                teknikneutrala vägen och utan-kod-guiden ligger på egna sidor.
              </p>
              <ul className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
                {entry.relatedSlugs.map((slug) => (
                  <li key={slug}>
                    <RelatedLink slug={slug} />
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-20 md:py-28">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Testa med er egen beskrivning
              </h2>
              <p className="mx-auto mt-4 max-w-md text-pretty leading-relaxed text-muted-foreground">
                Öppna Sajtmaskin, skriv vad ni behöver och titta på första versionen. Ingen kod.
                Ingen prenumeration.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <CtaButton>Skapa hemsida med AI</CtaButton>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="text-base text-muted-foreground hover:text-foreground"
                >
                  <Link href="/faq">Vanliga frågor</Link>
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
