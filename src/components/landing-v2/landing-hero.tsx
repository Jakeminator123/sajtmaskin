"use client"

import { ArrowUp, ChevronDown, Mic, Play, Video, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { VoiceRecorder } from "@/components/forms/voice-recorder"
import { ParticleOrb } from "@/components/landing-v2/particle-orb"
import { categories, longestSiteType, stats } from "@/components/landing-v2/landing-chat-data"
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
  | "headlineTilt"
  | "rotatingType"
  | "activeCategory"
  | "isAuditMode"
  | "currentAuditUrl"
  | "handleAuditUrlChange"
  | "submitPrimaryInput"
> &
  Pick<ChatAreaProps, "heroPrefix" | "expandedContent" | "onPlayIntro">

export function LandingHero({
  heroPrefix,
  expandedContent,
  onPlayIntro,
  selectedCategory,
  pickCategory,
  showVoiceRecorder,
  setShowVoiceRecorder,
  inputValue,
  setInputValue,
  isSubmitting,
  headlineTilt,
  rotatingType,
  activeCategory,
  isAuditMode,
  currentAuditUrl,
  handleAuditUrlChange,
  submitPrimaryInput,
}: LandingHeroProps) {
  const { ref: headlineRef, handleMove: onHeadlineMove, handleLeave: onHeadlineLeave } = headlineTilt

  return (
    <section className="flex min-h-[calc(100vh-57px)] flex-col items-center justify-center px-6 pt-10 pb-8 supports-[height:100svh]:min-h-[calc(100svh-57px)] md:pt-16 md:pb-12">
      {heroPrefix}
      <div className="relative mb-5 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <ParticleOrb />
      </div>

      <div
        className="inline-flex items-center gap-2 text-xs font-medium text-primary bg-primary/8 border border-primary/15 px-4 py-1.5 rounded-full mb-5 animate-fade-up"
        style={{ animationDelay: "0.2s" }}
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
        F&ouml;r svenska f&ouml;retag som vill komma ig&aring;ng snabbt
      </div>

      <div
        ref={headlineRef}
        onMouseMove={onHeadlineMove}
        onMouseLeave={onHeadlineLeave}
        style={{ transition: "transform 0.15s ease-out", willChange: "transform" }}
        className="cursor-default"
      >
        <h1
          className="text-3xl md:text-5xl lg:text-6xl text-foreground mb-4 text-center font-(--font-heading) tracking-tight text-balance animate-rise leading-[1.1]"
          style={{ animationDelay: "0.3s" }}
          aria-label="Din nästa sajt på 30 sekunder"
        >
          <span aria-hidden="true">
            Din n&auml;sta{" "}
            <span className="relative inline-grid max-w-full align-baseline">
              {/* Osynlig platshållare (längsta ordet) delar grid-cell med det
                  synliga ordet och reserverar bredd/höjd — rubriken hoppar
                  aldrig och understrykningen spänner alltid ordets yta.
                  Under sm döljs platshållaren: på mycket smala mobiler skulle
                  längsta ordets reserverade bredd annars kunna klippas av
                  sidans overflow-x-hidden — där sätter det synliga ordet
                  cellens bredd i stället (understrykningen följer ordet). */}
              <span className="invisible whitespace-nowrap [grid-area:1/1] max-sm:hidden">{longestSiteType}</span>
              <span
                className={`text-primary whitespace-nowrap text-center [grid-area:1/1] transition-all duration-300 motion-reduce:transition-none ${rotatingType.visible ? "opacity-100 translate-y-0 blur-0" : "opacity-0 -translate-y-3 blur-sm"}`}
              >
                {rotatingType.text}
              </span>
              <span className="absolute -bottom-1 left-0 right-0 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent" />
            </span>
            <br className="hidden md:block" /> p&aring; 30 sekunder
          </span>
        </h1>
      </div>
      <p
        className="text-base md:text-lg text-muted-foreground text-center max-w-2xl mb-8 leading-relaxed animate-rise text-pretty"
        style={{ animationDelay: "0.4s" }}
      >
        Beskriv ditt f&ouml;retag &mdash; f&aring; en professionell sajt som driver aff&auml;rer, inte bara ser bra ut. Inga
        f&ouml;rkunskaper kr&auml;vs. Byggt f&ouml;r svenska f&ouml;retagare som beh&ouml;ver mer &auml;n en statisk
        startsida.
      </p>

      <div
        className="flex flex-wrap items-center justify-center gap-2.5 mb-8 animate-fade-up"
        style={{ animationDelay: "0.5s" }}
      >
        {categories.map((cat, i) => {
          const Icon = cat.icon
          const isActive = selectedCategory === cat.id
          const hoverColors = [
            "hover:border-sky-500/40 hover:shadow-sky-500/10",
            "hover:border-violet-500/40 hover:shadow-violet-500/10",
            "hover:border-amber-500/40 hover:shadow-amber-500/10",
            "hover:border-rose-500/40 hover:shadow-rose-500/10",
            "hover:border-emerald-500/40 hover:shadow-emerald-500/10",
          ]
          const iconHoverColors = [
            "group-hover:text-sky-400",
            "group-hover:text-violet-400",
            "group-hover:text-amber-400",
            "group-hover:text-rose-400",
            "group-hover:text-emerald-400",
          ]
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                const newVal = isActive ? null : cat.id
                pickCategory(newVal)
              }}
              className={`group relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-all duration-300 cursor-pointer hover:-translate-y-0.5 hover:shadow-lg ${
                isActive
                  ? "bg-primary/12 border-primary/40 text-foreground shadow-lg shadow-primary/5 -translate-y-0.5"
                  : `bg-secondary/50 border-border/30 text-muted-foreground hover:text-foreground hover:bg-secondary/70 ${hoverColors[i]}`
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 transition-all duration-300 ${
                  isActive ? "text-primary" : `text-muted-foreground ${iconHoverColors[i]}`
                } group-hover:scale-110`}
              />
              <div className="flex flex-col items-start">
                <span className="text-sm font-medium leading-tight">{cat.label}</span>
                <span className="text-[10px] text-muted-foreground leading-tight">{cat.description}</span>
              </div>
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-current scale-0 group-hover:scale-100" />
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
                placeholder={activeCategory?.placeholder ?? "Beskriv ditt f\u00f6retag \u2014 t.ex. \u201dJag driver en fris\u00f6rsalong i G\u00f6teborg med 3 anst\u00e4llda\u201d"}
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
            <div className="flex items-center justify-between pt-2 border-t border-border/15">
              <p className="text-xs text-muted-foreground">
                {activeCategory ? `L\u00e4ge: ${activeCategory.label}` : "V\u00e4lj Template ovan eller skriv fritt"}
              </p>
              <div className="flex items-center gap-2">
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
                      aria-label="Byt till Analyserad för videoinspelning i wizarden"
                      title="Videoinspelning med analys finns i Analyserad-läget — klicka för att välja det"
                      onClick={() => {
                        pickCategory("analyserad")
                        toast.message("Analyserad", {
                          description:
                            "Fortsätt i wizarden för videoinspelning med analys (t.ex. hållning och blick).",
                        })
                      }}
                    >
                      <Video className="w-4 h-4" />
                    </Button>
                  </>
                )}
                <Button
                  size="icon"
                  className="h-9 w-9 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25"
                  aria-label="Skicka"
                  disabled={isSubmitting || (isAuditMode && currentAuditUrl.trim().length === 0)}
                  onClick={() => {
                    submitPrimaryInput()
                  }}
                >
                  <ArrowUp className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {onPlayIntro && (
        <button
          type="button"
          onClick={onPlayIntro}
          className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors animate-fade-up"
          style={{ animationDelay: "0.65s" }}
        >
          <Play className="w-3 h-3" aria-hidden="true" />
          Ny h&auml;r? Se intron (ca 2 min)
        </button>
      )}

      {expandedContent && (
        <div className="w-full flex justify-center mt-8 animate-fade-up">
          {expandedContent}
        </div>
      )}

      <div
        className="flex flex-wrap items-center justify-center gap-3 md:gap-4 mt-10 animate-fade-up"
        style={{ animationDelay: "0.7s" }}
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="group relative flex items-center gap-2 bg-secondary/40 border border-border/20 hover:border-primary/30 rounded-xl px-4 py-2.5 transition-all duration-300 hover:bg-secondary/60 cursor-default"
          >
            <span className="text-base md:text-lg text-primary font-(--font-heading) transition-transform duration-300 group-hover:scale-105">
              {stat.value}
            </span>
            <span className="text-xs text-muted-foreground">{stat.label}</span>
            <span className="absolute -top-9 left-1/2 -translate-x-1/2 text-[10px] text-foreground bg-card border border-border/30 rounded-lg px-2.5 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none -translate-y-1 group-hover:translate-y-0 shadow-lg">
              {stat.tooltip}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-12 animate-fade-up opacity-40" style={{ animationDelay: "1s" }}>
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Scrolla ner</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground animate-bounce" />
        </div>
      </div>
    </section>
  )
}
