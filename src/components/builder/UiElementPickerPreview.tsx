"use client";

import { Blocks, Code2, ExternalLink, Loader2, RefreshCw, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ShadcnRegistryItem } from "@/lib/shadcn-registry-types";
import type { ComponentItem } from "@/lib/shadcn-registry-service";
import { buildPreviewImageUrl } from "@/lib/shadcn-registry-service";
import {
  getShadcnComponentCategoryLabelSv,
  type ComponentPreviewKind,
} from "@/lib/builder/shadcn-component-metadata";
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
  const [previewTheme, setPreviewTheme] = useState<"light" | "dark">("light");
  const [lightFailed, setLightFailed] = useState(false);
  const [darkFailed, setDarkFailed] = useState(false);
  const [prevItemName, setPrevItemName] = useState(selectedItem?.name);

  if (selectedItem?.name !== prevItemName) {
    setPrevItemName(selectedItem?.name);
    setShowCode(false);
    setPreviewTheme("light");
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
  const currentThemeFailed = previewTheme === "light" ? lightFailed : darkFailed;

  if (!selectedItem) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <Blocks className="size-8 opacity-30" />
        <span className="text-sm">Välj ett {itemLabel} i listan</span>
      </div>
    );
  }

  const componentKind = (selectedItem.previewKind || selectedItem.iconKey || "other") as ComponentPreviewKind;
  const componentMeta = COMPONENT_DETAIL_META[componentKind] || COMPONENT_DETAIL_META.other;
  const componentCategorySv = getShadcnComponentCategoryLabelSv(selectedItem.category);
  const componentDependencies = registryItem?.registryDependencies ?? [];
  const componentUsageHint =
    selectedItem.usageHint ||
    "Använd komponenten som bas och be AI justera färger, spacing och innehåll efter din design.";

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
          {isBlock && (
            <div className="flex rounded-md border border-border bg-muted/30 p-0.5">
              {(["light", "dark"] as const).map((theme) => (
                <button
                  key={theme}
                  type="button"
                  onClick={() => setPreviewTheme(theme)}
                  className={`rounded-sm px-2.5 py-1 text-[11px] font-medium transition-all ${
                    previewTheme === theme
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {theme === "light" ? "Ljust" : "Mörkt"}
                </button>
              ))}
            </div>
          )}
          {previewLink && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[11px]"
              onClick={() => window.open(previewLink, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="size-3" />
              {isBlock ? "Preview" : "Docs"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className={`h-7 gap-1.5 text-[11px] ${showCode ? "bg-brand-teal/10 text-brand-teal border-brand-teal/30" : ""}`}
            onClick={() => setShowCode((v) => !v)}
          >
            <Code2 className="size-3" /> Kod
          </Button>
        </div>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-6 animate-spin text-brand-teal/60" />
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
                  <RefreshCw className="mr-1.5 size-3" /> Uppdatera katalogen
                </Button>
              </div>
            )}

            {isBlock && registryItem?.registryDependencies?.length ? (
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
              <ThemePreviewCard
                mode={previewTheme}
                name={selectedItem.name}
                title={selectedItem.title}
                style={style}
                failed={currentThemeFailed}
                onFail={() => previewTheme === "light" ? setLightFailed(true) : setDarkFailed(true)}
              />
            ) : (
              <div className="rounded-xl border border-border/50 bg-muted/20 p-5">
                <div className="flex items-center gap-3">
                  <div className={`flex size-10 items-center justify-center rounded-lg ${componentMeta.iconClass}`}>
                    <span className="text-base leading-none">{componentMeta.emoji}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-foreground">{selectedItem.title}</div>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${componentMeta.badgeClass}`}>
                        {componentMeta.label}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">Kategori: {componentCategorySv}</div>
                  </div>
                </div>
                {registryItem?.description && (
                  <p className="mt-3 text-sm text-muted-foreground">{registryItem.description}</p>
                )}
                {componentDependencies.length > 0 ? (
                  <div className="mt-4">
                    <div className="text-[11px] font-medium text-foreground">Dependencies</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {componentDependencies.map((dep) => (
                        <span
                          key={dep}
                          className="rounded-full border border-border/60 bg-card px-2 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {dep}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      {componentDependencies.length} beroenden kan behövas för full funktion.
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 text-[11px] text-muted-foreground">Inga extra dependencies krävs.</div>
                )}
                <div className={`mt-4 rounded-lg border px-3 py-2.5 ${componentMeta.hintClass}`}>
                  <div className="text-[11px] font-medium">Användningstips</div>
                  <div className="mt-1 text-[12px] leading-relaxed">{componentUsageHint}</div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground/70">
                  Öppna docs för interaktiva exempel, API-referens och åtkomst till senaste implementationen.
                </div>
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
              <Wand2 className="mt-0.5 size-4 shrink-0 text-brand-teal" />
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

const COMPONENT_DETAIL_META: Record<
  ComponentPreviewKind,
  { emoji: string; label: string; iconClass: string; badgeClass: string; hintClass: string }
> = {
  inputs: {
    emoji: "⌨️",
    label: "Input",
    iconClass: "bg-brand-blue/10 text-brand-blue",
    badgeClass: "bg-brand-blue/10 text-brand-blue/80",
    hintClass: "border-brand-blue/20 bg-brand-blue/5 text-brand-blue/90",
  },
  forms: {
    emoji: "📝",
    label: "Form",
    iconClass: "bg-brand-amber/10 text-brand-amber",
    badgeClass: "bg-brand-amber/10 text-brand-amber/80",
    hintClass: "border-brand-amber/20 bg-brand-amber/5 text-brand-amber/90",
  },
  overlay: {
    emoji: "🪟",
    label: "Overlay",
    iconClass: "bg-violet-500/10 text-violet-300",
    badgeClass: "bg-violet-500/10 text-violet-300",
    hintClass: "border-violet-500/20 bg-violet-500/5 text-violet-200",
  },
  navigation: {
    emoji: "🧭",
    label: "Navigation",
    iconClass: "bg-cyan-500/10 text-cyan-300",
    badgeClass: "bg-cyan-500/10 text-cyan-300",
    hintClass: "border-cyan-500/20 bg-cyan-500/5 text-cyan-200",
  },
  layout: {
    emoji: "🧱",
    label: "Layout",
    iconClass: "bg-emerald-500/10 text-emerald-300",
    badgeClass: "bg-emerald-500/10 text-emerald-300",
    hintClass: "border-emerald-500/20 bg-emerald-500/5 text-emerald-200",
  },
  feedback: {
    emoji: "💬",
    label: "Feedback",
    iconClass: "bg-pink-500/10 text-pink-300",
    badgeClass: "bg-pink-500/10 text-pink-300",
    hintClass: "border-pink-500/20 bg-pink-500/5 text-pink-200",
  },
  data: {
    emoji: "🗂️",
    label: "Data",
    iconClass: "bg-teal-500/10 text-teal-300",
    badgeClass: "bg-teal-500/10 text-teal-300",
    hintClass: "border-teal-500/20 bg-teal-500/5 text-teal-200",
  },
  table: {
    emoji: "📋",
    label: "Tabell",
    iconClass: "bg-indigo-500/10 text-indigo-300",
    badgeClass: "bg-indigo-500/10 text-indigo-300",
    hintClass: "border-indigo-500/20 bg-indigo-500/5 text-indigo-200",
  },
  typography: {
    emoji: "🔤",
    label: "Typografi",
    iconClass: "bg-fuchsia-500/10 text-fuchsia-300",
    badgeClass: "bg-fuchsia-500/10 text-fuchsia-300",
    hintClass: "border-fuchsia-500/20 bg-fuchsia-500/5 text-fuchsia-200",
  },
  other: {
    emoji: "📦",
    label: "UI",
    iconClass: "bg-muted/70 text-foreground/80",
    badgeClass: "bg-muted/70 text-foreground/80",
    hintClass: "border-border/70 bg-muted/40 text-foreground/80",
  },
};

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
            className={`size-2 rounded-full ${isLight ? "bg-gray-300" : "bg-gray-600"}`}
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
