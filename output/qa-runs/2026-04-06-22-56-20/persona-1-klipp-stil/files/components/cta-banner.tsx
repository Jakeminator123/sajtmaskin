import Link from "next/link";

import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

type CtaBannerProps = {
  eyebrow?: string;
  title: string;
  description: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

export function CtaBanner({
  eyebrow,
  title,
  description,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: CtaBannerProps) {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-[2rem] bg-primary px-6 py-10 text-primary-foreground shadow-lg sm:px-10 sm:py-14 lg:px-14">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              {eyebrow ? (
                <p className="text-sm font-medium tracking-[0.2em] uppercase text-primary-foreground/80">
                  {eyebrow}
                </p>
              ) : null}
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {title}
              </h2>
              <p className="text-lg leading-relaxed text-primary-foreground/85">
                {description}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-background text-foreground transition-all duration-200 hover:scale-[1.02] hover:bg-background/90 active:scale-95"
              >
                <Link href={primaryHref}>
                  {primaryLabel}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>

              {secondaryHref && secondaryLabel ? (
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-primary-foreground/30 bg-transparent text-primary-foreground transition-all duration-200 hover:scale-[1.02] hover:bg-primary-foreground/10 active:scale-95"
                >
                  <Link href={secondaryHref}>{secondaryLabel}</Link>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default CtaBanner;
