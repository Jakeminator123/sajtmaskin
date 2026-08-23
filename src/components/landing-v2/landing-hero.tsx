"use client"

import dynamic from "next/dynamic"
import { ArrowUp, Mic, ShieldCheck, Video, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { VoiceRecorder } from "@/components/forms/voice-recorder"
import { categories, longestSiteType, stats } from "@/components/landing-v2/landing-chat-data"

// Cookie-samtycke som flippar till det fysikdrivna 3D-nyckelbandet.
// Laddas endast i webbläsaren (ingen SSR).
const LanyardExperience = dynamic(
  () => import("@/components/landing-v2/lanyard-experience").then((m) => m.LanyardExperience),
  { ssr: false },
)
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
  return (
    <section className="flex min-h-[calc(100vh-57px)] flex-col items-center justify-center px-6 pt-10 pb-8 supports-[height:100svh]:min-h-[calc(100svh-57px)] md:pt-16 md:pb-12">
      {heroPrefix}

      <div
        className="pointer-events-auto -mt-6 mb-1 h-[240px] w-full max-w-[420px] shrink-0 sm:h-[280px] md:-mt-10 md:h-[clamp(300px,36vh,360px)]"
      >
        <LanyardExperience className="h-full" />
      </div>

      <div
        className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground bg-secondary/50 border border-border/40 px-4 py-1.5 rounded-full mb-6 animate-fade-up"
        style={{ animationDelay: "0.1s" }}
      >
        <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        Byggt f&ouml;r svenska f&ouml;retag &mdash; seri&ouml;st fr&aring;n f&ouml;rsta dagen
      </div>

      <div className="cursor-default">
        <h1
          className="text-3xl md:text-5xl lg:text-6xl text-foreground mb-4 text-center font-(--font-heading) tracking-tight text-balance animate-rise leading-[1.1]"
          style={{ animationDelay: "0.3s" }}
          aria-label="Din nästa sajt på 30 sekunder"
        >
          <span aria-hidden="true">
            Din n&auml;sta{" "}
            <span className="inline-grid max-w-full justify-items-start align-baseline">
              {/* Osynlig platshållare (längsta ordet) delar grid-cell med det
                  synliga ordet och reserverar bredd/höjd, så rubriken inte
                  hoppar när ordet byts.

                  `justify-items-start` gör att ordet BÖRJAR på samma ställe
                  varje gång, tätt efter "Din nästa", i stället för att
                  centreras i den reserverade bredden — ett kort ord låg annars
                  och flöt en bit ut till höger med ett hål framför sig.

                  Platshållaren visas bara från md, där radbrytningen nedan
                  lägger "på 30 sekunder" på egen rad: då är den reserverade
                  extrabredden osynlig radslut. Under md skulle den i stället
                  bli ett synligt glapp mitt i meningen, så där sätter det
                  synliga ordet cellens bredd (raden får hoppa i stället — den
                  är centrerad och bryter ändå om). */}
              <span className="invisible hidden whitespace-nowrap [grid-area:1/1] md:inline">
                {longestSiteType}
              </span>
              <span
                className={`[grid-area:1/1] transition-all duration-300 motion-reduce:transition-none ${rotatingType.visible ? "opacity-100 translate-y-0 blur-0" : "opacity-0 -translate-y-3 blur-sm"}`}
              >
                {/* Understrykningen sitter INNE i ordet, inte på grid-cellen:
                    på cellen spände den den reserverade bredden och stack ut
                    långt förbi ett kort ord. */}
                <span className="text-primary relative whitespace-nowrap">
                  {rotatingType.text}
                  <span className="absolute -bottom-1 left-0 right-0 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent" />
                </span>
              </span>
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
                <span className="text-[10px] text-muted-foreground leading-tight">{cat.description}</span>
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
                  className="h-9 w-9 rounded-full bg-primary hover:bg-primary-hover text-primary-foreground shadow-lg shadow-primary/25"
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
    </section>
  )
}
