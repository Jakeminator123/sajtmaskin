"use client"

import { Check, ArrowRight, CheckCircle2, Rocket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { type MutableRefObject } from "react"
import { LanyardBadge } from "@/components/landing-v2/lanyard-badge"
import { LandingBackground } from "@/components/landing-v2/landing-background"
import { LandingFooter } from "@/components/landing-v2/landing-footer"
import { LandingHero } from "@/components/landing-v2/landing-hero"
import {
  comparisonParameters,
  comparisonScenarios,
  features,
  integrations,
  landingJourneySteps,
  studioTeam,
  studioTiers,
  techStack,
  trustLogos,
  creditPackages,
} from "@/components/landing-v2/landing-chat-data"
import { ComparisonRadarChart } from "@/components/landing-v2/landing-comparison-radar"
import { FeatureCard, FeatureModal } from "@/components/landing-v2/landing-feature-blocks"
import { HowItWorksLazy } from "@/components/landing-v2/landing-how-it-works-lazy"
import { LighthouseGauges } from "@/components/landing-v2/landing-lighthouse-gauges"
import { usePrefersReducedMotion } from "@/components/landing-v2/landing-hooks"
import { IntegrationCard, TechStackCard } from "@/components/landing-v2/landing-tech-integration-cards"
import { useLandingController, type ChatAreaProps } from "@/components/landing-v2/use-landing-controller"

export type { ChatAreaProps }

/* ──────────────────── MAIN COMPONENT ──────────────────── */

export function ChatArea(props: ChatAreaProps = {}) {
  const { expandedContent, heroPrefix } = props
  const {
    router,
    showVoiceRecorder,
    setShowVoiceRecorder,
    selectedCategory,
    pickCategory,
    inputValue,
    setInputValue,
    isSubmitting,
    activeFeature,
    setActiveFeature,
    setActiveComparisonScenarioId,
    setSelectedComparisonMethodKey,
    activeComparisonScenario,
    rankedComparisonMethods,
    selectedComparisonMethod,
    wordpressComparisonMethod,
    selectedVsWordpressDelta,
    websitesCounter,
    usersCounter,
    rotatingType,
    headlineTilt,
    terminal,
    terminalBoxRef,
    handleTerminalMouse,
    preloadHowItWorksScene,
    activeCategory,
    isAuditMode,
    currentAuditUrl,
    handleAuditUrlChange,
    startBuild,
    submitPrimaryInput,
  } = useLandingController(props)

  const reduceMotion = usePrefersReducedMotion()
  const terminalCursorClass = reduceMotion
    ? "inline-block w-2 h-4 bg-primary/80 ml-1 align-text-bottom opacity-90"
    : "inline-block w-2 h-4 bg-primary/80 ml-1 animate-pulse align-text-bottom"

  return (
    <main className="landing-v2-page relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <LandingBackground
        selectedCategory={selectedCategory}
        isAuditMode={isAuditMode}
        activeCategory={activeCategory}
      />

      {/* Scrollable content */}
      <div
        className="relative z-10 flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto overscroll-y-contain scroll-smooth [-webkit-overflow-scrolling:touch]"
        data-scroll-container
      >

        <LandingHero
          heroPrefix={heroPrefix}
          expandedContent={expandedContent}
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
          <p className="text-xs text-muted-foreground/60 text-center mb-1.5 tracking-widest uppercase">
            Byggd med samma teknik som
          </p>
          <p className="text-[10px] text-muted-foreground/40 text-center mb-6">
            Dessa f&ouml;retag anv&auml;nder React &amp; Next.js &mdash; samma ramverk vi bygger din sajt med
          </p>
          <div className="relative overflow-hidden">
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

        {/* ━━━ FEATURES - TECH FOCUS ━━━ */}
        <section id="funktioner" className="px-6 py-20 md:py-28">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">State of the Art</p>
              <h2 className="text-2xl md:text-4xl text-foreground font-(--font-heading) tracking-tight text-balance mb-4">
                Samma teknik som tech-j&auml;ttarna
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed text-pretty">
                Vi levererar sajter byggda med produktionsklar kod i React, Next.js och TypeScript &mdash; inte dra-och-sl&auml;pp-byggen som faller ihop.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {features.map((feature, i) => (
                <FeatureCard
                  key={feature.title}
                  feature={feature}
                  onClick={() => setActiveFeature(feature)}
                  index={i}
                />
              ))}
            </div>

            <LighthouseGauges />
          </div>
        </section>

        {/* ━━━ SITE BUILD METHOD COMPARISON ━━━ */}
        <section className="px-6 py-20 md:py-28 border-t border-border/15">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-8">
              <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">J&auml;mf&ouml;relse</p>
              <h2 className="text-2xl md:text-4xl text-foreground font-(--font-heading) tracking-tight text-balance mb-3">
                Olika s&auml;tt att bygga sajt
              </h2>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed text-pretty">
                Se hur vi st&aring;r oss j&auml;mf&ouml;rt med andra alternativ &mdash; och varf&ouml;r det spelar roll f&ouml;r ditt f&ouml;retag.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
              {comparisonScenarios.map((scenario) => {
                const isActive = scenario.id === activeComparisonScenario.id
                return (
                  <button
                    key={scenario.id}
                    onClick={() => setActiveComparisonScenarioId(scenario.id)}
                    aria-pressed={isActive}
                    className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                      isActive
                        ? "bg-primary/12 border-primary/40 text-foreground shadow-lg shadow-primary/5"
                        : "bg-secondary/40 border-border/20 text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                    }`}
                  >
                    {scenario.label}
                  </button>
                )
              })}
            </div>

            <div className="grid gap-5 lg:grid-cols-[260px_1fr] items-start">
              {/* Compact ranking list */}
              <div className="rounded-2xl border border-border/20 overflow-hidden bg-card/30 backdrop-blur-sm">
                <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider border-b border-border/20 text-muted-foreground flex items-center justify-between">
                  <span>Ranking</span>
                  <span>Po&auml;ng</span>
                </div>
                {rankedComparisonMethods.map((entry, index) => {
                  const isSelected = entry.method.key === selectedComparisonMethod.method.key
                  return (
                    <button
                      key={entry.method.key}
                      onClick={() => setSelectedComparisonMethodKey(entry.method.key)}
                      aria-pressed={isSelected}
                      className={`w-full text-left px-3 py-2 border-b border-border/8 transition-all cursor-pointer flex items-center gap-2 group ${
                        isSelected ? "bg-primary/8" : "hover:bg-secondary/25"
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] shrink-0 transition-colors ${
                          isSelected
                            ? "border-primary/50 text-primary bg-primary/10"
                            : "border-border/30 text-muted-foreground group-hover:border-border/50"
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span className={`text-xs truncate flex-1 transition-colors ${isSelected ? "text-foreground font-medium" : "text-foreground/80"}`}>
                        {entry.method.label}
                      </span>
                      <span className={`text-sm tabular-nums font-(--font-heading) transition-colors ${isSelected ? "text-primary" : "text-foreground/70"}`}>
                        {entry.total}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Radar chart + legend + detail */}
              <div className="space-y-4">
                <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-sm p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
                    <div className="flex items-center gap-4 text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-primary/80" />
                        <span className="text-foreground/80 font-medium">{selectedComparisonMethod.method.label}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                        <span className="text-muted-foreground">WordPress</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-primary font-semibold text-[11px] tabular-nums">
                        {selectedComparisonMethod.total}/100
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium tabular-nums ${
                          selectedVsWordpressDelta >= 0
                            ? "border-primary/25 text-primary/90 bg-primary/5"
                            : "border-destructive/35 text-destructive/90 bg-destructive/5"
                        }`}
                      >
                        {selectedVsWordpressDelta >= 0 ? `+${selectedVsWordpressDelta}` : selectedVsWordpressDelta} vs&nbsp;WP
                      </span>
                    </div>
                  </div>

                  <ComparisonRadarChart
                    method={selectedComparisonMethod.method}
                    wpMethod={wordpressComparisonMethod}
                    parameters={comparisonParameters}
                    scenario={activeComparisonScenario}
                  />
                </div>

                {/* Compact method summary */}
                <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-sm p-4">
                  <h3 className="text-sm text-foreground font-(--font-heading) mb-1">{selectedComparisonMethod.method.label}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">{selectedComparisonMethod.method.summary}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedComparisonMethod.method.strengths.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1 text-[11px] text-foreground/80 bg-primary/5 border border-primary/15 rounded-full px-2.5 py-0.5">
                        <Check className="w-2.5 h-2.5 text-primary shrink-0" />
                        {s}
                      </span>
                    ))}
                    {selectedComparisonMethod.method.caveats.map((c) => (
                      <span key={c} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/80 bg-secondary/40 border border-border/15 rounded-full px-2.5 py-0.5">
                        <span className="text-chart-4">&#9888;</span>
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ━━━ TECH STACK SHOWCASE ━━━ */}
        <section id="teknik" className="px-6 py-20 md:py-28 border-t border-border/15">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">Teknisk grund</p>
              <h2 className="text-2xl md:text-4xl text-foreground font-(--font-heading) tracking-tight text-balance mb-4">
                Riktig teknik bakom varje sajt
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto leading-relaxed text-pretty">
                Samma verktyg som de b&auml;sta digitala bolagen &mdash; paketerat s&aring; att du inte beh&ouml;ver t&auml;nka p&aring; det.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {techStack.map((tech, index) => (
                <TechStackCard key={tech.name} tech={tech} index={index} />
              ))}
            </div>

            {/* Terminal-style code snippet with typewriter + cursor glow */}
            <div
              ref={(node) => {
                /* Terminal typewriter + mus-glow delar samma DOM-nod; avsedd ref-merge. */
                /* eslint-disable react-hooks/immutability -- .current på ref-objekt från hook + useRef */
                ;(terminal.containerRef as MutableRefObject<HTMLDivElement | null>).current = node
                ;(terminalBoxRef as MutableRefObject<HTMLDivElement | null>).current = node
                /* eslint-enable react-hooks/immutability */
              }}
              onMouseMove={handleTerminalMouse}
              className="group/term relative mt-12 overflow-hidden rounded-[28px] border border-border/20 bg-card/35 shadow-[0_28px_80px_rgba(5,10,20,0.35)]"
              style={{
                ["--term-glow-x" as string]: "50%",
                ["--term-glow-y" as string]: "50%",
              }}
            >
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-primary/35 to-transparent" />

              {/* Mouse-follow radial glow */}
              <div
                className="pointer-events-none absolute inset-0 z-10 opacity-0 group-hover/term:opacity-100 transition-opacity duration-300"
                style={{
                  background:
                    "radial-gradient(320px circle at var(--term-glow-x, 50%) var(--term-glow-y, 50%), rgba(45,212,191,0.08) 0%, transparent 70%)",
                }}
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_40%,rgba(45,212,191,0.04)_100%)]" />

              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/15 relative z-20">
                <div className="w-3 h-3 rounded-full bg-destructive/60" />
                <div className="w-3 h-3 rounded-full bg-chart-4/60" />
                <div className="w-3 h-3 rounded-full bg-primary/60" />
                <span className="ml-2 text-xs text-muted-foreground font-mono">sajtmaskin generate</span>
                <span className="ml-auto rounded-full border border-primary/15 bg-primary/8 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-primary/80">
                  Build pipeline
                </span>
              </div>
              <div className="p-5 font-mono text-sm leading-relaxed relative z-20">
                {/* Line 1 */}
                <p className={`text-muted-foreground transition-all duration-500 ${terminal.visibleLines >= 1 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}>
                  <span className="text-primary">$</span> npx sajtmaskin generate --type=webbplats
                  {terminal.cursorLine === 1 && <span className={terminalCursorClass} />}
                </p>
                {/* Line 2 */}
                <p className={`text-muted-foreground mt-2 transition-all duration-500 ${terminal.visibleLines >= 2 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}>
                  <span className="text-primary/70">{">"}</span> Analyserar f&ouml;retagsbeskrivning...
                  {terminal.cursorLine === 2 && <span className={terminalCursorClass} />}
                </p>
                {/* Line 3 */}
                <p className={`text-muted-foreground transition-all duration-500 ${terminal.visibleLines >= 3 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}>
                  <span className="text-primary/70">{">"}</span> Genererar React-komponenter...
                  {terminal.cursorLine === 3 && <span className={terminalCursorClass} />}
                </p>
                {/* Line 4 */}
                <p className={`text-muted-foreground transition-all duration-500 ${terminal.visibleLines >= 4 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}>
                  <span className="text-primary/70">{">"}</span> Konfigurerar Next.js routing...
                  {terminal.cursorLine === 4 && <span className={terminalCursorClass} />}
                </p>
                {/* Line 5 */}
                <p className={`text-muted-foreground transition-all duration-500 ${terminal.visibleLines >= 5 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}>
                  <span className="text-primary/70">{">"}</span> Optimerar f&ouml;r Lighthouse 95+...
                  {terminal.cursorLine === 5 && <span className={terminalCursorClass} />}
                </p>
                {/* Line 6 - success */}
                <p className={`mt-2 transition-all duration-700 ${terminal.visibleLines >= 6 ? "opacity-100 translate-x-0 text-foreground" : "opacity-0 -translate-x-4 text-muted-foreground"}`}>
                  <span className="text-primary">{"✓"}</span> Klar! Publicerad till{" "}
                  <span className="text-primary underline">mittforetag.sajtmaskin.se</span>
                  {terminal.cursorLine === 6 && <span className={terminalCursorClass} />}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ━━━ LANYARD BADGE ━━━ */}
        <section className="relative border-t border-border/15 overflow-hidden">
          <div className="max-w-3xl mx-auto px-6 pt-16 pb-0 text-center">
            <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">Kvalitet i leveransen</p>
            <h2 className="text-2xl md:text-3xl text-foreground font-(--font-heading) tracking-tight text-balance mb-2">
              Sajter som ser bra ut och konverterar
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed text-pretty">
              Vi bygger f&ouml;r riktiga f&ouml;retag: tydlig struktur, snabb prestanda och design som leder till fler f&ouml;rfr&aring;gningar.
            </p>
          </div>
          <LanyardBadge />
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

        {/* ━━━ HONEST COUNTER STRIP ━━━ */}
        <section className="px-6 py-14 border-t border-b border-border/15 bg-secondary/20">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-center gap-10 md:gap-20">
            {[websitesCounter, usersCounter].map((counter, idx) => (
              <div key={idx} className="flex flex-col items-center">
                {idx > 0 && <div className="hidden md:block absolute w-px h-12 bg-border/30" style={{ marginLeft: "-5rem" }} />}
                <div className="text-center" ref={counter.ref}>
                  <p
                    className={`text-3xl md:text-4xl font-(--font-heading) transition-all duration-300 ${
                      counter.phase === "glitch"
                        ? "text-destructive animate-pulse scale-110"
                        : counter.phase === "honest"
                          ? "text-primary"
                          : "text-primary"
                    }`}
                  >
                    <span className={counter.phase === "glitch" ? "inline-block animate-pulse" : ""}>
                      {counter.phase === "honest"
                        ? counter.count
                        : counter.count.toLocaleString("sv-SE") + "+"}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {idx === 0 ? "Webbplatser skapade" : "Aktiva f\u00f6retagare"}
                  </p>
                  {counter.phase === "honest" && (
                    <p className="text-xs mt-2.5 max-w-[280px] leading-relaxed animate-fade-up text-muted-foreground italic">
                      {counter.message}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {websitesCounter.phase === "honest" && (
            <p className="text-center text-xs text-muted-foreground/50 mt-6 animate-fade-up" style={{ animationDelay: "0.3s" }}>
              Vi v&auml;xer med riktiga f&ouml;retag i ryggen &mdash; varje sajt &auml;r byggd f&ouml;r att driva aff&auml;rer, inte bara finnas.
            </p>
          )}
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

        {/* ━━━ PRICING ━━━ */}
        <section id="priser" className="px-6 py-20 md:py-28">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">Priser</p>
              <h2 className="text-2xl md:text-4xl text-foreground font-(--font-heading) tracking-tight text-balance mb-4">
                Starta själv. Ta in oss när det behövs.
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed text-pretty">
                Börja med credits och jobba i din egen takt. När du vill vässa strategi, design eller integrationer finns vi som ett team bredvid dig.
              </p>
              <div className="inline-flex items-center gap-2 mt-5 text-xs font-medium text-primary bg-primary/8 border border-primary/15 px-4 py-1.5 rounded-full flex-wrap justify-center">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                <span>Credits gäller för alltid och köps som engångspaket utan bindningstid.</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              {creditPackages.map((pkg) => (
                <div
                  key={pkg.id}
                  className={`card-3d rounded-2xl border p-7 flex flex-col gap-5 transition-all duration-300 ${
                    pkg.popular
                      ? "bg-primary/5 border-primary/30 relative md:scale-105 md:-my-2 shadow-xl shadow-primary/5"
                      : "bg-card/50 border-border/20 hover:border-border/40"
                  }`}
                >
                  {pkg.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground bg-primary px-3 py-1 rounded-full">
                      Popul\u00e4rast
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg text-foreground font-(--font-heading)">{pkg.name}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">{pkg.description}</p>
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl text-foreground font-(--font-heading)">{pkg.price} kr</span>
                    <span className="text-sm text-muted-foreground mb-1">{pkg.credits} credits</span>
                  </div>
                  <p className="text-xs text-muted-foreground -mt-2">
                    {(pkg.price / pkg.credits).toFixed(1)} kr/credit
                    {pkg.savings > 0 ? ` • spara ${pkg.savings}%` : ""}
                  </p>
                  <div className="h-px bg-border/20" />
                  <ul className="space-y-3 flex-1">
                    {pkg.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className={`w-full font-medium mt-2 ${
                      pkg.popular
                        ? "btn-3d btn-glow bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
                        : "btn-3d bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/30"
                    }`}
                    onClick={() => router.push("/buy-credits")}
                    disabled={isSubmitting}
                  >
                    {pkg.cta}
                    {pkg.popular && <ArrowRight className="w-4 h-4 ml-2" />}
                  </Button>
                </div>
              ))}
            </div>

            <div className="mt-14 rounded-[32px] border border-border/20 bg-card/35 p-6 md:p-8 shadow-[0_24px_70px_rgba(6,10,20,0.2)]">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
                <div>
                  <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">SajtStudio</p>
                  <h3 className="text-2xl md:text-3xl font-(--font-heading) text-foreground tracking-tight text-balance">
                    Behöver du ett team som hoppar in?
                  </h3>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    När credits inte räcker för allt runtomkring kan vi hjälpa till med struktur, copy, design, integrationer och sista biten fram till lansering.
                  </p>

                  <div className="mt-5 space-y-3">
                    {studioTeam.map((member) => (
                      <div key={member.name} className="flex items-center gap-3 rounded-2xl border border-border/15 bg-background/35 px-3 py-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-sm font-(--font-heading) text-primary">
                          {member.name.slice(0, 1)}
                        </div>
                        <div>
                          <p className="text-sm font-(--font-heading) text-foreground">{member.name}</p>
                          <p className="text-xs text-muted-foreground">{member.role}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button
                      className="btn-3d btn-glow bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
                      onClick={() => {
                        window.location.href = "mailto:jakob.olof.eberg@gmail.com,erik@sajtstudio.se"
                      }}
                    >
                      Prata med teamet
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                    <p className="text-xs text-muted-foreground self-center">
                      Vi svarar personligt om scope, tempo och vad som är rimligt att bygga vidare på.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {studioTiers.map((tier, index) => (
                    <div
                      key={tier.name}
                      className={`rounded-[24px] border p-5 bg-background/35 ${
                        index === 1 ? "border-primary/30 shadow-[0_16px_40px_rgba(8,145,178,0.12)]" : "border-border/20"
                      }`}
                    >
                      <p className="text-xs uppercase tracking-[0.18em] text-primary/70">{tier.name}</p>
                      <p className="mt-3 text-lg font-(--font-heading) text-foreground">{tier.range}</p>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tier.description}</p>
                    </div>
                  ))}
                </div>
              </div>
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
              Redo att ta ditt f&ouml;retag online?
            </h2>
            <p className="text-muted-foreground mb-8 leading-relaxed text-pretty max-w-md mx-auto">
              B&ouml;rja gratis &mdash; ingen kod, inga kreditkort, inga bindningstider. En sajt som ser seri&ouml;s ut fr&aring;n dag ett.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="lg"
                className="btn-3d btn-glow bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-base px-8 shadow-lg shadow-primary/25"
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

      <FeatureModal feature={activeFeature} onClose={() => setActiveFeature(null)} />
    </main>
  )
}

