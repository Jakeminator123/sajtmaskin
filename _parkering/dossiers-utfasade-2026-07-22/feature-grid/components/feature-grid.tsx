import type { ReactNode } from "react";

export interface FeatureItem {
  title: string;
  description: string;
  /** Optional visual: a Lucide icon, emoji, or inline SVG. */
  icon?: ReactNode;
}

interface FeatureGridProps {
  items: FeatureItem[];
  title?: string;
  description?: string;
  className?: string;
}

function gridColsForCount(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2";
  return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
}

export function FeatureGrid({ items, title, description, className }: FeatureGridProps) {
  return (
    <section className={className}>
      {(title || description) && (
        <header className="mx-auto mb-12 max-w-2xl text-center">
          {title && (
            <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">{title}</h2>
          )}
          {description && (
            <p className="mt-3 text-base text-muted-foreground">{description}</p>
          )}
        </header>
      )}
      <ul className={`grid gap-6 ${gridColsForCount(items.length)}`}>
        {items.map((item, idx) => (
          <li
            key={`${idx}-${item.title}`}
            className="rounded-xl border border-border bg-card p-6 text-card-foreground"
          >
            {item.icon && (
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {item.icon}
              </div>
            )}
            <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {item.description}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
