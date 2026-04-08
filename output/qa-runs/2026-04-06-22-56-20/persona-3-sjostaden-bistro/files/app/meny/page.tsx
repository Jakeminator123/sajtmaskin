import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import { AlertCircle, ArrowRight, Clock3, Leaf, Wine } from "lucide-react";

import { lunchMenu, menuCategories } from "@/lib/site-data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Meny — Sjöstaden Bistro i Malmö serverar modern skandinavisk mat med lokala råvaror",
  description:
    "Upptäck menyn på Sjöstaden Bistro i Malmö med förrätter, varmrätter, desserter och drycker. Lokala råvaror, tydlig allergeninfo och säsongens smaker.",
  keywords: [
    "meny Sjöstaden Bistro",
    "förrätter Malmö",
    "varmrätter Malmö",
    "desserter Malmö",
    "drycker Malmö",
    "allergeninformation restaurang",
  ],
  openGraph: {
    title:
      "Meny — Sjöstaden Bistro i Malmö serverar modern skandinavisk mat med lokala råvaror",
    description:
      "Se hela menyn på Sjöstaden Bistro med säsongens förrätter, varmrätter, desserter och drycker samt tydlig information om allergener.",
  },
};

export default function MenyPage() {
  return (
    <div className="flex flex-col bg-background">
      <section className="relative overflow-hidden py-16 sm:py-24 lg:py-28">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_top,_rgba(0,0,0,0.7),_transparent_55%)]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/35 via-background to-background" />
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8">
          <div className="max-w-3xl">
            <Badge className="rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-primary">
              Meny
            </Badge>
            <h1 className="mt-5 text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Säsongens smaker, tillagade med precision och serverade med lugn.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Vår meny bygger på lokala råvaror från Skåne och förändras när
              säsongen gör det. Här hittar du förrätter, varmrätter, desserter
              och drycker som är skapade för att fungera både var för sig och i
              en längre måltid.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <div className="rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
                Lunch vardagar från 11.30
              </div>
              <div className="rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
                Vegetariska alternativ varje dag
              </div>
              <div className="rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
                Fråga oss gärna om dryckesmatchning
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-border/70">
            <Image
              src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=900&h=760&fit=crop&q=80"
              alt="Elegant skandinavisk middagstallrik med säsongens råvaror"
              width={900}
              height={760}
              priority
              className="h-[420px] w-full object-cover sm:h-[520px]"
            />
          </div>
        </div>
      </section>

      <section className="bg-black/30 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 max-w-2xl">
            <h2 className="text-3xl font-semibold sm:text-4xl">Lunchfavoriter</h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Vardagslunchen hos oss ska kännas snabb nog för arbetsdagen men
              tillräckligt omsorgsfull för att ge en paus värd att minnas.
              Menyn skiftar vecka för vecka men följer samma tanke om kvalitet
              och balans.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {lunchMenu.map((item) => (
              <Card
                key={item.name}
                className="border-border/80 bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-2xl font-semibold">{item.name}</h3>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                      {item.price}
                    </span>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                  <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock3 className="h-4 w-4 text-primary" />
                    Serveras vardagar 11.30–14.30
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-black/20 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold sm:text-4xl">À la carte</h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              På kvällen bygger vi upplevelsen i flera lager, från små eleganta
              inledningar till fylliga huvudrätter och avslut med tydlig syra
              eller djup choklad. Våra kockar lagar rätterna med ett lugn som
              låter råvaran stå i centrum.
            </p>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            {menuCategories.map((category) => (
              <Card
                key={category.title}
                className="border-border/80 bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <CardContent className="p-6 sm:p-8">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-3xl font-semibold">{category.title}</h3>
                    {category.title === "Drycker" ? (
                      <Wine className="h-5 w-5 text-primary" />
                    ) : (
                      <Leaf className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {category.description}
                  </p>

                  <div className="mt-8 space-y-6">
                    {category.items.map((item) => (
                      <div
                        key={item.name}
                        className="border-b border-border/70 pb-6 last:border-b-0 last:pb-0"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <p className="max-w-[75%] text-lg font-medium">{item.name}</p>
                          <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                            {item.price}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {item.description}
                        </p>
                        {item.allergens ? (
                          <p className="mt-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">
                            Allergener: {item.allergens}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-black/30 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold sm:text-4xl">För catering och större sällskap</h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Vill du bjuda på samma känsla utanför restaurangen tar vi fram
              cateringupplägg för företag, privata middagar och kulturevenemang.
              Vi hjälper till med meny, portionsupplägg och leverans utifrån hur
              formellt eller avslappnat du vill att det ska kännas.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              För större sällskap i restaurangen kan vi också anpassa en gemensam
              meny med dryckesförslag. Hör av dig så planerar vi ett upplägg som
              passar både tillfälle och budget.
            </p>
            <Button asChild className="mt-8 rounded-full active:scale-95">
              <Link href="/kontakt">
                Fråga om catering
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-border/70">
            <Image
              src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=960&h=760&fit=crop&q=80"
              alt="Cateringupplägg med skandinaviska smårätter på ett elegant bord"
              width={960}
              height={760}
              className="h-[360px] w-full object-cover sm:h-[480px]"
            />
          </div>
        </div>
      </section>

      <section className="bg-black/20 py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <Card className="border-primary/20 bg-primary/10">
            <CardContent className="p-6 sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <AlertCircle className="mt-1 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <h2 className="text-2xl font-semibold">Allergeninformation</h2>
                  <p className="mt-3 text-base leading-7 text-muted-foreground">
                    Vi tar allergier och specialkost på största allvar. Informationen
                    i menyn ger en vägledning, men eftersom råvaror och upplägg
                    kan förändras ber vi dig alltid meddela personalen vid bokning
                    eller på plats om du har allergi, intolerans eller särskilda
                    önskemål.
                  </p>
                  <p className="mt-3 text-base leading-7 text-muted-foreground">
                    Vi gör vårt bästa för att anpassa måltiden, men kan inte
                    garantera en helt allergenfri miljö i köket. Kontakta oss gärna
                    i förväg så planerar vi ett tryggt alternativ tillsammans.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}