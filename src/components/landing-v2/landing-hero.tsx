"use client"

import { useEffect, useRef } from "react"
import { ArrowUp, Mic, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { VoiceRecorder } from "@/components/forms/voice-recorder"
import { categories } from "@/components/landing-v2/landing-chat-data"
import type { ChatAreaProps, LandingController } from "@/components/landing-v2/use-landing-controller"

export type LandingHeroProps = Pick<
  LandingController,
  | "selectedCategory"
  | "pickCategory"
  | "showVoiceRecorder"
  | "setShowVoiceRecorder"
  | "inputValue"
  | "setInputValue"
  | "isSubmitting"
  | "activeCategory"
  | "isAuditMode"
  | "currentAuditUrl"
  | "handleAuditUrlChange"
  | "submitPrimaryInput"
> &
  Pick<ChatAreaProps, "heroPrefix" | "expandedContent">

export function LandingHero({
  heroPrefix,
  expandedContent,
  selectedCategory,
  pickCategory,
  showVoiceRecorder,
  setShowVoiceRecorder,
  inputValue,
  setInputValue,
  isSubmitting,
  activeCategory,
  isAuditMode,
  currentAuditUrl,
  handleAuditUrlChange,
  submitPrimaryInput,
}: LandingHeroProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    videoRef.current?.play().catch(() => {})
  }, [])

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden supports-[height:100svh]:min-h-[100svh]">
      {/* Video background */}
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        className="pointer-events-none absolute inset-0 h-full w-full object-cover hidden md:block"
        preload="auto"
      >
        <source src="/video/hero-desktop.mp4" type="video/mp4" />
      </video>
      <video
        autoPlay
        loop
        muted
        playsInline
        className="pointer-events-none absolute inset-0 h-full w-full object-cover md:hidden"
        preload="auto"
      >
        <source src="/video/hero-mobile.mp4" type="video/mp4" />
      </video>

      {/* Overlay to ensure text readability */}
      <div className="absolute inset-0 bg-background/70 backdrop-blur-[2px]" />

      {heroPrefix}

      {/* Pulsating hero box */}
      <div className="relative z-10 mx-4 w-full max-w-2xl animate-hero-pulse rounded-3xl border border-border/40 bg-card/85 px-6 py-10 shadow-2xl backdrop-blur-xl sm:px-10 sm:py-14 md:px-14 md:py-16">
        <h1
          className="text-3xl sm:text-4xl md:text-5xl text-foreground text-center font-(--font-heading) tracking-tight text-balance leading-[1.1] mb-3 animate-fade-up"
          style={{ animationDelay: "0.1s" }}
        >
          Bygg din sajt med AI
        </h1>
        <p
          className="text-base sm:text-lg text-muted-foreground text-center max-w-lg mx-auto mb-8 animate-fade-up"
          style={{ animationDelay: "0.2s" }}
        >
          Beskriv ditt företag. Vi sköter resten.
        </p>

        {/* Mode selector */}
        <div
          className="flex flex-wrap items-center justify-center gap-2 mb-6 animate-fade-up"
          style={{ animationDelay: "0.3s" }}
        >
          {categories.map((cat) => {
            const Icon = cat.icon
            const isActive = selectedCategory === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => pickCategory(isActive ? null : cat.id)}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all ${
                  isActive
                    ? "bg-primary/10 border-primary/30 text-foreground"
                    : "bg-secondary/50 border-border/30 text-muted-foreground hover:text-foreground hover:bg-secondary/70"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-primary" : ""}`} />
                <span className="font-medium">{cat.label}</span>
              </button>
            )
          })}
        </div>

        {/* Input area */}
        <div className="w-full animate-fade-up" style={{ animationDelay: "0.4s" }}>
          {showVoiceRecorder && !isAuditMode && (
            <div className="mb-3 rounded-2xl border border-border/30 bg-secondary/50 px-4 py-3 animate-in slide-in-from-bottom-2 fade-in duration-300">
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
                  className="h-8 w-8 shrink-0 rounded-full"
                  onClick={() => setShowVoiceRecorder(false)}
                  aria-label="Stäng"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-border/30 bg-background/60 p-4 shadow-sm">
            {isAuditMode ? (
              <input
                data-openclaw-text-target="landing.audit.url"
                data-openclaw-text-label="Audit-URL"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder={activeCategory?.placeholder ?? "Klistra in din webbadress..."}
                value={currentAuditUrl}
                onChange={(e) => handleAuditUrlChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); submitPrimaryInput() }
                }}
                className="w-full bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50 text-base py-2"
              />
            ) : (
              <textarea
                data-openclaw-text-target="landing.freeform.primary"
                data-openclaw-text-label="Fritext"
                placeholder={activeCategory?.placeholder ?? "Beskriv ditt företag..."}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitPrimaryInput() }
                }}
                className="w-full bg-transparent border-none outline-none resize-none text-foreground placeholder:text-muted-foreground/50 text-base min-h-[68px]"
              />
            )}
            <div className="flex items-center justify-between pt-2 border-t border-border/15">
              <span className="text-xs text-muted-foreground">
                {activeCategory ? activeCategory.label : "Fritext"}
              </span>
              <div className="flex items-center gap-2">
                {!isAuditMode && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                    onClick={() => setShowVoiceRecorder((v) => !v)}
                    aria-label="Röstinspelning"
                  >
                    <Mic className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  className="h-9 w-9 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
                  aria-label="Skicka"
                  disabled={isSubmitting || (isAuditMode && currentAuditUrl.trim().length === 0)}
                  onClick={() => submitPrimaryInput()}
                >
                  <ArrowUp className="w-4 h-4" />
                </Button>
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
