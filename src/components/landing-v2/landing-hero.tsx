"use client"

import { useCallback, useRef, useState } from "react"
import { Mic, X, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { VoiceRecorder } from "@/components/forms/voice-recorder"
import type { ChatAreaProps, LandingController } from "@/components/landing-v2/use-landing-controller"

export type LandingHeroProps = Pick<
  LandingController,
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
  | "startBuild"
> &
  Pick<ChatAreaProps, "heroPrefix" | "expandedContent">

export function LandingHero({
  heroPrefix,
  expandedContent,
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
  startBuild,
}: LandingHeroProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const handleSend = useCallback(() => {
    const text = inputValue.trim()
    if (!text || isSubmitting) return
    void startBuild(null, text)
  }, [inputValue, isSubmitting, startBuild])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleVoiceTranscript = useCallback(
    (transcript: string) => {
      const trimmed = transcript.trim()
      if (!trimmed) {
        setShowVoiceRecorder(false)
        return
      }
      const combined = [inputValue.trim(), trimmed].filter(Boolean).join(" ").trim()
      setInputValue(combined)
      setShowVoiceRecorder(false)
      if (!isSubmitting) void startBuild(null, combined)
    },
    [inputValue, isSubmitting, setInputValue, setShowVoiceRecorder, startBuild],
  )

  return (
    <section className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-background px-4 pb-12 pt-20 xl:pb-16 xl:pt-24">
      {heroPrefix}

      <div className="mb-8 text-center animate-fade-up xl:mb-10">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl xl:text-5xl font-(--font-heading) text-balance leading-[1.1]">
          Beskriv ditt företag.{" "}
          <span className="text-primary">Vi bygger hemsidan.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-base text-muted-foreground xl:text-lg">
          Från idé till färdig sajt på under en minut.
        </p>
      </div>

      <div className="flex w-full max-w-[520px] flex-col items-stretch gap-6 xl:max-w-5xl xl:flex-row xl:items-stretch xl:gap-10">

        {/* Left: Input area */}
        <div className="flex w-full flex-col xl:flex-1 animate-fade-up" style={{ animationDelay: "0.15s" }}>

          {showVoiceRecorder && !isAuditMode && (
            <div className="mb-3 rounded-2xl border border-border/30 bg-secondary/50 px-4 py-3 animate-in slide-in-from-bottom-2 fade-in duration-300">
              <div className="flex items-center justify-between gap-4">
                <VoiceRecorder
                  compact
                  language="sv"
                  onTranscript={handleVoiceTranscript}
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

          <div className="flex flex-1 flex-col rounded-2xl border border-border/40 bg-card shadow-lg overflow-hidden transition-shadow focus-within:shadow-xl focus-within:border-primary/30">
            {isAuditMode ? (
              <div className="flex flex-1 flex-col justify-center p-6">
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
                  className="w-full bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50 text-lg py-2"
                />
                <div className="flex items-center justify-end pt-4 mt-4 border-t border-border/10">
                  <Button
                    size="sm"
                    className="rounded-full bg-primary hover:bg-primary/90 text-white px-5"
                    aria-label="Analysera"
                    disabled={isSubmitting || currentAuditUrl.trim().length === 0}
                    onClick={() => submitPrimaryInput()}
                  >
                    Analysera
                    <Sparkles className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col p-6">
                <textarea
                  ref={inputRef}
                  data-openclaw-text-target="landing.freeform.primary"
                  data-openclaw-text-label="Fritext"
                  placeholder='Beskriv ditt företag, t.ex. "Frisörsalong i Göteborg med onlinebokning"...'
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={5}
                  className="w-full flex-1 resize-none bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/40 text-base leading-relaxed"
                />
                <div className="flex items-center justify-between pt-4 mt-auto border-t border-border/10">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full text-muted-foreground/40 hover:text-foreground"
                    onClick={() => setShowVoiceRecorder((v) => !v)}
                    aria-label="Röstinspelning"
                  >
                    <Mic className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-full bg-primary hover:bg-primary/90 text-white px-6 shadow-md disabled:opacity-40"
                    disabled={isSubmitting || !inputValue.trim()}
                    onClick={handleSend}
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Skapar…
                      </span>
                    ) : (
                      <>
                        Bygg min sajt
                        <Sparkles className="ml-1.5 h-3.5 w-3.5" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {expandedContent && (
            <div className="mt-6 w-full animate-fade-up">
              {expandedContent}
            </div>
          )}
        </div>

        {/* Right: Promo video */}
        <div
          className="w-full xl:flex-1 animate-fade-up"
          style={{ animationDelay: "0.3s" }}
        >
          <div className="relative h-full overflow-hidden rounded-2xl border border-border/20 shadow-xl xl:rounded-3xl">
            <video
              ref={videoRef}
              src="/video/sajtmaskin-promo.mp4"
              muted
              playsInline
              autoPlay
              loop
              className="h-full w-full object-cover"
            />
          </div>
        </div>

      </div>
    </section>
  )
}
