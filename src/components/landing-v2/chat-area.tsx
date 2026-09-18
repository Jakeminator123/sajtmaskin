"use client"

import { useEffect } from "react"
import { ArrowRight, Rocket } from "lucide-react"
import { CreditPackageGrid } from "@/components/billing/CreditPackageGrid"
import { creditPackageCopy } from "@/lib/billing/credit-package-copy"
import { Button } from "@/components/ui/button"
import { LandingBackground } from "@/components/landing-v2/landing-background"
import { LandingExamples } from "@/components/landing-v2/landing-examples"
import { LandingExempelStrip } from "@/components/landing-v2/landing-exempel-strip"
import { LandingFooter } from "@/components/landing-v2/landing-footer"
import { LandingHero } from "@/components/landing-v2/landing-hero"
import { LandingPricingExplainer } from "@/components/landing-v2/landing-pricing-explainer"
import { LandingTrustStrip } from "@/components/landing-v2/landing-trust-strip"
import { trackHomepageEvent } from "@/components/landing-v2/landing-analytics"
import {
  integrations,
  landingJourneySteps,
} from "@/components/landing-v2/landing-chat-data"
import { HowItWorksLazy } from "@/components/landing-v2/landing-how-it-works-lazy"
import { IntegrationCard } from "@/components/landing-v2/landing-tech-integration-cards"
import { useHashScroll } from "@/components/landing-v2/landing-hooks"
import { useLandingController, type ChatAreaProps } from "@/components/landing-v2/use-landing-controller"

export type { ChatAreaProps }

/* ──────────────────── MAIN COMPONENT ──────────────────── */

export function ChatArea(props: ChatAreaProps = {}) {
  const { expandedContent, onPlayIntro } = props
  // /#hur-det-fungerar och /#priser bor i den inre scroll-containern som
  // Nexts hash-hantering inte scrollar — lös hash-länkarna här.
  useHashScroll()
  const {
    router,
    showVoiceRecorder,
    setShowVoiceRecorder,
    selectedCategory,
    pickCategory,
    inputValue,
    setInputValue,
    isSubmitting,
    rotatingType,
    headlineTilt,
    preloadHowItWorksScene,
    activeCategory,
    isAuditMode,
    currentAuditUrl,
    handleAuditUrlChange,
    startBuild,
    submitPrimaryInput,
  } = useLandingController(props)

  // Legacy-djuplänkar: #funktioner/#teknik-sektionerna flyttade till /teknik.
  // Gamla bokmärken som /#funktioner har inget mål på startsidan längre —
  // skicka dem vidare till motsvarande sektion på /teknik.
  useEffect(() => {
    const redirectLegacyHash = () => {
      const hash = window.location.hash
      if (hash === "#funktioner" || hash === "#teknik") {
        router.replace(`/teknik${hash}`)
      }
    }
    redirectLegacyHash()
    window.addEventListener("hashchange", redirectLegacyHash)
    return () => window.removeEventListener("hashchange", redirectLegacyHash)
  }, [router])

  return (
    <main className="landing-v2-page relative flex min-h-0 flex-1 flex-col overflow-x-clip overflow-y-hidden">
      <LandingBackground
        selectedCategory={selectedCategory}
        isAuditMode={isAuditMode}
        activeCategory={activeCategory}
      />

      {/* Scrollable content */}
      <div
        className="relative z-10 min-h-0 flex-1 touch-pan-y overflow-x-clip overflow-y-auto overscroll-y-contain scroll-smooth [-webkit-overflow-scrolling:touch]"
        data-scroll-container
      >

        <LandingHero
          expandedContent={expandedContent}
          onPlayIntro={onPlayIntro}
          selectedCategory={selectedCategory}
          pickCategory={pickCategory}
          showVoiceRecorder={showVoiceRecorder}
          setShowVoiceRecorder={setShowVoiceRecorder}
          inputValue={inputValue}
          setInputValue={setInputValue}
          isSubmitting={isSubmitting}
          headlineTilt={headlineTilt}
          rotatingType={rotatingType}
          activeCategory={activeCategory}
          isAuditMode={isAuditMode}
          currentAuditUrl={currentAuditUrl}
          handleAuditUrlChange={handleAuditUrlChange}
          submitPrimaryInput={submitPrimaryInput}
        />

        <LandingTrustStrip />

        <LandingExamples
          onPickExample={(siteType) => {
            pickCategory("fritext")
            setInputValue(`Jag vill ha en ${siteType.toLowerCase()}`)
            document
              .querySelector<HTMLTextAreaElement>('[data-openclaw-text-target="landing.freeform.primary"]')
              ?.focus()
          }}
          onBrowseTemplates={() => router.push("/templates")}
        />

        <LandingExempelStrip />

        {/* ━━━ HOW IT WORKS ━━━ */}
        <section
          id="hur-det-fungerar"
          className="px-6 py-20 md:py-28 border-t border-border/15"
          onMouseEnter={preloadHowItWorksScene}
          onFocusCapture={preloadHowItWorksScene}
        >
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">Hur det fungerar</p>
              <h2 className="text-2xl md:text-4xl text-foreground font-(--font-heading) tracking-tight text-balance mb-4">
                Från beskrivning till publicerad sajt
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed text-pretty">
                Beskriv företaget, se ett utkast, ändra det och publicera när det känns rätt.
              </p>
            </div>

            <HowItWorksLazy steps={landingJourneySteps} />
          </div>
        </section>

        {/* ━━━ PRICING ━━━ */}
        <section id="priser" className="overflow-visible border-t border-border/15 px-6 py-20 md:py-28">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-4 text-center text-2xl text-foreground font-(--font-heading) tracking-tight text-balance md:text-4xl">
              Priser
            </h2>
            <p className="mx-auto mb-10 max-w-2xl text-center text-muted-foreground text-pretty">
              Engångsköp. Du kan börja utan kreditkort. Credits används när du bygger, ändrar eller
              publicerar — inte som en månadsavgift.
            </p>
            <CreditPackageGrid
              disabled={isSubmitting}
              onSelect={(id) => {
                trackHomepageEvent("homepage_pricing", { package: id })
                router.push("/buy-credits")
              }}
              ctaLabel={(pkg) => creditPackageCopy[pkg.id].cta}
            />
            <LandingPricingExplainer />
          </div>
        </section>

        {/* ━━━ INTEGRATIONS SHOWCASE ━━━ */}
        <section className="px-6 py-18 md:py-24 border-b border-border/15">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">Funktioner</p>
              <h2 className="text-2xl md:text-4xl text-foreground font-(--font-heading) tracking-tight text-balance mb-4">
                När sajten behöver göra mer
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed text-pretty">
                Betalningar, bokningar, utskick och drift — när du behöver det, inte som krav för att börja.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {integrations.map((item, index) => (
                <IntegrationCard key={item.name} item={item} index={index} />
              ))}
            </div>
          </div>
        </section>

        {/* ━━━ CTA ━━━ */}
        <section className="px-6 py-20 md:py-28 border-t border-border/15">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
              <Rocket className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-2xl md:text-4xl text-foreground mb-4 font-(--font-heading) tracking-tight text-balance">
              Redo att ta ditt företag online?
            </h2>
            <p className="text-muted-foreground mb-8 leading-relaxed text-pretty max-w-md mx-auto">
              Börja med en beskrivning. Ett konto ger en första slutförd generering utan credit-drag.
              Inget kreditkort krävs för att starta.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="lg"
                data-homepage-cta="bottom"
                className="btn-3d btn-glow bg-primary text-primary-foreground hover:bg-primary-hover font-medium text-base px-8 shadow-lg shadow-primary/25"
                disabled={isSubmitting}
                onClick={() => {
                  const ctaCategory = selectedCategory === "audit" ? "fritext" : selectedCategory ?? "fritext"
                  void startBuild(ctaCategory, undefined, { location: "bottom" })
                }}
              >
                Skapa din sajt nu
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground text-base"
                onClick={() => {
                  trackHomepageEvent("homepage_examples", { source: "templates_link" })
                  router.push("/templates")
                }}
              >
                Se exempel
              </Button>
            </div>
          </div>
        </section>

        <LandingFooter />

      </div>

    </main>
  )
}
