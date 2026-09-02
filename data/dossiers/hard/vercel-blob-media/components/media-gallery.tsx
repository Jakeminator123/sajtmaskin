"use client";

import { useEffect, useState } from "react";

import { MediaConfigNotice } from "./media-config-notice";

/**
 * Wire shape returned by `/api/media`. Mirrors `MediaItem` in
 * `lib/media-storage/config.ts`; declared here so the client bundle needs no
 * import from the storage lib (and so the component mounts standalone).
 */
interface MediaItem {
  id: string;
  kind: "image" | "video";
  url: string;
  title: string;
  alt?: string;
  posterUrl?: string;
}

interface MediaGalleryProps {
  /** Sub-folder under `media/` to show; omit for the whole library. */
  folder?: string;
  /** Grid columns on desktop (mobile is always 1–2). */
  columns?: 2 | 3 | 4;
  /** Text shown when the library is connected but has no files yet. */
  emptyText?: string;
  className?: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; items: MediaItem[]; demo: boolean }
  | { kind: "error" };

const COLUMN_CLASS: Record<NonNullable<MediaGalleryProps["columns"]>, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

/**
 * Responsive grid of the site's own photos and videos, read from the media
 * library via `/api/media`. Heavy files (MP4, large photos) never live in the
 * repo — the storage CDN serves them. In demo mode the sample media renders
 * with an honest notice, so the design preview always looks finished.
 */
export function MediaGallery({
  folder,
  columns = 3,
  emptyText = "Inga bilder eller filmer har lagts upp ännu.",
  className,
}: MediaGalleryProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const query = folder ? `?folder=${encodeURIComponent(folder)}` : "";
    setState({ kind: "loading" });
    fetch(`/api/media${query}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          demo?: boolean;
          items?: MediaItem[];
        };
        if (cancelled) return;
        if (!res.ok || !body.ok || !Array.isArray(body.items)) {
          setState({ kind: "error" });
          return;
        }
        setState({ kind: "ready", items: body.items, demo: body.demo === true });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [folder, reloadKey]);

  if (state.kind === "loading") {
    return (
      <div className={className} aria-busy="true">
        <div className={`grid gap-4 ${COLUMN_CLASS[columns]}`}>
          {Array.from({ length: columns }).map((_, index) => (
            <div key={index} className="aspect-[3/2] animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className={className}>
        <p role="status" className="text-sm text-muted-foreground">
          Bilderna kunde inte hämtas just nu.{" "}
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
          >
            Försök igen
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      {state.demo && (
        <div className="mb-4">
          <MediaConfigNotice />
        </div>
      )}
      {state.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className={`grid gap-4 ${COLUMN_CLASS[columns]}`}>
          {state.items.map((item) => (
            <li
              key={item.id}
              className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground"
            >
              {item.kind === "video" ? (
                <video
                  controls
                  playsInline
                  preload="metadata"
                  poster={item.posterUrl}
                  className="aspect-video w-full bg-black object-cover"
                >
                  <source src={item.url} />
                  Din webbläsare kan inte spela upp filmen.
                </video>
              ) : (
                // Plain <img> on purpose — next/image would force the project to
                // allowlist the storage host in next.config.ts.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.url}
                  alt={item.alt ?? item.title}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[3/2] w-full object-cover"
                />
              )}
              <p className="px-3 py-2 text-sm font-medium">{item.title}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
