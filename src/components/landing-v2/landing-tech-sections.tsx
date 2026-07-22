"use client"

import { Check } from "lucide-react"
import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type MutableRefObject } from "react"
import {
  comparisonMethods,
  comparisonParameters,
  comparisonScenarios,
  features,
  getComparisonScore,
  techStack,
  type ComparisonScenarioId,
} from "@/components/landing-v2/landing-chat-data"
import { ComparisonRadarChart } from "@/components/landing-v2/landing-comparison-radar"
import { FeatureCard, FeatureModal } from "@/components/landing-v2/landing-feature-blocks"
import { LighthouseGauges } from "@/components/landing-v2/landing-lighthouse-gauges"
import { usePrefersReducedMotion, useTerminalTypewriter } from "@/components/landing-v2/landing-hooks"
import { TechStackCard } from "@/components/landing-v2/landing-tech-integration-cards"

/**
 * Teknik-tunga landningssektioner (features, byggmetod-jämförelse, tech-stack + terminal).
 *
 * Flyttade från förstasidan (`chat-area.tsx`) till egen `/teknik`-sida för att hålla
 * startsidan stram och företagsriktad. Självständig lokal state — inget beroende av
 * `use-landing-controller.ts` (minsta möjliga diff där, ingen delad koppling).
 */
export function LandingTechSections() {
  const [activeFeature, setActiveFeature] = useState<(typeof features)[number] | null>(null)
  const [activeComparisonScenarioId, setActiveComparisonScenarioId] = useState<ComparisonScenarioId>("growth")
  const [selectedComparisonMethodKey, setSelectedComparisonMethodKey] = useState("next")

  const activeComparisonScenario =
    comparisonScenarios.find((scenario) => scenario.id === activeComparisonScenarioId) ?? comparisonScenarios[0]!

  const rankedComparisonMethods = useMemo(
    () =>
      comparisonMethods
        .map((method) => ({
          method,
          total: getComparisonScore(method, activeComparisonScenario),
        }))
        .sort((a, b) => b.total - a.total),
    [activeComparisonScenario],
  )

  const fallbackComparisonMethod = comparisonMethods[0]!
  const selectedComparisonMethod = useMemo(
    () =>
      rankedComparisonMethods.find((entry) => entry.method.key === selectedComparisonMethodKey) ?? {
        method: fallbackComparisonMethod,
        total: getComparisonScore(fallbackComparisonMethod, activeComparisonScenario),
      },
    [activeComparisonScenario, fallbackComparisonMethod, rankedComparisonMethods, selectedComparisonMethodKey],
  )

  const wordpressComparisonMethod =
    comparisonMethods.find((method) => method.key === "wordpress") ?? fallbackComparisonMethod
  const wordpressScenarioScore = getComparisonScore(wordpressComparisonMethod, activeComparisonScenario)
  const selectedVsWordpressDelta = selectedComparisonMethod.total - wordpressScenarioScore

  const terminal = useTerminalTypewriter()
  const terminalBoxRef = useRef<HTMLDivElement>(null)
  const handleTerminalMouse = (e: ReactMouseEvent) => {
    const el = terminalBoxRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    el.style.setProperty("--term-glow-x", `${e.clientX - rect.left}px`)
    el.style.setProperty("--term-glow-y", `${e.clientY - rect.top}px`)
  }

  const reduceMotion = usePrefersReducedMotion()
  const terminalCursorClass = reduceMotion
    ? "inline-block w-2 h-4 bg-primary/80 ml-1 align-text-bottom opacity-90"
    : "inline-block w-2 h-4 bg-primary/80 ml-1 animate-pulse align-text-bottom"

  return (
    <>
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

      <FeatureModal feature={activeFeature} onClose={() => setActiveFeature(null)} />
    </>
  )
}
