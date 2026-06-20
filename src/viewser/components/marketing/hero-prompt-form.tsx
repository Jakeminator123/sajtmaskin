"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { DiscoveryWizard } from "@viewser/components/discovery-wizard/discovery-wizard";
import type { discoveryOption } from "@viewser/components/discovery-wizard/discovery-options";
import type { WizardAnswers } from "@viewser/components/discovery-wizard/wizard-types";
import { STUDIO_HREF } from "@viewser/lib/routes";
import {
  setDirectBuildHandoff,
  setWizardHandoff,
} from "@viewser/lib/init-prompt-handoff";
import { STARTER_PRESETS, type StarterPreset } from "@viewser/lib/starter-presets";

const URL_PATTERN = /(?:https?:\/\/[^\s]+|www\.[^\s]+)/i;

function extractInlineUrl(text: string): string | undefined {
  const match = text.match(URL_PATTERN);
  if (!match?.[0]) return undefined;
  const normalized = match[0].replace(/[),.;!?]+$/, "").trim();
  return normalized || undefined;
}

// Hero-prompten skickar nu beskrivningen direkt till buildern via
// DirectBuildHandoff. DiscoveryWizard finns kvar i filen för kompatibilitet
// med befintlig wizard-handoff-seam.
export function HeroPromptForm() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [handingOff, setHandingOff] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function start() {
    if (handingOff) return;
    const cleanedPrompt = prompt.trim();
    if (!cleanedPrompt) return;
    const url = extractInlineUrl(cleanedPrompt);
    setHandingOff(true);
    setDirectBuildHandoff(
      url ? { prompt: cleanedPrompt, url } : { prompt: cleanedPrompt },
    );
    router.push(STUDIO_HREF);
  }

  // Starter-chip går också direkt till buildern utan wizard.
  function startWithPreset(preset: StarterPreset) {
    if (handingOff) return;
    setHandingOff(true);
    setDirectBuildHandoff({ prompt: preset.promptSeed });
    router.push(STUDIO_HREF);
  }

  function handleWizardComplete(
    answers: WizardAnswers,
    discoveryOptions: readonly discoveryOption[],
  ) {
    setWizardOpen(false);
    setHandingOff(true);
    // Hero-textarean kan vara TOM när besökaren öppnade wizarden direkt och
    // bara fyllde "Vad gör ni?" där (answers.offer). Faller hero-prompten
    // tillbaka på offer-svaret så ``discovery.rawPrompt`` aldrig blir "" —
    // annars tappas "Operatörens beskrivning" ur master-prompten på /studio.
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
        <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-white/95 shadow-2xl backdrop-blur-xl">
          <label htmlFor="hero-prompt" className="sr-only">
            Beskriv din sajt
          </label>
          <textarea
            id="hero-prompt"
            ref={textareaRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Beskriv din sajt och klistra ev. in en befintlig URL…"
            rows={2}
            maxLength={4000}
            disabled={handingOff}
            onKeyDown={(event) => {
              // ⌘/Ctrl + ↵ skickar direkt till buildern; Enter ensamt = radbrytning.
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                start();
              }
            }}
            className="text-foreground placeholder:text-muted-foreground/80 min-h-[64px] w-full resize-none bg-transparent px-4 py-3 text-base leading-relaxed outline-none disabled:opacity-70 md:text-[15px]"
          />
          <div className="border-border/40 flex items-center justify-between gap-2 border-t px-3 py-2">
            <span className="text-muted-foreground/70 hidden font-mono text-[10px] sm:inline">
              ⌘ + ↵
            </span>
            <button
              type="submit"
              disabled={handingOff}
              aria-label="Bygg din hemsida"
              className="bg-foreground text-background hover:bg-foreground/90 focus-visible:ring-ring/60 ml-auto inline-flex size-9 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none active:scale-95 disabled:opacity-70"
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
          Skriv en mening om ditt företag och klistra ev. in en URL — vi
          bygger direkt.
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
