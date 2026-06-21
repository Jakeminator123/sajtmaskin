"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { DiscoveryWizard } from "@viewser/components/discovery-wizard/discovery-wizard";
import type { discoveryOption } from "@viewser/components/discovery-wizard/discovery-options";
import type { WizardAnswers } from "@viewser/components/discovery-wizard/wizard-types";
import type { AssetRef } from "@viewser/lib/asset-store/types";
import { STUDIO_HREF } from "@viewser/lib/routes";
import {
  setDirectBuildHandoff,
  setWizardHandoff,
} from "@viewser/lib/init-prompt-handoff";
import { STARTER_PRESETS, type StarterPreset } from "@viewser/lib/starter-presets";

const URL_PATTERN = /(?:https?:\/\/[^\s]+|www\.[^\s]+)/i;

// Material kan laddas upp redan på startsidan (pre-build). /api/upload-asset
// lagrar under uploads/<assetId>/ och kräver inget siteId, så refsen kan
// bäras in i bygget via DirectBuildHandoff.
const ALLOWED_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const ALLOWED_VIDEO_MIMES = ["video/mp4", "video/webm"];
const ALLOWED_MIMES = new Set([...ALLOWED_IMAGE_MIMES, ...ALLOWED_VIDEO_MIMES]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

function extractInlineUrl(text: string): string | undefined {
  const match = text.match(URL_PATTERN);
  if (!match?.[0]) return undefined;
  const normalized = match[0].replace(/[),.;!?]+$/, "").trim();
  return normalized || undefined;
}

// Hero-prompten skickar beskrivningen direkt till buildern via
// DirectBuildHandoff (prompt + ev. URL + ev. uppladdat material).
// DiscoveryWizard finns kvar i filen för bakåtkompatibel wizard-handoff.
export function HeroPromptForm() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [urlOpen, setUrlOpen] = useState(false);
  const [assets, setAssets] = useState<AssetRef[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [handingOff, setHandingOff] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (isUploading || handingOff) return;
      const valid: File[] = [];
      for (const file of files) {
        if (!ALLOWED_MIMES.has(file.type)) {
          setUploadError(
            "Endast bilder (PNG, JPEG, WebP, SVG) eller film (MP4, WebM).",
          );
          return;
        }
        const cap = ALLOWED_VIDEO_MIMES.includes(file.type)
          ? MAX_VIDEO_BYTES
          : MAX_IMAGE_BYTES;
        if (file.size > cap) {
          setUploadError(
            `Filen är ${(file.size / 1024 / 1024).toFixed(1)} MB — max ${Math.round(
              cap / 1024 / 1024,
            )} MB.`,
          );
          return;
        }
        valid.push(file);
      }
      if (valid.length === 0) return;
      setIsUploading(true);
      setUploadError(null);
      try {
        for (const file of valid) {
          const form = new FormData();
          form.append("file", file);
          form.append("role", "gallery");
          const response = await fetch("/api/upload-asset", {
            method: "POST",
            body: form,
          });
          const payload = (await response.json()) as {
            ok?: boolean;
            ref?: AssetRef;
            error?: string;
          };
          if (!response.ok || !payload.ok || !payload.ref) {
            throw new Error(payload.error ?? "Uppladdningen misslyckades.");
          }
          setAssets((prev) => [...prev, payload.ref as AssetRef]);
        }
      } catch (caught) {
        setUploadError(caught instanceof Error ? caught.message : "Okänt fel.");
      } finally {
        setIsUploading(false);
      }
    },
    [isUploading, handingOff],
  );

  function start() {
    if (handingOff) return;
    const cleanedPrompt = prompt.trim();
    if (!cleanedPrompt) return;
    // Explicit "befintlig hemsida"-fält vinner över ev. inline-URL i texten.
    const url = siteUrl.trim() || extractInlineUrl(cleanedPrompt);
    setHandingOff(true);
    setDirectBuildHandoff({
      prompt: cleanedPrompt,
      ...(url ? { url } : {}),
      ...(assets.length ? { assets } : {}),
    });
    router.push(STUDIO_HREF);
  }

  // Starter-chip går också direkt till buildern (utan wizard), och tar med
  // ev. uppladdat material.
  function startWithPreset(preset: StarterPreset) {
    if (handingOff) return;
    setHandingOff(true);
    setDirectBuildHandoff({
      prompt: preset.promptSeed,
      ...(assets.length ? { assets } : {}),
    });
    router.push(STUDIO_HREF);
  }

  function handleWizardComplete(
    answers: WizardAnswers,
    discoveryOptions: readonly discoveryOption[],
  ) {
    setWizardOpen(false);
    setHandingOff(true);
    const handoffPrompt = prompt.trim() || answers.offer.trim();
    setWizardHandoff({ prompt: handoffPrompt, answers, discoveryOptions });
    router.push(STUDIO_HREF);
  }

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          start();
        }}
        className="mt-7 w-full max-w-[640px]"
      >
        <div
          onDragOver={(event) => {
            if (handingOff || isUploading) return;
            if (!Array.from(event.dataTransfer.types).includes("Files")) return;
            event.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
              return;
            }
            setIsDragOver(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragOver(false);
            const files = Array.from(event.dataTransfer.files ?? []);
            if (files.length > 0) void uploadFiles(files);
          }}
          className="relative overflow-hidden rounded-2xl border border-white/15 bg-white/95 shadow-2xl backdrop-blur-xl"
        >
          {isDragOver ? (
            <div className="border-foreground/30 bg-background/90 text-foreground pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed">
              <span className="text-sm font-medium">
                Släpp bild eller film här
              </span>
              <span className="text-muted-foreground text-[11px]">
                PNG, JPEG, WebP, SVG · MP4, WebM
              </span>
            </div>
          ) : null}

          <label htmlFor="hero-prompt" className="sr-only">
            Beskriv din sajt
          </label>
          <textarea
            id="hero-prompt"
            ref={textareaRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Beskriv din sajt — vi bygger direkt."
            rows={2}
            maxLength={4000}
            disabled={handingOff}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                start();
              }
            }}
            className="text-foreground placeholder:text-muted-foreground/80 min-h-[64px] w-full resize-none bg-transparent px-4 py-3 text-base leading-relaxed outline-none disabled:opacity-70 md:text-[15px]"
          />

          {/* Diskret "befintlig hemsida"-fält — använder samma skrapverktyg
              som wizarden (i bakgrunden) för att berika prompten. */}
          {urlOpen ? (
            <div className="border-border/40 border-t px-4 py-2">
              <input
                type="text"
                inputMode="url"
                autoComplete="url"
                value={siteUrl}
                onChange={(event) => setSiteUrl(event.target.value)}
                placeholder="https://din-befintliga-hemsida.se"
                disabled={handingOff}
                className="text-foreground placeholder:text-muted-foreground/70 w-full bg-transparent text-[14px] outline-none disabled:opacity-70"
              />
            </div>
          ) : null}

          {/* Uppladdat material (bilder/film) som följer med in i bygget. */}
          {assets.length > 0 ? (
            <div className="border-border/40 flex flex-wrap gap-1.5 border-t px-4 py-2">
              {assets.map((ref) => (
                <span
                  key={ref.assetId}
                  className="border-border/60 bg-muted/50 text-foreground/80 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
                >
                  <span className="max-w-[140px] truncate" title={ref.filename}>
                    {ref.filename}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setAssets((prev) =>
                        prev.filter((item) => item.assetId !== ref.assetId),
                      )
                    }
                    aria-label={`Ta bort ${ref.filename}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          {uploadError ? (
            <p
              role="alert"
              className="text-destructive border-border/40 border-t px-4 py-1.5 text-[11px]"
            >
              {uploadError}
            </p>
          ) : null}

          <div className="border-border/40 flex items-center justify-between gap-2 border-t px-3 py-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (handingOff || isUploading) return;
                  fileInputRef.current?.click();
                }}
                disabled={handingOff || isUploading}
                className="text-muted-foreground/80 hover:text-foreground text-[12px] transition-colors disabled:opacity-60"
              >
                {isUploading ? "Laddar upp…" : "Ladda upp material"}
              </button>
              <button
                type="button"
                onClick={() => setUrlOpen((open) => !open)}
                disabled={handingOff}
                aria-pressed={urlOpen}
                className="text-muted-foreground/80 hover:text-foreground text-[12px] transition-colors disabled:opacity-60"
              >
                Ange din befintliga hemsida
              </button>
            </div>
            <button
              type="submit"
              disabled={handingOff}
              aria-label="Bygg din hemsida"
              className="bg-foreground text-background hover:bg-foreground/90 focus-visible:ring-ring/60 inline-flex size-9 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none active:scale-95 disabled:opacity-70"
            >
              {handingOff ? (
                <span className="bg-background inline-block size-2 animate-pulse rounded-full" />
              ) : (
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 19V5" />
                  <path d="m5 12 7-7 7 7" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-white/70">
          Skriv en mening om ditt företag — dra in bilder/film eller ange din
          befintliga hemsida om du vill. Vi bygger direkt.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-white/50">Eller börja från:</span>
          {STARTER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => startWithPreset(preset)}
              disabled={handingOff}
              className="focus-visible:ring-ring/60 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] text-white/90 transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:outline-none active:scale-[0.98] disabled:opacity-70"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </form>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,video/mp4,video/webm"
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length > 0) void uploadFiles(files);
        }}
        className="hidden"
        aria-hidden
      />

      {/* Behålls importerad/monterad för bakåtkompatibel wizard-handoff. */}
      <DiscoveryWizard
        key={0}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        initialPrompt={prompt}
        initialAnswers={undefined}
        onComplete={handleWizardComplete}
      />
    </>
  );
}
