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

const SLUG = "hemsida-till-foretag" as const;

const LEAD_STEPS = [
  {
    title: "Förstå erbjudandet",
    body: "Besökaren ska på några sekunder veta vad ni gör, för vem och varför det spelar roll. Inte vad verktyget heter.",
  },
  {
    title: "Se bevis",
    body: "Jobb, kunder, omdömen eller siffror ni står för. Tomma stockfoton och påhittade recensioner sänker förtroendet.",
  },
  {
    title: "En tydlig CTA",
    body: "“Boka genomgång”, “Få offert” eller “Ring oss” slår ett generiskt “Kontakta”. Ett primärt nästa steg räcker.",
  },
  {
    title: "Kort förfrågan",
    body: "Fråga bara det ni behöver för att svara. Långa formulär tappar folk som redan är redo att höra av sig.",
  },
  {
    title: "Svara snabbt",
    body: "Bekräfta att ni sett förfrågan. Det är ert ansvar — Sajtmaskin skickar inte automatiskt bekräftelsemejl åt kundsajten.",
  },
] as const;

const BLUEPRINT = [
  "Hero med erbjudande och ett konkret nästa steg",
  "Erbjudande / tjänster utan jargong",
  "Bevis ni faktiskt får visa",
  "Så funkar det att anlita er",
  "Om företaget — människor, inte bara en logotyp",
  "Kontakt eller förfrågan",
  "FAQ med invändningar ni redan hör i sälj",
] as const;

const OUTCOMES = [
  {
    title: "Fler rätt förfrågningar",
    body: "Sidan filtrerar: den som inte är er kund ska förstå det innan hen fyller i formuläret.",
  },
  {
    title: "Kortare säljstart",
    body: "När erbjudandet och nästa steg är tydliga behöver ni inte förklara grunderna i varje samtal.",
  },
  {
    title: "Mindre tvekan på mobil",
    body: "Stora knappar, ringbart nummer och samma budskap som på desktop. De flesta öppnar sidan i telefon.",
  },
] as const;

const SITE_MAP = [
  { path: "/", role: "Vem ni är och vad besökaren ska göra" },
  { path: "/tjanster", role: "Erbjudandet i klartext" },
  { path: "/om-oss", role: "Människor bakom företaget" },
  { path: "/case", role: "Bevis — bara om ni har riktiga exempel" },
  { path: "/kontakt", role: "Förfrågan, telefon, område" },
] as const;

const PREP = [
  "En pitch-mening ni kan säga högt utan att skämmas",
  "Ett primärt nästa steg ni faktiskt svarar på",
  "Två eller tre bevis ni får använda",
  "Kort teaminfo och en bild som ser ut som er",
  "Invändningar ni redan möter i sälj",
  "Ett mobiltest innan sidan går live",
] as const;

const MISTAKES = [
  "Teknik och mall före nytta — besökaren köper inte ert CMS",
  "Dold kontakt eller fem konkurrerande knappar",
  "Stockfoton och recensioner ni inte kan stå för",
  "AI-utkast som publiceras utan faktakoll av priser, namn och öppettider",
  "Löften om pris, domän eller export som produkten inte håller",
] as const;

const FAQS = [
  {
    q: "Räcker en one-pager för ett företag?",
    a: "Ja, i början. Startsida med erbjudande, bevis och kontakt räcker långt. Lägg till undersidor när innehållet faktiskt finns — hellre fem tydliga sidor än femton halvtomma.",
  },
  {
    q: "Måste vi blogga för att sidan ska fungera?",
    a: "Nej. Blogga när ni har något att säga, inte som plikt. En tydlig företagssida med kontaktväg är viktigare än en tom blogg.",
  },
  {
    q: "Behöver vi en sida per ort?",
    a: "Bara om ni faktiskt finns där och kan skriva något sant. Tunna stad×tjänst-sidor sänker förtroendet. Skriv område och upptagningsområde på riktigt, inte som sökspam.",
  },
  {
    q: "Kan vi bygga företagssidan utan kod?",
    a: "Ja. I Sajtmaskin beskriver ni verksamheten och granskar utkastet. Kod ger mer kontroll senare, men krävs inte för en första förtroendesida.",
  },
  {
    q: "När är byrå bättre?",
    a: "När varumärket, integrationerna eller tidsbristen är större än att granska ett utkast själva. Om ni börjar i Sajtmaskin kan ni som ägare exportera koden som ZIP eller till GitHub — inte databasen, nycklar eller domän.",
  },
  {
    q: "Vad kostar en företagssida?",
    a: "Bygget är bara en del. Underhåll, hosting och hur ofta ni ändrar styr mer än ett enda belopp. I Sajtmaskin betalar du credits som engångsköp, utan prenumeration. Publicering debiterar credits. Aktuella paket finns på prissidan — räkna inte med ett fast företagspris här.",
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

function CompanySitePreview() {
  return (
    <figure className="overflow-hidden rounded-[28px] border border-border/25 bg-card/60 shadow-[0_28px_80px_rgba(6,10,20,0.35)]">
      <div className="flex items-center gap-2 border-b border-border/20 px-4 py-3">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <p className="ml-2 truncate text-[11px] text-muted-foreground">
          Exempel · företagssida · inte en livekund
        </p>
      </div>
      <div className="space-y-3 px-5 py-6 md:px-7 md:py-8">
        <p className="text-[11px] font-medium tracking-[0.18em] text-primary uppercase">
          Vad besökaren ska se
        </p>
        <div className="rounded-2xl border border-border/40 bg-background/40 px-4 py-3">
          <p className="text-sm font-medium text-foreground">Hero + offert</p>
          <p className="mt-1 text-xs text-muted-foreground">Vem ni är, och ett konkret nästa steg</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {["Bevis", "Så funkar det", "Kontakt"].map((label) => (
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
        Illustrerad ritning — inte en livekundsajt och inte ett resultatlöfte om fler leads.
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

export function HemsidaTillForetagContent() {
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
              <Link href={entry.ctaHref}>Bygg er företagssida</Link>
            </Button>
          </div>
        </header>

        <main>
          <section className="px-6 pt-14 pb-10 md:pt-24 md:pb-16">
            <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div>
                <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                  Hemsida till företag
                </p>
                <h1 className="text-balance font-(--font-heading) text-3xl leading-[1.1] tracking-tight text-foreground md:text-5xl">
                  {entry.plannedH1}
                </h1>
                <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
                  En företagssida ska visa att ni är seriösa och göra det enkelt att ta kontakt.
                  Designen spelar roll — men bevis, tydligt erbjudande och ett konkret nästa steg
                  spelar mer.
                </p>
                <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <CtaButton>Bygg er företagssida</CtaButton>
                  <Button
                    asChild
                    size="lg"
                    variant="ghost"
                    className="text-base text-muted-foreground hover:text-foreground"
                  >
                    <Link href="/skapa-hemsida-med-ai">Från beskrivning till första utkast</Link>
                  </Button>
                </div>
              </div>
              <CompanySitePreview />
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Lead-väg
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Från första intryck till en förfrågan ni kan svara på
              </h2>
              <ol className="mt-10 grid gap-3 md:grid-cols-5">
                {LEAD_STEPS.map((step, index) => (
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

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto grid max-w-6xl items-start gap-4 lg:grid-cols-2">
              <div className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <h2 className="font-(--font-heading) text-xl text-foreground md:text-2xl">
                  Sektionsritning
                </h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {BLUEPRINT.map((item) => (
                    <li key={item} className="flex gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <h2 className="font-(--font-heading) text-xl text-foreground md:text-2xl">
                  Exempelstruktur
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Hellre fem tydliga sidor än femton halvtomma. I första bygget i Sajtmaskin är
                  taket tre sidor — börja med startsida och de undersidor som faktiskt bär
                  erbjudandet.
                </p>
                <ul className="mt-5 space-y-3 text-sm">
                  {SITE_MAP.map((item) => (
                    <li key={item.path} className="flex gap-3">
                      <code className="shrink-0 text-foreground">{item.path}</code>
                      <span className="text-muted-foreground">{item.role}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto max-w-6xl">
              <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
                Affärsresultat
              </p>
              <h2 className="max-w-2xl text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Mät förfrågningar, inte bara trafik
              </h2>
              <div className="mt-10 grid gap-4 md:grid-cols-3">
                {OUTCOMES.map((item) => (
                  <article
                    key={item.title}
                    className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8"
                  >
                    <h3 className="font-(--font-heading) text-xl text-foreground">{item.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="border-t border-border/15 px-6 py-16 md:py-24">
            <div className="mx-auto grid max-w-6xl items-start gap-4 lg:grid-cols-2">
              <div className="rounded-[28px] border border-border/40 bg-card/70 p-6 md:p-8">
                <h2 className="font-(--font-heading) text-xl text-foreground md:text-2xl">
                  Förberedelse-checklista
                </h2>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {PREP.map((item) => (
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
                Mobil och kostnad
              </p>
              <h2 className="text-balance font-(--font-heading) text-2xl tracking-tight text-foreground md:text-4xl">
                Samma budskap i telefon, utan hittepå-ortssidor
              </h2>
              <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
                En företagssida som bara fungerar på bred skärm förlorar förfrågningar. Håll
                hero-budskapet, gör knappar stora och nummer ringbara. Lokal ärlighet — område ni
                faktiskt täcker — slår tunna stadssidor.
              </p>
              <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
                Kostnaden är bygge plus underhåll. Preview under arbetet är inte en publicerad sajt.
                Utan egen domän får den publicerade sidan en Vercel-adress; koppling av en domän ni
                redan äger kan vara stängd i vissa miljöer. Aktuella Sajtmaskin-paket finns på{" "}
                <Link href="/#priser" className="text-foreground underline-offset-4 hover:underline">
                  prissidan
                </Link>
                .
              </p>
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
                  Den här sidan handlar om affärsnyttan. Den teknikneutrala vägen från idé till
                  hemsida, kostnad och utan-kod ligger på egna sidor.
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
                Bygg en sida som får fler att höra av sig
              </h2>
              <p className="mx-auto mt-4 max-w-md text-pretty leading-relaxed text-muted-foreground">
                Beskriv företaget i byggaren. Titta på utkastet, rätta bevisen och publicera först
                när nästa steg är tydligt.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <CtaButton>Bygg er företagssida</CtaButton>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="text-base text-muted-foreground hover:text-foreground"
                >
                  <Link href="/skapa-hemsida-med-ai">Från beskrivning till första utkast</Link>
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
