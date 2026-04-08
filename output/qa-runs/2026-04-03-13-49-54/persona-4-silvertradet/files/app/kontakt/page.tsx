
import Link from "next/link";

import {
  Clock3,
  Facebook,
  Instagram,
  Mail,
  MapPin,
  Phone,
  Pin,
  Ruler,
  Sparkles,
  Gift,
} from "lucide-react";




import { ContactForm } from "@/components/contact-form";

import { contactDetails, socialLinks } from "@/lib/site-data";
import Image from "next/image";
import { createPageMetadata } from "@/lib/metadata";

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export const metadata = createPageMetadata({
  pageName: "Kontakt",
  description:
    "Kontakta Silverträdet för frågor om storlek, leverans, presentinslagning och skötsel. Vi svarar vanligtvis inom 1 arbetsdag och hjälper dig gärna.",
  path: "/kontakt",
});

const helpCards = [
  {
    title: "Storlekshjälp",
    description:
      "Osäker på ringstorlek eller längd på halsband? Beskriv vad du funderar på så guidar vi dig vidare.",
    icon: Ruler,
  },
  {
    title: "Presentinslagning",
    description:
      "Vi hjälper gärna till om du vill skicka en gåva direkt eller lägga till en hälsning till mottagaren.",
    icon: Gift,
  },
  {
    title: "Skötselråd",
    description:
      "Få tips om hur du rengör, förvarar och använder dina smycken för att de ska hålla sig fina länge.",
    icon: Sparkles,
  },
];

const socialIcons = {
  Instagram,
  Facebook,
  Pinterest: Pin,
};

export default function KontaktPage() {
  return (
    <div className="flex flex-col">
      <section className="border-b border-border/70 bg-gradient-to-b from-background to-muted/35 py-16 sm:py-24">
        <div className="section-shell grid gap-12 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <Badge variant="outline" className="rounded-full px-4 py-1.5">
              Kontakt
            </Badge>
            <h1 className="max-w-3xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
              Vi hjälper dig gärna före och efter ditt köp
            </h1>
            <div className="max-w-2xl space-y-4 text-lg leading-8 text-muted-foreground">
              <p>
                Har du frågor om storlek, leverans eller skötsel? Skriv till oss
                så återkommer vi vanligtvis inom 1 arbetsdag. Du kan också ringa
                om det är bråttom eller om du vill få snabb hjälp kring ett
                presentval.
              </p>
              <p>
                Eftersom vi är ett litet team får du alltid personlig kontakt.
                Det gör det lättare att hitta rätt smycke och tryggare att
                handla när du vill stämma av något innan du bestämmer dig.
              </p>
            </div>
          </div>

          <div className="silver-panel overflow-hidden p-3">
            <Image
              src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=900&h=1000&fit=crop&q=80"
              alt="Lugn bild på skrivbord med silverdetaljer och materialprov"
              width={900}
              height={1000}
              priority
              className="h-auto w-full rounded-[1.5rem] object-cover"
            />
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="section-shell grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
          <ContactForm />

          <aside className="space-y-6">
            <Card className="rounded-[1.5rem] border-border/70 bg-card/95 shadow-sm">
              <CardContent className="space-y-5 p-6">
                <h2 className="text-2xl font-semibold tracking-tight">
                  Direktkontakt
                </h2>
                <div className="space-y-4 text-sm text-muted-foreground">
                  <div className="flex items-start gap-3">
                    <Phone className="mt-0.5 h-4 w-4 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">Telefon</p>
                      <a
                        href={`tel:${contactDetails.phone.replace(/\s|-/g, "")}`}
                        className="transition-colors hover:text-foreground"
                      >
                        {contactDetails.phone}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Mail className="mt-0.5 h-4 w-4 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">E-post</p>
                      <a
                        href={`mailto:${contactDetails.email}`}
                        className="transition-colors hover:text-foreground"
                      >
                        {contactDetails.email}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">Adress</p>
                      <p>{contactDetails.address}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Clock3 className="mt-0.5 h-4 w-4 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">Öppettider</p>
                      <p>{contactDetails.hours}</p>
                    </div>
                  </div>
                </div>

                <Button asChild variant="outline" className="w-full rounded-full">
                  <Link href={contactDetails.mapLink} target="_blank" rel="noreferrer">
                    Öppna i Google Maps
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-[1.5rem] border-border/70 bg-muted/35 shadow-sm">
              <CardContent className="space-y-5 p-6">
                <h2 className="text-2xl font-semibold tracking-tight">
                  Följ oss i sociala medier
                </h2>
                <p className="text-sm leading-7 text-muted-foreground">
                  Följ oss för nya släpp, behind the scenes och skötselråd. Där
                  delar vi även detaljbilder från verkstaden och nya kombinationer
                  från kollektionerna.
                </p>

                <div className="flex flex-wrap gap-3">
                  {socialLinks.map((link) => {
                    const Icon = socialIcons[link.name as keyof typeof socialIcons];

                    return (
                      <Link
                        key={link.name}
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2 text-sm text-muted-foreground transition-all duration-200 hover:border-primary/20 hover:text-foreground"
                      >
                        <Icon className="h-4 w-4 text-primary" />
                        <span>{link.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </section>

      <section className="bg-muted/40 py-16 sm:py-24">
        <div className="section-shell grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="silver-panel overflow-hidden p-3">
            <Image
              src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1100&h=900&fit=crop&q=80"
              alt="Studiohörn med verktyg, ask och ljus textil"
              width={1100}
              height={900}
              className="h-auto w-full rounded-[1.5rem] object-cover"
            />
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <Badge variant="secondary" className="rounded-full px-4 py-1.5">
                Besöksadress och hjälp
              </Badge>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Från studiohörn i Göteborg till svar som känns personliga
              </h2>
              <p className="text-lg leading-8 text-muted-foreground">
                Du hittar oss på Storgatan 12 i Göteborg. Vi arbetar främst
                digitalt, men adressen gör det enkelt att hitta oss när du vill
                skicka något, planera ett besök eller bara känna att det finns
                riktiga människor bakom varje beställning.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {helpCards.map((item) => (
                <Card
                  key={item.title}
                  className="rounded-[1.4rem] border-border/70 bg-card/95 shadow-sm"
                >
                  <CardContent className="space-y-4 p-5">
                    <item.icon className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold tracking-tight">
                      {item.title}
                    </h3>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {item.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <p className="text-sm leading-7 text-muted-foreground">
              Om du redan vet vilket smycke du tittar på kan du gärna nämna det
              i meddelandet. Då kan vi svara mer konkret och hjälpa dig snabbare.
            </p>
          </div>
        </div>
      </section>

      <section className="pb-16 sm:pb-24">
        <div className="section-shell">
          <div className="overflow-hidden rounded-[2rem] bg-primary px-6 py-10 text-primary-foreground sm:px-10 sm:py-14">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Vill du fortsätta titta på sortimentet först?
                </h2>
                <p className="max-w-2xl text-lg leading-8 text-primary-foreground/80">
                  Utforska galleriet om du vill se fler bilder, eller gå vidare
                  till priserna om du redan vet ungefär vilken nivå du söker.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Button asChild size="lg" variant="secondary" className="rounded-full">
                  <Link href="/galleri">Se galleriet</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-primary-foreground/20 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                >
                  <Link href="/priser">Se priser och paket</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}