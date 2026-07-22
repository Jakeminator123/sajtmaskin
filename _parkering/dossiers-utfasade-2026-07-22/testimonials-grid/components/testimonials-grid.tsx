"use client";

import { useMemo } from "react";

export interface Testimonial {
  quote: string;
  author: string;
  role?: string;
  company?: string;
  avatarUrl?: string;
}

interface TestimonialsGridProps {
  items: Testimonial[];
  title?: string;
  description?: string;
  className?: string;
}

const INITIALS_PALETTE = [
  "bg-primary/15 text-primary",
  "bg-secondary text-secondary-foreground",
  "bg-accent text-accent-foreground",
  "bg-muted text-foreground",
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function TestimonialsGrid({
  items,
  title,
  description,
  className,
}: TestimonialsGridProps) {
  const gridCols = useMemo(() => {
    if (items.length <= 1) return "grid-cols-1";
    if (items.length === 2) return "grid-cols-1 md:grid-cols-2";
    return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
  }, [items.length]);

  return (
    <section className={className}>
      {(title || description) && (
        <header className="mb-10 max-w-2xl">
          {title && <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">{title}</h2>}
          {description && (
            <p className="mt-2 text-base text-muted-foreground">{description}</p>
          )}
        </header>
      )}
      <ul className={`grid gap-6 ${gridCols}`}>
        {items.map((item, idx) => {
          const initials = getInitials(item.author);
          const palette = INITIALS_PALETTE[idx % INITIALS_PALETTE.length]!;
          return (
            <li
              key={`${idx}-${item.author}`}
              className="flex h-full flex-col rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm"
            >
              <blockquote className="flex-1 text-base leading-relaxed text-foreground">
                <span aria-hidden="true" className="mr-1 text-muted-foreground">&ldquo;</span>
                {item.quote}
                <span aria-hidden="true" className="ml-1 text-muted-foreground">&rdquo;</span>
              </blockquote>
              <footer className="mt-6 flex items-center gap-3">
                {item.avatarUrl ? (
                  // Plain <img> keeps the dossier scaffold-agnostic — using
                  // next/image would require the consuming project to add
                  // the avatar host to next.config.ts `images.remotePatterns`,
                  // which dossiers should not assume. Swap to next/image
                  // when integrating if the scaffold already permits the host.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.avatarUrl}
                    alt=""
                    loading="lazy"
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${palette}`}
                  >
                    {initials}
                  </span>
                )}
                <div className="text-sm">
                  <p className="font-medium text-foreground">{item.author}</p>
                  {(item.role || item.company) && (
                    <p className="text-muted-foreground">
                      {[item.role, item.company].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
              </footer>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
