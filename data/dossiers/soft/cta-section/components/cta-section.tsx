export interface CtaAction {
  label: string;
  href: string;
}

interface CtaSectionProps {
  title: string;
  description?: string;
  primary: CtaAction;
  secondary?: CtaAction;
  className?: string;
}

export function CtaSection({
  title,
  description,
  primary,
  secondary,
  className,
}: CtaSectionProps) {
  return (
    <section className={className}>
      <div className="mx-auto flex max-w-2xl flex-col items-center rounded-2xl border border-border bg-card px-6 py-12 text-center text-card-foreground sm:px-12">
        <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">{title}</h2>
        {description && (
          <p className="mt-3 max-w-prose text-base text-muted-foreground">{description}</p>
        )}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href={primary.href}
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {primary.label}
          </a>
          {secondary && (
            <a
              href={secondary.href}
              className="inline-flex items-center justify-center rounded-md border border-border bg-background px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {secondary.label}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
