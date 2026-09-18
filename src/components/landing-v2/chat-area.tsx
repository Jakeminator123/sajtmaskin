"use client"

import { useEffect } from "react"
import { ArrowRight, Rocket } from "lucide-react"
import { CreditPackageGrid } from "@/components/billing/CreditPackageGrid"
import { creditPackageCopy } from "@/lib/billing/credit-package-copy"
import { Button } from "@/components/ui/button"
import { LandingBackground } from "@/components/landing-v2/landing-background"
import { LandingExempelStrip } from "@/components/landing-v2/landing-exempel-strip"
import { LandingFooter } from "@/components/landing-v2/landing-footer"
import { LandingHero } from "@/components/landing-v2/landing-hero"
import {
  integrations,
  landingJourneySteps,
  trustLogos,
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

        {/* ━━━ TRUST MARQUEE ━━━ */}
        <section className="py-10 border-t border-border/15">
          <p className="text-xs text-muted-foreground/60 text-center mb-6 tracking-widest uppercase">
            Samma tekniska grund som v&auml;rldens ledande varum&auml;rken litar p&aring;
          </p>
          <div className="relative overflow-hidden" aria-hidden="true">
            <div className="absolute inset-y-0 left-0 w-32 bg-linear-to-r from-background to-transparent z-10 pointer-events-none" />
            <div className="absolute inset-y-0 right-0 w-32 bg-linear-to-l from-background to-transparent z-10 pointer-events-none" />
            <div className="flex animate-marquee whitespace-nowrap">
              {[...trustLogos, ...trustLogos].map((name, i) => (
                <span
                  key={`${name}-${i}`}
                  className="mx-10 text-base md:text-lg text-muted-foreground/30 font-(--font-heading) tracking-tight select-none"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </section>

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
                Från bolagsstart till gröna siffror
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed text-pretty">
                Fr&aring;n f&ouml;rsta id&eacute; till publicerad sajt &mdash; steg f&ouml;r steg, i din takt.
              </p>
            </div>

            <HowItWorksLazy steps={landingJourneySteps} />
          </div>
        </section>

        {/* ━━━ INTEGRATIONS SHOWCASE ━━━ */}
        <section className="px-6 py-18 md:py-24 border-b border-border/15">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">Integrationer</p>
              <h2 className="text-2xl md:text-4xl text-foreground font-(--font-heading) tracking-tight text-balance mb-4">
                Redo för riktiga arbetsflöden
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed text-pretty">
                N&auml;r sajten beh&ouml;ver g&ouml;ra mer &auml;n se bra ut &mdash; betalningar, utskick, data och drift.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {integrations.map((item, index) => (
                <IntegrationCard key={item.name} item={item} index={index} />
              ))}
            </div>
          </div>
        </section>

        <LandingExempelStrip />

        {/* ━━━ PRICING ━━━ */}
        <section id="priser" className="overflow-visible px-6 py-20 md:py-28">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-10 text-center text-2xl text-foreground font-(--font-heading) tracking-tight text-balance md:mb-14 md:text-4xl">
              Priser
            </h2>
            <CreditPackageGrid
              disabled={isSubmitting}
              onSelect={() => router.push("/buy-credits")}
              ctaLabel={(pkg) => creditPackageCopy[pkg.id].cta}
            />
          </div>
        </section>

        {/* ━━━ CTA ━━━ */}
        <section className="px-6 py-20 md:py-28 border-t border-border/15">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
              <Rocket className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-2xl md:text-4xl text-foreground mb-4 font-(--font-heading) tracking-tight text-balance">
              Redo att ta ditt f&ouml;retag online?
            </h2>
            <p className="text-muted-foreground mb-8 leading-relaxed text-pretty max-w-md mx-auto">
              B&ouml;rja gratis &mdash; ingen kod, inga kreditkort, inga bindningstider. En sajt som ser seri&ouml;s ut fr&aring;n dag ett.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="lg"
                className="btn-3d btn-glow bg-primary text-primary-foreground hover:bg-primary-hover font-medium text-base px-8 shadow-lg shadow-primary/25"
                disabled={isSubmitting}
                onClick={() => {
                  const ctaCategory = selectedCategory === "audit" ? "fritext" : selectedCategory ?? "fritext"
                  void startBuild(ctaCategory)
                }}
              >
                Skapa din sajt nu
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground text-base"
                onClick={() => router.push("/templates")}
              >
                Se en demo
              </Button>
            </div>
          </div>
        </section>

        <LandingFooter />

      </div>

    </main>
  )
}
