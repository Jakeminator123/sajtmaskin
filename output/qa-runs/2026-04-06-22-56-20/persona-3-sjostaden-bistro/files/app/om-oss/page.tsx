
import Link from "next/link";
import type { Metadata } from "next";


import { ArrowRight, HeartHandshake, Leaf, Sparkles } from "lucide-react"



import { siteConfig, teamMembers, values } from "@/lib/site-data";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Om oss — Sjöstaden Bistro i Malmö serverar modern skandinavisk mat med lokala råvaror",
  description:
    "Lär känna Sjöstaden Bistro i Malmö, vår historia, vårt team och hur vi arbetar med säsongens råvaror, omsorgsfull service och en varm kvällsatmosfär.",
  keywords: [
    "om Sjöstaden Bistro",
    "restaurang Malmö",
    "lokala råvaror Skåne",
    "skandinavisk bistro",
    "team restaurang Malmö",
  ],
  openGraph: {
    title:
      "Om oss — Sjöstaden Bistro i Malmö serverar modern skandinavisk mat med lokala råvaror",
    description:
      "Läs om historien bakom Sjöstaden Bistro, möt teamet och upptäck vårt sätt att arbeta med råvaror, service och säsong i Malmö.",
  },
};

const icons = [Leaf, Sparkles, HeartHandshake];

export default function OmOssPage() {
  return (
    <div className="flex flex-col">
      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8">
          <div className="max-w-3xl">
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.28em] text-primary">
              Om oss
            </p>
            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              En bistro där skånska råvaror möter kvällslugn, värme och precision.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Sjöstaden Bistro föddes ur tanken att skapa en restaurang i Malmö
              där det nordiska köket får ta plats utan att kännas stramt. Vi
              vill att varje besök ska kombinera hög kvalitet med ett naturligt
              värdskap, från första hälsning till sista kopp kaffe.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Det betyder säsongsanpassade menyer, nära relationer till lokala
              producenter och en matsal som är lika välkomnande för en vardagslunch
              som för en lång middag med vänner, kunder eller familj.
            </p>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-border/70">
            <Image
              src="/placeholder.svg?height=800&width=900&text=Mörk+elegant+restaurangmiljö+med+öppet+kök+skandinavisk+design+och+varma+ljus"
              alt="Mörk elegant restaurangmiljö med öppet kök och skandinavisk design"
              width={900}
              height={800}
              priority
              className="h-[420px] w-full object-cover sm:h-[520px]"
            />
          </div>
        </div>
      </section>

      <section className="bg-muted/25 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
          <div className="overflow-hidden rounded-[2rem] border border-border/70">
            <Image
              src="/placeholder.svg?height=760&width=900&text=Kock+som+arbetar+med+lokala+råvaror+i+skandinaviskt+kök+med+varm+belysning"
              alt="Kock som arbetar med lokala råvaror i ett varmt upplyst kök"
              width={900}
              height={760}
              className="h-[360px] w-full object-cover sm:h-[480px]"
            />
          </div>

          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold sm:text-4xl">Vår historia</h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              När vi öppnade Sjöstaden Bistro ville vi skapa ett rum där Malmö
              kunde möta det skandinaviska köket i en ny form. Istället för att
              bygga en meny på trender valde vi att utgå från platsen, årstiden
              och de producenter vi litar på allra mest.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Resultatet blev en bistro med tydlig identitet och ett lugnt tempo.
              Här finns plats för affärsluncher, födelsedagar, middagar för två
              och cateringuppdrag där samma omsorg följer med utanför restaurangen.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <Card className="border-border/80 bg-card">
                <CardContent className="p-5">
                  <p className="text-3xl font-semibold text-primary">Skåne</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Basen för våra råvaror och vår inspiration.
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border/80 bg-card">
                <CardContent className="p-5">
                  <p className="text-3xl font-semibold text-primary">Lunch</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Snabb men omsorgsfull servering mitt i veckan.
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border/80 bg-card">
                <CardContent className="p-5">
                  <p className="text-3xl font-semibold text-primary">Catering</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Flexibla upplägg för företag och privata tillfällen.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold sm:text-4xl">Teamet bakom upplevelsen</h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Köket, matsalen och drycken arbetar som en helhet hos oss. Det är
              samspelet mellan råvara, service och känsla i rummet som gör att
              en middag blir något mer än bara en måltid.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {teamMembers.map((member) => (
              <Card
                key={member.name}
                className="overflow-hidden border-border/80 bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <Image
                  src={member.image}
                  alt={member.alt}
                  width={400}
                  height={400}
                  className="h-72 w-full object-cover"
                />
                <CardContent className="p-6">
                  <h3 className="text-2xl font-semibold">{member.name}</h3>
                  <p className="mt-1 text-sm font-medium text-primary">
                    {member.role}
                  </p>
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">
                    {member.bio}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/25 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold sm:text-4xl">Värderingar och arbetssätt</h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Vi tror att kvalitet märks tydligast när den känns självklar. Därför
              bygger vi vårt arbete på ett fåtal principer som genomsyrar köket,
              matsalen och våra cateringuppdrag.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {values.map((value, index) => {
              const Icon = icons[index];

              return (
                <Card
                  key={value.title}
                  className="border-border/80 bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                >
                  <CardContent className="p-6">
                    <div className="mb-5 inline-flex rounded-full bg-primary/10 p-3 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-2xl font-semibold">{value.title}</h3>
                    <p className="mt-4 text-sm leading-6 text-muted-foreground">
                      {value.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold sm:text-4xl">
            Välkommen att uppleva {siteConfig.name}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Oavsett om du kommer för en snabb lunch eller en längre kväll i
            matsalen vill vi att upplevelsen ska kännas genomgående varm, tydlig
            och minnesvärd. Boka bord eller kontakta oss om du vill prata catering
            för nästa tillfälle.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <Button asChild size="lg" className="rounded-full active:scale-95">
              <Link href="/boka">
                Boka bord
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full active:scale-95"
            >
              <Link href="/kontakt">Kontakta oss</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}