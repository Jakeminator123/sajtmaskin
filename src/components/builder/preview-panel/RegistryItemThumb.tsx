"use client";

import { useState } from "react";
import {
  CircleHelp,
  Columns3,
  ImageOff,
  LayoutPanelTop,
  ListTree,
  MessageSquareWarning,
  PanelsTopLeft,
  SlidersHorizontal,
  Table2,
  Type,
} from "lucide-react";
import type { ComponentPreviewKind } from "@/lib/builder/shadcn-component-metadata";

const PREVIEW_KIND_ICONS: Record<ComponentPreviewKind, typeof CircleHelp> = {
  inputs: SlidersHorizontal,
  forms: ListTree,
  overlay: PanelsTopLeft,
  navigation: Columns3,
  layout: LayoutPanelTop,
  feedback: MessageSquareWarning,
  data: Table2,
  table: Table2,
  typography: Type,
  other: CircleHelp,
};

const IMAGE_ERROR_LABEL = "Förhandsbilden kunde inte laddas";

const PREVIEW_KIND_LABELS: Record<ComponentPreviewKind, string> = {
  inputs: "Inmatning",
  forms: "Formulär",
  overlay: "Overlay",
  navigation: "Navigation",
  layout: "Layout",
  feedback: "Feedback",
  data: "Data",
  table: "Tabell",
  typography: "Typografi",
  other: "Övrig komponent",
};

/**
 * Thumbnail för registry-kort (Bläddra-galleriet + Beskriv-kandidater).
 *
 * Registry-PNG:erna ligger hos externa hosts (ui.shadcn.com m.fl.) och kan
 * saknas för enskilda poster — en trasig <img> lämnade tidigare en tom/bruten
 * bildyta i kortet ("tomma placeholderbilder"). En URL som inte går att ladda
 * visar därför alltid `ImageOff`, medan poster utan URL by design visar sin
 * registry-typ. Fallback-state är nycklat på src så en senare fungerande bild
 * (t.ex. annan post i detaljvyn) inte ärver felet.
 */
export function RegistryItemThumb({
  src,
  alt,
  fallbackLabel,
  previewKind,
  iconKey,
}: {
  src: string | null | undefined;
  alt: string;
  /**
   * Sätt för detaljvyns större yta; utelämnad = bara ikon. Texten gäller
   * posten utan bild-URL — ett misslyckat hämtningsförsök skriver sin egen.
   */
  fallbackLabel?: string;
  previewKind?: ComponentPreviewKind;
  iconKey?: ComponentPreviewKind;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;
  const hasImageLoadFailure = Boolean(src) && failedSrc === src;
  const kind = iconKey ?? previewKind ?? "other";
  const PreviewKindIcon = PREVIEW_KIND_ICONS[kind];
  const previewKindLabel = PREVIEW_KIND_LABELS[kind];

  if (showImage && src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-full w-full object-cover object-top"
        onError={() => setFailedSrc(src)}
      />
    );
  }

  if (hasImageLoadFailure) {
    return (
      <div
        className="flex flex-col items-center gap-1 text-amber-600/80"
        data-testid="registry-thumbnail-load-error"
        title={IMAGE_ERROR_LABEL}
      >
        <ImageOff className="h-6 w-6" aria-hidden />
        {fallbackLabel ? <span className="text-[10px]">{IMAGE_ERROR_LABEL}</span> : null}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center gap-1 text-zinc-600"
      data-testid={`registry-thumbnail-kind-${kind}`}
      title={previewKindLabel}
    >
      <PreviewKindIcon className="h-6 w-6" aria-hidden />
      {fallbackLabel ? <span className="text-[10px]">{fallbackLabel}</span> : null}
    </div>
  );
}
