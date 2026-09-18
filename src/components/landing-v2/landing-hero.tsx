"use client"

import dynamic from "next/dynamic"
import { ArrowUp, Mic, Video, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { VoiceRecorder } from "@/components/forms/voice-recorder"
import {
  categories,
  homepageHeroCopy,
  longestSiteType,
} from "@/components/landing-v2/landing-chat-data"
import { preloadReturningLanyard } from "@/components/landing-v2/lanyard-consent"
import type { ChatAreaProps, LandingController } from "@/components/landing-v2/use-landing-controller"

if (typeof window !== "undefined") {
  preloadReturningLanyard()
}

// Cookie-samtycke som flippar till det fysikdrivna 3D-nyckelbandet.
// Laddas endast i webbläsaren (ingen SSR). Stagen är tom tills kortet är
// redo; återbesökare får då drop-in-entrén i LanyardExperience.
const LanyardExperience = dynamic(
  () => import("@/components/landing-v2/lanyard-experience").then((m) => m.LanyardExperience),
  { ssr: false },
)

export type LandingHeroProps = Pick<
  LandingController,
  | "selectedCategory"
  | "pickCategory"
  | "showVoiceRecorder"
  | "setShowVoiceRecorder"
  | "inputValue"
  | "setInputValue"
  | "isSubmitting"
  | "headlineTilt"
  | "rotatingType"
  | "activeCategory"
  | "isAuditMode"
  | "currentAuditUrl"
  | "handleAuditUrlChange"
  | "submitPrimaryInput"
> &
  Pick<ChatAreaProps, "expandedContent" | "onPlayIntro">

export function LandingHero({
  expandedContent,
  selectedCategory,
  pickCategory,
  showVoiceRecorder,
  setShowVoiceRecorder,
  inputValue,
  setInputValue,
  isSubmitting,
  rotatingType,
  activeCategory,
  isAuditMode,
  currentAuditUrl,
  handleAuditUrlChange,
  submitPrimaryInput,
}: LandingHeroProps) {
  const primaryCta = isAuditMode ? homepageHeroCopy.auditCta : homepageHeroCopy.primaryCta

  return (
    <section className="relative flex min-h-[calc(100vh-57px)] flex-col items-center justify-start overflow-x-visible pt-0 pb-8 supports-[height:100svh]:min-h-[calc(100svh-57px)] md:pt-0 md:pb-12">
      <div
        data-lanyard-stage
        className="pointer-events-auto relative z-0 mb-6 h-[min(56vh,620px)] w-screen max-w-none shrink-0 overflow-visible sm:h-[min(60vh,680px)] md:h-[min(64vh,720px)]"
      >
        <LanyardExperience className="h-full w-full overflow-visible" />
      </div>

      <div className="flex w-full flex-col items-center px-6">
      <div className="cursor-default">
        <h1
          className="text-3xl md:text-5xl lg:text-6xl text-foreground mb-4 text-center font-(--font-heading) tracking-tight text-balance animate-rise leading-[1.1]"
          style={{ animationDelay: "0.3s" }}
        >
          {homepageHeroCopy.h1}
        </h1>
        <p
          className="mx-auto mb-3 max-w-2xl text-center text-base leading-relaxed text-muted-foreground text-pretty md:text-lg"
          style={{ animationDelay: "0.35s" }}
        >
          {homepageHeroCopy.valueProposition}
        </p>
        <p className="mb-3 text-center text-sm text-muted-foreground">{homepageHeroCopy.audience}</p>
        <p
          className="mb-8 text-center text-sm text-muted-foreground/80"
          aria-hidden="true"
        >
          {homepageHeroCopy.rotatingPrefix}{" "}
          <span className="inline-grid max-w-full justify-items-start align-baseline">
            <span className="invisible hidden whitespace-nowrap [grid-area:1/1] md:inline">
              {longestSiteType}
            </span>
            <span
              className={`[grid-area:1/1] transition-all duration-300 motion-reduce:transition-none ${rotatingType.visible ? "opacity-100 translate-y-0 blur-0" : "opacity-0 -translate-y-3 blur-sm"}`}
            >
              <span className="relative whitespace-nowrap text-primary">
                {rotatingType.text}
                <span className="absolute -bottom-1 left-0 right-0 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent" />
              </span>
            </span>
          </span>
        </p>
      </div>

      <p className="mb-3 text-center text-xs font-medium tracking-widest text-muted-foreground uppercase">
        {homepageHeroCopy.methodLabel}
      </p>
      <div
        className="flex flex-wrap items-center justify-center gap-2.5 mb-8 animate-fade-up"
        style={{ animationDelay: "0.5s" }}
      >
        {categories.map((cat) => {
          const Icon = cat.icon
          const isActive = selectedCategory === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                const newVal = isActive ? null : cat.id
                pickCategory(newVal)
              }}
              className={`group relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-colors duration-200 cursor-pointer ${
                isActive
                  ? "bg-primary/10 border-primary/40 text-foreground"
                  : "bg-secondary/50 border-border/30 text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-secondary/70"
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 transition-colors duration-200 ${
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-primary"
                }`}
              />
              <div className="flex flex-col items-start">
                <span className="text-sm font-medium leading-tight">{cat.label}</span>
                <span className="hidden text-[10px] text-muted-foreground leading-tight sm:block">{cat.description}</span>
              </div>
            </button>
          )
        })}
      </div>

      <div className={`w-full ${isAuditMode ? "max-w-xl" : "max-w-2xl"} animate-fade-up`} style={{ animationDelay: "0.6s" }}>
        {showVoiceRecorder && !isAuditMode && (
          <div className="mb-3 input-3d bg-secondary/80 backdrop-blur-xl rounded-2xl border border-border/50 px-4 py-3 shadow-2xl animate-in slide-in-from-bottom-2 fade-in duration-300">
            <div className="flex items-center justify-between gap-4">
              <VoiceRecorder
                compact
                language="sv"
                onTranscript={(t) => {
                  setInputValue((prev) => (prev ? prev + " " + t : t))
                  setShowVoiceRecorder(false)
                }}
                onRecordingChange={() => {}}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => setShowVoiceRecorder(false)}
                aria-label="Stäng röstinspelning"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        <div className={`input-3d bg-secondary/50 backdrop-blur-xl rounded-2xl border border-border/30 ${isAuditMode ? "p-3" : "p-4"} shadow-2xl`}>
          <div className={isAuditMode ? "space-y-2" : "space-y-3"}>
            {isAuditMode ? (
              <input
                data-openclaw-text-target="landing.audit.url"
                data-openclaw-text-label="Audit-URL på startsidan"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder={activeCategory?.placeholder ?? "Klistra in din webbadress här, t.ex. https://mittforetag.se"}
                value={currentAuditUrl}
                onChange={(e) => handleAuditUrlChange(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    submitPrimaryInput()
                  }
                }}
                className="w-full bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/60 text-base font-normal leading-relaxed py-2"
              />
            ) : (
              <textarea
                data-openclaw-text-target="landing.freeform.primary"
                data-openclaw-text-label="Frilägesfältet på startsidan"
                placeholder={activeCategory?.placeholder ?? "Beskriv företaget — t.ex. ”Jag driver en frisörsalong i Göteborg”"}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    submitPrimaryInput()
                  }
                }}
                className="w-full bg-transparent border-none outline-none resize-none text-foreground placeholder:text-muted-foreground/60 text-base min-h-[68px] font-normal leading-relaxed"
              />
            )}
            <div className="flex flex-col gap-3 border-t border-border/15 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {activeCategory ? `Läge: ${activeCategory.label}` : homepageHeroCopy.inputHint}
              </p>
              <div className="flex items-center justify-end gap-2">
                {!isAuditMode && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                      onClick={() => setShowVoiceRecorder((v) => !v)}
                      aria-label="Spela in röst"
                    >
                      <Mic className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                      aria-label="Byt till frågeläge för videoinspelning"
                      title="Videoinspelning med analys finns när du svarar på frågor"
                      onClick={() => {
                        pickCategory("analyserad")
                        toast.message("Svara på frågor", {
                          description:
                            "Fortsätt i guiden för videoinspelning med analys (t.ex. hållning och blick).",
                        })
                      }}
                    >
                      <Video className="w-4 h-4" />
                    </Button>
                  </>
                )}
                <Button
                  data-homepage-cta="primary"
                  className="h-10 rounded-full bg-primary px-4 text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary-hover"
                  aria-label={primaryCta}
                  disabled={isSubmitting || (isAuditMode && currentAuditUrl.trim().length === 0)}
                  onClick={() => {
                    submitPrimaryInput()
                  }}
                >
                  <span className="text-sm font-medium">{primaryCta}</span>
                  <ArrowUp className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {expandedContent && (
        <div className="w-full flex justify-center mt-8 animate-fade-up">
          {expandedContent}
        </div>
      )}
      </div>
    </section>
  )
}
