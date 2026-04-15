"use client"

import { useCallback, useRef } from "react"
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

const motionEnter =
  "motion-safe:animate-fade-up motion-reduce:animate-none motion-reduce:opacity-100"

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
    <section className="relative flex min-h-[min(100dvh,880px)] flex-col items-center justify-center overflow-hidden bg-background px-4 pb-12 pt-20 md:px-6 md:pb-16 md:pt-24">
      {heroPrefix}

      <div className={`mb-8 max-w-md text-center md:mb-10 ${motionEnter}`}>
        <h1 className="font-(--font-heading) text-balance text-3xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-4xl">
          Bygg din sajt.
        </h1>
        <p className="mx-auto mt-3 max-w-xs text-sm text-muted-foreground">
          En kort beskrivning räcker.
        </p>
      </div>

      <div className={`flex w-full max-w-lg flex-col items-stretch ${motionEnter}`}>
        {showVoiceRecorder && !isAuditMode && (
          <div className="mb-4 rounded-2xl border border-border/50 bg-card/40 px-4 py-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200 motion-reduce:animate-none">
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
                className="h-11 w-11 shrink-0 rounded-xl"
                onClick={() => setShowVoiceRecorder(false)}
                aria-label="Stäng"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col overflow-hidden rounded-3xl border border-border/50 bg-card/30 shadow-sm transition-[box-shadow,border-color] duration-200 ease-out motion-reduce:transition-none focus-within:border-primary/35 focus-within:shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]">
          {isAuditMode ? (
            <div className="flex flex-1 flex-col justify-center p-6 md:p-7">
              <input
                data-openclaw-text-target="landing.audit.url"
                data-openclaw-text-label="Audit-URL"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder={activeCategory?.placeholder ?? "Klistra in webbadress…"}
                value={currentAuditUrl}
                onChange={(e) => handleAuditUrlChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    submitPrimaryInput()
                  }
                }}
                className="w-full border-none bg-transparent py-2 text-lg text-foreground outline-none placeholder:text-muted-foreground/50"
              />
              <div className="mt-6 flex items-center justify-end border-t border-border/40 pt-5">
                <Button
                  size="default"
                  className="landing-cta-primary rounded-xl bg-primary px-6 text-primary-foreground hover:bg-primary/90"
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
            <div className="flex flex-1 flex-col p-6 md:p-7">
              <textarea
                ref={inputRef}
                data-openclaw-text-target="landing.freeform.primary"
                data-openclaw-text-label="Fritext"
                placeholder="Ex: Frisörsalong i Göteborg, onlinebokning…"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={4}
                className="min-h-[120px] w-full flex-1 resize-none border-none bg-transparent text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/45 md:min-h-[140px]"
              />
              <div className="mt-6 flex items-center justify-between gap-3 border-t border-border/40 pt-5">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 min-h-11 w-11 min-w-11 shrink-0 rounded-xl text-muted-foreground transition-colors duration-200 ease-out hover:bg-muted/50 hover:text-foreground motion-reduce:transition-none"
                  onClick={() => setShowVoiceRecorder((v) => !v)}
                  aria-label="Röstinspelning"
                >
                  <Mic className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  className="landing-cta-primary min-h-11 rounded-xl px-6 text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                  disabled={isSubmitting || !inputValue.trim()}
                  onClick={handleSend}
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <span
                        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground motion-reduce:animate-none"
                        aria-hidden
                      />
                      Skapar…
                    </span>
                  ) : (
                    <>
                      Starta
                      <Sparkles className="ml-1.5 h-3.5 w-3.5" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {expandedContent && <div className="mt-8 w-full motion-safe:animate-fade-up motion-reduce:animate-none">{expandedContent}</div>}
      </div>
    </section>
  )
}
