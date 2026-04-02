"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowUp, Mic, X, Bot, Lightbulb } from "lucide-react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { VoiceRecorder } from "@/components/forms/voice-recorder"
import { categories } from "@/components/landing-v2/landing-chat-data"
import { useLandingChat, LANDING_SUGGESTIONS } from "@/components/landing-v2/use-landing-chat"
import type { ChatAreaProps, LandingController } from "@/components/landing-v2/use-landing-controller"

const secondaryCategories = categories.filter((c) => c.id !== "fritext")

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
  | "startBuild"
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
  startBuild,
}: LandingHeroProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)

  const { greetingDisplayed, greetingDone } = useLandingChat()
  const showChatMode = !isAuditMode

  useEffect(() => {
    videoRef.current?.play().catch(() => {})
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [greetingDisplayed])

  const handleChatSend = useCallback(() => {
    const text = inputValue.trim()
    if (!text || isSubmitting) return
    void startBuild(null, text)
  }, [inputValue, isSubmitting, startBuild])

  const handleChatKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleChatSend()
      }
    },
    [handleChatSend],
  )

  const handleSuggestionClick = useCallback(
    (text: string) => {
      if (isSubmitting) return
      void startBuild(null, text)
    },
    [isSubmitting, startBuild],
  )

  const handleVoiceTranscript = useCallback(
    (transcript: string) => {
      const trimmedTranscript = transcript.trim()
      if (!trimmedTranscript) {
        setShowVoiceRecorder(false)
        return
      }

      const combinedPrompt = [inputValue.trim(), trimmedTranscript].filter(Boolean).join(" ").trim()
      setInputValue(combinedPrompt)
      setShowVoiceRecorder(false)

      if (!isSubmitting && showChatMode) {
        void startBuild(null, combinedPrompt)
      }
    },
    [inputValue, isSubmitting, setInputValue, setShowVoiceRecorder, showChatMode, startBuild],
  )

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden supports-[height:100svh]:min-h-[100svh]">
      {/* Video background */}
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        preload="auto"
      >
        <source src="/video/hero-bg.mp4" type="video/mp4" />
      </video>

      <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px]" />

      {heroPrefix}

      {/* Pulsating hero box */}
      <div className="relative z-10 mx-4 w-full max-w-2xl animate-hero-pulse rounded-3xl border border-border/40 bg-card/85 px-6 py-10 shadow-2xl backdrop-blur-xl sm:px-10 sm:py-12 md:px-12 md:py-14">
        <h1
          className="text-3xl sm:text-4xl md:text-5xl text-foreground text-center font-(--font-heading) tracking-tight text-balance leading-[1.1] mb-3 animate-fade-up"
          style={{ animationDelay: "0.1s" }}
        >

          Beskriv. <span className="text-primary">Vi bygger.</span>
        </h1>
        <p
          className="text-base sm:text-lg text-muted-foreground text-center max-w-lg mx-auto mb-8 animate-fade-up"
          style={{ animationDelay: "0.2s" }}
        >
          Skriv vad du vill ha — din sajt är klar på minuter.
        </p>

        <div className="w-full animate-fade-up" style={{ animationDelay: "0.3s" }}>
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

          <div className="rounded-2xl border border-border/30 bg-background/60 shadow-sm overflow-hidden">
            {isAuditMode ? (
              /* Audit mode — URL input (unchanged) */
              <div className="p-4">
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
                <div className="flex items-center justify-end pt-2 border-t border-border/15">
                  <Button
                    size="icon"
                    className="h-9 w-9 rounded-full bg-primary hover:bg-primary/90 text-white shadow-md"
                    aria-label="Skicka"
                    disabled={isSubmitting || currentAuditUrl.trim().length === 0}
                    onClick={() => submitPrimaryInput()}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : (
              /* Chat mode — conversational UI */
              <>
                {/* Chat messages area */}
                <div
                  ref={scrollRef}
                  className="hero-chat-scroll flex flex-col gap-3 px-4 pt-4 pb-2 h-[120px] overflow-y-auto"
                >
                  {/* Greeting bubble */}
                  {greetingDisplayed && (
                    <div className="flex gap-2.5 animate-fade-up">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mt-0.5">
                        <Bot className="h-3.5 w-3.5" />
                      </span>
                      <div className="rounded-2xl rounded-tl-md bg-muted/50 px-4 py-3 max-w-[85%]">
                        <p className="text-sm text-foreground leading-relaxed">
                          {greetingDisplayed}
                          {!greetingDone && (
                            <span className="ml-0.5 inline-block w-[2px] h-4 bg-foreground/60 animate-pulse align-text-bottom" />
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Chat input */}
                <div className="px-4 pb-4 pt-2 border-t border-border/15">
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={inputRef}
                      data-openclaw-text-target="landing.freeform.primary"
                      data-openclaw-text-label="Fritext"
                      placeholder="Skriv ditt svar..."
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleChatKeyDown}
                      rows={1}
                      className="flex-1 resize-none bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50 text-sm min-h-[36px] max-h-[72px] py-2"
                    />
                    <div className="flex items-center gap-1.5 shrink-0 pb-1">
                      {greetingDone && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full text-muted-foreground/50 hover:text-foreground"
                          onClick={() => setShowSuggestions(true)}
                          aria-label="Förslag"
                          title="Förslag"
                        >
                          <Lightbulb className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                        onClick={() => setShowVoiceRecorder((v) => !v)}
                        aria-label="Röstinspelning"
                      >
                        <Mic className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        className="h-9 w-9 rounded-full bg-primary hover:bg-primary/90 text-white shadow-md"
                        aria-label="Skicka"
                        disabled={isSubmitting || !inputValue.trim()}
                        onClick={handleChatSend}
                      >
                        <ArrowUp className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>

              </>
            )}
          </div>
        </div>

        {/* Secondary alternatives — symmetric 3-col grid */}
        <div
          className="mt-6 grid grid-cols-3 gap-3 animate-fade-up"
          style={{ animationDelay: "0.45s" }}
        >
          {secondaryCategories.map((cat) => {
            const Icon = cat.icon
            const isActive = selectedCategory === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => pickCategory(isActive ? null : cat.id)}
                className={`group flex flex-col items-center gap-1 rounded-2xl px-2 py-3 text-center transition-all ${
                  isActive
                    ? "bg-primary/8 ring-1 ring-primary/20"
                    : "hover:bg-muted/40"
                }`}
              >
                <Icon className={`h-4 w-4 mb-0.5 ${isActive ? "text-primary" : "text-muted-foreground/50 group-hover:text-muted-foreground"}`} />
                <span className={`text-xs font-medium ${isActive ? "text-foreground" : "text-muted-foreground/70 group-hover:text-foreground"}`}>
                  {cat.label}
                </span>
                <span className="text-[10px] leading-tight text-muted-foreground/40">
                  {cat.outcome}
                </span>
              </button>
            )
          })}
        </div>

        {expandedContent && (
          <div className="w-full flex justify-center mt-8 animate-fade-up">
            {expandedContent}
          </div>
        )}
      </div>

      {/* Suggestions popup */}
      {showSuggestions &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(4px)",
            }}
            onClick={() => setShowSuggestions(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#ffffff",
                borderRadius: "1.5rem",
                maxWidth: "680px",
                width: "calc(100% - 2rem)",
                maxHeight: "80vh",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 25px 60px rgba(0,0,0,0.2)",
              }}
            >
              <div style={{ padding: "1.5rem 1.5rem 1rem", textAlign: "center" }}>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#1a1a2e", margin: 0 }}>
                  Vad vill du bygga?
                </h2>
                <p style={{ fontSize: "0.8rem", color: "#888", marginTop: "0.25rem" }}>
                  Välj ett förslag eller skriv fritt
                </p>
              </div>

              <div
                style={{
                  overflowY: "auto",
                  padding: "0 1.5rem 1.5rem",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: "0.5rem",
                }}
              >
                {LANDING_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setShowSuggestions(false)
                      handleSuggestionClick(s)
                    }}
                    style={{
                      background: "#f5f5f5",
                      border: "1px solid #e5e5e5",
                      borderRadius: "0.75rem",
                      padding: "0.625rem 0.75rem",
                      fontSize: "0.8rem",
                      color: "#333",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "all 150ms",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#1a1a2e"
                      e.currentTarget.style.color = "#fff"
                      e.currentTarget.style.borderColor = "#1a1a2e"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#f5f5f5"
                      e.currentTarget.style.color = "#333"
                      e.currentTarget.style.borderColor = "#e5e5e5"
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
  )
}
