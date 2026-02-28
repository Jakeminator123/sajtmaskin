"use client";

import { Blocks, Code2, ExternalLink, Loader2, RefreshCw, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ShadcnRegistryItem } from "@/lib/shadcn-registry-types";
import type { ComponentItem } from "@/lib/shadcn-registry-service";
import { buildPreviewImageUrl } from "@/lib/shadcn-registry-service";
import {
  buildRegistryMarkdownPreview,
  buildShadcnDocsUrl,
  buildShadcnPreviewUrl,
} from "@/lib/shadcn-registry-utils";

interface Props {
  selectedItem: ComponentItem | null;
  registryItem: ShadcnRegistryItem | null;
  isLoading: boolean;
  error: string | null;
  legacyAvailable: boolean | null;
  style: string;
  itemLabel: string;
  onReload: () => void;
}

export function UiElementPickerPreview({
  selectedItem,
  registryItem,
  isLoading,
  error,
  legacyAvailable,
  style,
  itemLabel,
  onReload,
}: Props) {
  const [showCode, setShowCode] = useState(false);
  const [lightFailed, setLightFailed] = useState(false);
  const [darkFailed, setDarkFailed] = useState(false);
  const [prevItemName, setPrevItemName] = useState(selectedItem?.name);

  if (selectedItem?.name !== prevItemName) {
    setPrevItemName(selectedItem?.name);
    setShowCode(false);
    setLightFailed(false);
    setDarkFailed(false);
  }

  const previewLink = useMemo(() => {
    if (!selectedItem) return null;
    return selectedItem.type === "block"
      ? buildShadcnPreviewUrl(selectedItem.name, style)
      : buildShadcnDocsUrl(selectedItem.name);
  }, [selectedItem, style]);

  const isBlock = selectedItem?.type === "block";
  const liveUrl = isBlock ? previewLink : null;

  if (!selectedItem) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <Blocks className="h-8 w-8 opacity-30" />
        <span className="text-sm">Välj ett {itemLabel} i listan</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-border/50 px-6 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-foreground">
            {selectedItem.title}
          </h3>
          {selectedItem.description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {selectedItem.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {previewLink && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[11px]"
              onClick={() => window.open(previewLink, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="h-3 w-3" />
              {isBlock ? "Preview" : "Docs"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className={`h-7 gap-1.5 text-[11px] ${showCode ? "bg-brand-teal/10 text-brand-teal border-brand-teal/30" : ""}`}
            onClick={() => setShowCode((v) => !v)}
          >
            <Code2 className="h-3 w-3" /> Kod
          </Button>
        </div>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-brand-teal/60" />
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100/80">
                <div className="font-medium text-amber-200">
                  Registry-item saknas eller är inkompatibel
                </div>
                <div className="mt-1 text-amber-100/70">{error}</div>
                {legacyAvailable === true && (
                  <div className="mt-2 text-amber-100/70">
                    Finns i legacy-registret (v3). Det kan saknas v4-styling.
                  </div>
                )}
                {legacyAvailable === false && (
                  <div className="mt-2 text-amber-100/60">
                    Hittas inte i legacy-registret heller.
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={onReload} className="mt-2 h-7">
                  <RefreshCw className="mr-1.5 h-3 w-3" /> Uppdatera katalogen
                </Button>
              </div>
            )}

            {registryItem?.registryDependencies?.length ? (
              <div className="mb-4 rounded-xl border border-border/50 bg-card/60 p-4">
                <div className="text-xs font-medium text-foreground">Dependencies</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {registryItem.registryDependencies.join(", ")}
                </div>
                <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-[11px] font-mono text-foreground/80">
                  npm i {registryItem.registryDependencies.join(" ")}
                </div>
              </div>
            ) : null}

            {isBlock ? (
              <div className="grid gap-4 md:grid-cols-2">
                <ThemePreviewCard
                  mode="light"
                  name={selectedItem.name}
                  title={selectedItem.title}
                  style={style}
                  failed={lightFailed}
                  onFail={() => setLightFailed(true)}
                />
                <ThemePreviewCard
                  mode="dark"
                  name={selectedItem.name}
                  title={selectedItem.title}
                  style={style}
                  failed={darkFailed}
                  onFail={() => setDarkFailed(true)}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-border/50 bg-muted/20 p-5 text-sm text-muted-foreground">
                Ingen preview för komponenter. Öppna docs för exempel och kod.
              </div>
            )}

            {isBlock && lightFailed && darkFailed && liveUrl && (
              <div className="mt-4 overflow-hidden rounded-xl border border-border/50 bg-card/70">
                <div className="border-b border-border/50 px-3 py-2 text-[11px] text-muted-foreground">
                  Live preview (fallback)
                </div>
                <iframe
                  src={liveUrl}
                  title={`${selectedItem.title} live preview`}
                  className="h-[420px] w-full border-0 bg-background"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}

            {showCode && registryItem && (
              <div className="mt-5 overflow-hidden rounded-xl border border-border/50 bg-card">
                <div className="border-b border-border/50 bg-muted/30 px-4 py-2">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Registry-kod (kortad)
                  </span>
                </div>
                <pre className="scrollbar-thin max-h-80 overflow-auto p-4 text-[11px] leading-relaxed whitespace-pre-wrap text-foreground/80">
                  {buildRegistryMarkdownPreview(registryItem, { style, maxLines: 120 })}
                </pre>
              </div>
            )}

            <div className="mt-5 flex items-start gap-3 rounded-xl border border-brand-teal/15 bg-brand-teal/5 p-4">
              <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-teal" />
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                <span className="font-medium text-brand-teal">Tips:</span> Du kan anpassa färger,
                text och bilder efter att du lagt till komponenten — beskriv bara vad du vill ändra
                i chatten!
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function ThemePreviewCard({
  mode,
  name,
  title,
  style,
  failed,
  onFail,
}: {
  mode: "light" | "dark";
  name: string;
  title: string;
  style: string;
  failed: boolean;
  onFail: () => void;
}) {
  const isLight = mode === "light";
  return (
    <div
      className={`overflow-hidden rounded-xl border border-border/50 shadow-sm ${isLight ? "bg-white" : "bg-gray-950"}`}
    >
      <div
        className={`flex items-center gap-1.5 border-b px-3 py-1.5 ${isLight ? "border-gray-100 bg-gray-50/80" : "border-gray-800 bg-gray-900/80"}`}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-2 w-2 rounded-full ${isLight ? "bg-gray-300" : "bg-gray-600"}`}
          />
        ))}
        <span
          className={`ml-2 text-[10px] font-medium ${isLight ? "text-gray-400" : "text-gray-500"}`}
        >
          {isLight ? "Ljust tema" : "Mörkt tema"}
        </span>
      </div>
      {failed ? (
        <div className="flex h-36 items-center justify-center text-xs text-muted-foreground">
          Ingen preview tillgänglig
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={buildPreviewImageUrl(name, mode, style)}
          alt={`${title} – ${isLight ? "ljust" : "mörkt"}`}
          className="w-full"
          loading="lazy"
          onError={onFail}
        />
      )}
    </div>
  );
}
