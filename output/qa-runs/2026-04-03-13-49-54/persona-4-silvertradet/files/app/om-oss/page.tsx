
import Link from "next/link";

import { ArrowRight, HeartHandshake, Leaf, ShieldCheck } from "lucide-react"





import { teamMembers, workValues } from "@/lib/site-data";
import Image from "next/image";
import { createPageMetadata } from "@/lib/metadata";
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export const metadata = createPageMetadata({
  pageName: "Om oss",
  description:
    "Lär känna Silverträdet i Göteborg – en liten smyckesstudio som skapar handgjorda silversmycken i små serier med fokus på kvalitet, form och personlig service.",
  path: "/om-oss",
});

const values = [
  {
    title: "Kvalitet före kvantitet",
    description:
      "Vi gör små serier och lägger tid på proportioner, ytor och känslan i varje detalj. Det betyder färre, men mer genomarbetade smycken.",
    icon: ShieldCheck,
  },
  {
    title: "Personligt nära",
    description:
      "Eftersom vi är ett litet team får du alltid mänsklig kontakt och snabb återkoppling. Det gör stor skillnad när du ska välja storlek eller present.",
    icon: HeartHandshake,
  },
  {
    title: "Form som håller länge",
    description:
      "Vi söker ett lugnt uttryck som inte känns trendbundet. Smycken ska gå att bära om och om igen, år efter år.",
    icon: Leaf,
  },
];

export default function OmOssPage() {
  return (
    <div className="flex flex-col">
      <section className="border-b border-border/70 bg-gradient-to-b from-background to-muted/35 py-16 sm:py-24">
        <div className="section-shell grid gap-12 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <Badge variant="outline" className="rounded-full px-4 py-1.5">
              Om Silverträdet
            </Badge>
            <h1 className="max-w-3xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
              Smycken skapade i lugnt tempo, med handen nära materialet
            </h1>
            <div className="max-w-2xl space-y-4 text-lg leading-8 text-muted-foreground">
              <p>
                Silverträdet startade ur kärleken till enkel formgivning och det
                taktila hantverket i metall. Vi gör smycken som är lätta att
                bära, lätta att älska och skapade för att följa dig länge.
              </p>
              <p>
                Vårt fokus är kvalitet före kvantitet – små serier, noggranna
                detaljer och tidlös estetik. Varje modell ska kännas självklar i
                uttrycket och trygg i användningen, oavsett om den bärs till
                vardag eller fest.
              </p>
            </div>
          </div>

          <div className="silver-panel overflow-hidden p-3">
            <Image
              src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=900&h=1000&fit=crop&q=80"
              alt="Diskret porträtt i naturligt ljus i smyckesstudio"
              width={900}
              height={1000}
              priority
              className="h-auto w-full rounded-[1.5rem] object-cover"
            />
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="section-shell grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="silver-panel overflow-hidden p-3">
            <Image
              src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=900&h=1000&fit=crop&q=80"
              alt="Silververktyg och polering på arbetsbänk"
              width={900}
              height={1000}
              className="h-auto w-full rounded-[1.5rem] object-cover"
            />
          </div>

          <div className="space-y-6">
            <Badge variant="secondary" className="rounded-full px-4 py-1.5">
              Vår historia
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Från en liten verkstad i Göteborg till en egen kollektion
            </h2>
            <div className="max-w-3xl space-y-4 text-lg leading-8 text-muted-foreground">
              <p>
                Idén till Silverträdet föddes i en liten verkstad i Göteborg,
                där vi började med ringar i klassiska former och gradvis byggde
                kollektioner runt samma rena uttryck. Det var aldrig ambitionen
                att göra mest, utan att göra rätt – med tydlig form och bra
                känsla i handen.
              </p>
              <p>
                Vi arbetar i 925 sterling silver och finishar varje yta för hand
                för att få rätt lyster och rätt motstånd i materialet. Målet är
                att skapa smycken som fungerar både till vardag och fest, utan
                att någonsin kännas överarbetade.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/40 py-16 sm:py-24">
        <div className="section-shell">
          <div className="max-w-3xl space-y-4">
            <Badge variant="secondary" className="rounded-full px-4 py-1.5">
              Teamet
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Ett litet team som gör skillnad i varje beställning
            </h2>
            <p className="text-lg leading-8 text-muted-foreground">
              Vi är få personer bakom Silverträdet, och det är en styrka. Det
              gör att du får personlig hjälp, snabb återkoppling och ett
              smycke som passerar genom samma omsorg hela vägen från verkstad
              till ask.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {teamMembers.map((member) => (
              <Card
                key={member.name}
                className="overflow-hidden rounded-[1.5rem] border-border/70 bg-card/95 shadow-sm"
              >
                <div className="grid gap-0 md:grid-cols-[0.9fr_1.1fr]">
                  <Image
                    src={member.image}
                    alt={member.alt}
                    width={640}
                    height={760}
                    className="h-full w-full object-cover"
                  />
                  <CardContent className="flex flex-col justify-center space-y-4 p-6">
                    <div>
                      <h3 className="text-2xl font-semibold tracking-tight">
                        {member.name}
                      </h3>
                      <p className="mt-1 text-sm font-medium text-muted-foreground">
                        {member.role}
                      </p>
                    </div>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {member.bio}
                    </p>
                  </CardContent>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="section-shell">
          <div className="max-w-3xl space-y-4">
            <Badge variant="secondary" className="rounded-full px-4 py-1.5">
              Så arbetar vi
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Värderingar som märks i både form och service
            </h2>
            <p className="text-lg leading-8 text-muted-foreground">
              Vårt arbetssätt bygger på samma idé som designen: tydlighet,
              omtanke och lång livslängd. När processen är lugn och genomtänkt
              blir också upplevelsen tryggare för dig som kund.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {workValues.map((value) => (
              <Card
                key={value.title}
                className="rounded-[1.5rem] border-border/70 bg-card/95 shadow-sm"
              >
                <CardContent className="space-y-4 p-6">
                  <h3 className="text-xl font-semibold tracking-tight">
                    {value.title}
                  </h3>
                  <p className="text-sm leading-7 text-muted-foreground">
                    {value.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {values.map((item) => (
              <Card
                key={item.title}
                className="rounded-[1.5rem] border-border/70 bg-muted/35 shadow-sm"
              >
                <CardContent className="space-y-4 p-6">
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
        </div>
      </section>

      <section className="pb-16 sm:pb-24">
        <div className="section-shell">
          <div className="overflow-hidden rounded-[2rem] bg-primary px-6 py-10 text-primary-foreground sm:px-10 sm:py-14">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Redo att hitta ett smycke som känns rätt från början?
                </h2>
                <p className="max-w-2xl text-lg leading-8 text-primary-foreground/80">
                  Utforska galleriet om du vill se fler modeller, eller hör av
                  dig direkt om du vill ha hjälp med storlek, present eller
                  matchande kombinationer.
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
                  <Link href="/kontakt">
                    Kontakta oss
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}