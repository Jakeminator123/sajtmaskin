import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button"




type HeroDetail = {
  label: string;
  value: string;
};

type PageHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  primaryAction: {
    label: string;
    href: string;
  };
  secondaryAction?: {
    label: string;
    href: string;
  };
  details: HeroDetail[];
  note: string;
  priority?: boolean;
};

export function PageHero({
  eyebrow,
  title,
  description,
  imageSrc,
  imageAlt,
  primaryAction,
  secondaryAction,
  details,
  note,
  priority = false,
}: PageHeroProps) {
  return (
    <section className="section-shell pb-16 pt-6 sm:pb-20 lg:pb-24">
      <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div className="space-y-8">
          <div className="space-y-5">
            <p className="text-sm uppercase tracking-[0.22em] text-accent">{eyebrow}</p>
            <h1 className="text-balance text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">{title}</h1>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">{description}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="rounded-full px-7">
              <Link href={primaryAction.href}>{primaryAction.label}</Link>
            </Button>
            {secondaryAction ? (
              <Button asChild variant="outline" size="lg" className="rounded-full px-7">
                <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
              </Button>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {details.map((detail) => (
              <div key={detail.label} className="paper-panel rounded-[1.5rem] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{detail.label}</p>
                <p className="mt-2 text-sm font-medium leading-6">{detail.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="paper-panel-strong warm-border overflow-hidden p-3">
          <div className="hero-image-mask relative aspect-[5/6] overflow-hidden rounded-[1.5rem] bg-muted sm:aspect-[6/5]">
            <Image
              src={imageSrc}
              alt={imageAlt}
              fill
              priority={priority}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
            <div className="absolute bottom-4 left-4 right-4 z-10 rounded-[1.5rem] border border-white/35 bg-background/88 p-5 backdrop-blur-sm">
              <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Salongskänsla</p>
              <p className="mt-2 max-w-md text-lg font-medium leading-7">{note}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default PageHero;
