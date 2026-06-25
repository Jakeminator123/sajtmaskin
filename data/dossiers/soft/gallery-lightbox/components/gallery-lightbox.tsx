"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface GalleryImage {
  src: string;
  alt: string;
  caption?: string;
}

interface GalleryLightboxProps {
  items: GalleryImage[];
  title?: string;
  className?: string;
}

export function GalleryLightbox({ items, title, className }: GalleryLightboxProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const isOpen = openIndex !== null;

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // The thumbnail that opened the lightbox, so focus can return to it on close.
  const openerRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => setOpenIndex(null), []);
  const step = useCallback(
    (dir: 1 | -1) => {
      setOpenIndex((cur) =>
        cur === null ? cur : (cur + dir + items.length) % items.length,
      );
    },
    [items.length],
  );

  // Lifecycle: lock body scroll, move focus into the dialog on open, and
  // restore focus to the opener on close. Keyed on `isOpen` only, so changing
  // the image set while the lightbox stays open does not re-run this and yank
  // focus around.
  useEffect(() => {
    if (!isOpen) return;
    const opener = openerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [isOpen]);

  // Keyboard: Escape closes, arrows navigate, Tab is trapped within the dialog
  // so focus cannot reach the thumbnail grid behind the overlay. Re-binds when
  // close/step identity changes; its cleanup only detaches the listener and
  // never disturbs focus.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key === "ArrowRight") {
        step(1);
        return;
      }
      if (event.key === "ArrowLeft") {
        step(-1);
        return;
      }
      if (event.key === "Tab") {
        const root = dialogRef.current;
        if (!root) return;
        const focusable = Array.from(
          root.querySelectorAll<HTMLElement>("button:not([disabled])"),
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const active = document.activeElement;
        if (event.shiftKey) {
          if (active === first || !root.contains(active)) {
            event.preventDefault();
            last.focus();
          }
        } else if (active === last || !root.contains(active)) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, close, step]);

  const current = openIndex === null ? null : (items[openIndex] ?? null);

  return (
    <section className={className}>
      {title && (
        <h2 className="mb-8 text-2xl font-semibold text-foreground sm:text-3xl">{title}</h2>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item, idx) => (
          <li key={`${idx}-${item.src}`}>
            <button
              type="button"
              onClick={(event) => {
                openerRef.current = event.currentTarget;
                setOpenIndex(idx);
              }}
              aria-label={`Open image: ${item.alt}`}
              className="group block w-full overflow-hidden rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {/* Plain <img> on purpose — next/image would force the project to
                  allowlist each remote host in next.config.ts. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.src}
                alt={item.alt}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </button>
          </li>
        ))}
      </ul>

      {isOpen && current && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={current.caption ?? current.alt}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <div className="relative max-h-full max-w-4xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.src}
              alt={current.alt}
              className="max-h-[80vh] max-w-[calc(100vw-2rem)] w-auto rounded-lg object-contain"
            />
            {current.caption && (
              <p className="mt-3 text-center text-sm text-white/80">{current.caption}</p>
            )}

            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label="Close"
              className="absolute -right-3 -top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-background text-foreground shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden="true" className="text-lg leading-none">
                &times;
              </span>
            </button>

            {items.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label="Previous image"
                  className="absolute left-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span aria-hidden="true" className="text-xl leading-none">
                    &#8249;
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label="Next image"
                  className="absolute right-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span aria-hidden="true" className="text-xl leading-none">
                    &#8250;
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
