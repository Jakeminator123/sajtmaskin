import { ArrowRight, Building2, ShieldCheck, Users } from "lucide-react"
import Link from "next/link";






import { createPlaceholderSrc } from "@/lib/site-data";
import Image from "next/image";
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { createMetadata } from "@/lib/metadata";

export const metadata = createMetadata({
  title:
    "About — TechPartner AB erbjuder systemutveckling, molnlösningar och IT-säkerhet för företag i Stockholm",
  description:
    "Learn more about TechPartner AB, our background and how we help CTOs and IT managers build reliable, secure digital platforms.",
  keywords: [
    "about techpartner",
    "technology partner sweden",
    "system development team",
    "cloud and security experts",
    "IT consultancy stockholm",
  ],
});

const principles = [
  {
    icon: Users,
    title: "Close collaboration",
    text: "We work closely with leadership and technical teams to keep priorities aligned and decisions clear.",
  },
  {
    icon: ShieldCheck,
    title: "Security by default",
    text: "Security is part of architecture, development, and operations from day one, not an afterthought.",
  },
  {
    icon: Building2,
    title: "Long-term ownership",
    text: "We focus on solutions that remain maintainable, scalable, and useful long after initial delivery.",
  },
];

export default function OmPage() {
  return (
    <div className="flex flex-col">
      <section className="bg-gradient-to-b from-background via-background to-muted/50">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-24">
          <div className="flex flex-col justify-center space-y-6">
            <Badge variant="secondary" className="w-fit">
              About
            </Badge>
            <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              A technology partner built for business-critical delivery
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              TechPartner AB supports companies that need stronger structure in development, cloud operations, and security. We help leaders make confident technical decisions and teams execute them without unnecessary friction.
            </p>
          </div>

          <div className="relative overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-sm">
            <div className="relative aspect-[4/3]">
              <Image
                src={createPlaceholderSrc(
                  1200,
                  900,
                  "Scandinavian leadership team in strategic workshop",
                )}
                alt="Leadership team in a strategic workshop"
                fill
                priority
                sizes="(min-width: 1024px) 48vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="space-y-4">
            <Badge variant="outline">Our background</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Built from real delivery pressure
            </h2>
            <p className="text-lg leading-relaxed text-muted-foreground">
              We started with a simple goal: give growing companies access to senior technical capability without requiring a large in-house specialist organization from day one. Over time, that mission evolved into long-term partnerships where strategy and execution stay connected.
            </p>
            <p className="text-lg leading-relaxed text-muted-foreground">
              Today we support CTOs and IT managers through platform modernization, cloud transformations, and secure delivery practices. Our role changes based on need, but our approach remains the same: clear communication, practical recommendations, and accountable delivery.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-muted/50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <Badge variant="outline">How we work</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Principles that guide every engagement
            </h2>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              We keep delivery simple and transparent, especially in complex environments. These principles shape how we plan, communicate, and execute with every client team.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {principles.map((item) => (
              <Card key={item.title} className="border-border bg-card shadow-sm">
                <CardHeader className="space-y-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                    <item.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight">{item.title}</h3>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-16 sm:pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm sm:p-10 lg:p-12">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Want to discuss your current technical priorities?
                </h2>
                <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
                  Share your context and we will suggest practical next steps tailored to your goals, team setup, and timeline.
                </p>
              </div>
              <Link
                href="/contact"
                className="inline-flex items-center rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Contact us
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}