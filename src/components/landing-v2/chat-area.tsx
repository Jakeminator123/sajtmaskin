"use client"

import { ArrowRight, CheckCircle2, Rocket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { LandingBackground } from "@/components/landing-v2/landing-background"
import { MinimalFooter } from "@/components/layout/minimal-footer"
import { LandingHero } from "@/components/landing-v2/landing-hero"
import {
  features,
  integrations,
  techStack,
  creditPackages,
  studioTeam,
  studioTiers,
} from "@/components/landing-v2/landing-chat-data"
import { FeatureCard, FeatureModal } from "@/components/landing-v2/landing-feature-blocks"
import { IntegrationCard, TechStackCard } from "@/components/landing-v2/landing-tech-integration-cards"
import { useLandingController, type ChatAreaProps } from "@/components/landing-v2/use-landing-controller"

export type { ChatAreaProps }

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
    activeCategory,
    isAuditMode,
    currentAuditUrl,
    handleAuditUrlChange,
    startBuild,
    submitPrimaryInput,
  } = useLandingController(props)

  return (
    <main className="landing-v2-page relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <LandingBackground
        selectedCategory={selectedCategory}
        isAuditMode={isAuditMode}
        activeCategory={activeCategory}
      />

      <div
        className="relative z-10 flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto overscroll-y-contain scroll-smooth [-webkit-overflow-scrolling:touch]"
        data-scroll-container
      >
        <LandingHero
          heroPrefix={heroPrefix}
          expandedContent={expandedContent}
          showVoiceRecorder={showVoiceRecorder}
          setShowVoiceRecorder={setShowVoiceRecorder}
          inputValue={inputValue}
          setInputValue={setInputValue}
          isSubmitting={isSubmitting}
          activeCategory={activeCategory}
          isAuditMode={isAuditMode}
          currentAuditUrl={currentAuditUrl}
          handleAuditUrlChange={handleAuditUrlChange}
          submitPrimaryInput={submitPrimaryInput}
          startBuild={startBuild}
        />

        {/* ━━━ TABBED CONTENT ━━━ */}
        <div className="border-t border-border/15">
          <Tabs defaultValue="funktioner" className="w-full">
            <div className="sticky top-0 z-20 bg-background/90 backdrop-blur-md border-b border-border/15">
              <div className="max-w-5xl mx-auto px-6">
                <TabsList variant="line" className="h-12 w-full justify-start gap-0">
                  <TabsTrigger value="funktioner" className="text-sm">Funktioner</TabsTrigger>
                  <TabsTrigger value="teknik" className="text-sm">Teknik</TabsTrigger>
                  <TabsTrigger value="priser" className="text-sm">Priser</TabsTrigger>
                </TabsList>
              </div>
            </div>

            {/* ── FUNKTIONER ── */}
            <TabsContent value="funktioner" className="mt-0">
              <section className="px-6 py-16 md:py-20">
                <div className="max-w-6xl mx-auto">
                  <div className="text-center mb-12">
                    <h2 className="text-2xl md:text-4xl text-foreground font-(--font-heading) tracking-tight mb-3">
                      Samma teknik som techbolagen
                    </h2>
                    <p className="text-muted-foreground max-w-lg mx-auto">
                      Produktionsklar kod i React, Next.js och TypeScript.
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
                </div>
              </section>

              <section className="px-6 py-16 border-t border-border/15">
                <div className="max-w-5xl mx-auto">
                  <div className="text-center mb-10">
                    <h2 className="text-2xl md:text-3xl text-foreground font-(--font-heading) tracking-tight mb-3">
                      Integrationer
                    </h2>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      Betalningar, utskick, data och drift — redo från start.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {integrations.map((item, index) => (
                      <IntegrationCard key={item.name} item={item} index={index} />
                    ))}
                  </div>
                </div>
              </section>
            </TabsContent>

            {/* ── TEKNIK ── */}
            <TabsContent value="teknik" className="mt-0">
              <section className="px-6 py-16 md:py-20">
                <div className="max-w-5xl mx-auto">
                  <div className="text-center mb-12">
                    <h2 className="text-2xl md:text-4xl text-foreground font-(--font-heading) tracking-tight mb-3">
                      Teknisk grund
                    </h2>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      Samma verktyg som de bästa digitala bolagen.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {techStack.map((tech, index) => (
                      <TechStackCard key={tech.name} tech={tech} index={index} />
                    ))}
                  </div>
                </div>
              </section>
            </TabsContent>

            {/* ── PRISER ── */}
            <TabsContent value="priser" className="mt-0">
              <section className="px-6 py-16 md:py-20">
                <div className="max-w-5xl mx-auto">
                  <div className="text-center mb-12">
                    <h2 className="text-2xl md:text-4xl text-foreground font-(--font-heading) tracking-tight mb-3">
                      Enkel prissättning
                    </h2>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      Köp credits, bygg i din takt. Inga bindningstider.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                    {creditPackages.map((pkg) => (
                      <div
                        key={pkg.id}
                        className={`rounded-2xl border p-7 flex flex-col gap-5 transition-all ${
                          pkg.popular
                            ? "bg-primary/5 border-primary/30 relative md:scale-105 md:-my-2 shadow-xl shadow-primary/5"
                            : "bg-card/50 border-border/20 hover:border-border/40"
                        }`}
                      >
                        {pkg.popular && (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground bg-primary px-3 py-1 rounded-full">
                            Populärast
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
                              ? "bg-primary text-primary-foreground hover:bg-primary/90"
                              : "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/30"
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

                  {/* SajtStudio upsell */}
                  <div className="mt-14 rounded-2xl border border-border/20 bg-card/50 p-6 md:p-8">
                    <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
                      <div>
                        <p className="text-xs font-medium text-primary tracking-widest uppercase mb-2">SajtStudio</p>
                        <h3 className="text-xl md:text-2xl font-(--font-heading) text-foreground tracking-tight mb-3">
                          Behöver du ett team?
                        </h3>
                        <p className="text-sm text-muted-foreground mb-5">
                          Vi hjälper till med strategi, design, integrationer och lansering.
                        </p>
                        <div className="space-y-2 mb-5">
                          {studioTeam.map((member) => (
                            <div key={member.name} className="flex items-center gap-3 rounded-xl border border-border/15 bg-background/50 px-3 py-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-(--font-heading) text-primary">
                                {member.name.slice(0, 1)}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">{member.name}</p>
                                <p className="text-xs text-muted-foreground">{member.role}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <Button
                          className="bg-primary text-primary-foreground hover:bg-primary/90"
                          onClick={() => { window.location.href = "mailto:ch.genberg@gmail.com,erik@sajtstudio.se" }}
                        >
                          Prata med teamet
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        {studioTiers.map((tier) => (
                          <div key={tier.name} className="rounded-xl border border-border/20 p-4 bg-background/50">
                            <p className="text-xs uppercase tracking-wider text-primary/70 mb-2">{tier.name}</p>
                            <p className="text-lg font-(--font-heading) text-foreground">{tier.range}</p>
                            <p className="mt-1.5 text-sm text-muted-foreground">{tier.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </TabsContent>
          </Tabs>
        </div>

        {/* ━━━ BOTTOM CTA ━━━ */}
        <section className="px-6 py-16 border-t border-border/15">
          <div className="max-w-lg mx-auto text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-5">
              <Rocket className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-2xl md:text-3xl text-foreground font-(--font-heading) tracking-tight mb-3">
              Redo?
            </h2>
            <p className="text-muted-foreground mb-6">
              Gratis att börja. Ingen kod krävs.
            </p>
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium px-8"
              disabled={isSubmitting}
              onClick={() => {
                const cat = selectedCategory === "audit" ? "fritext" : selectedCategory ?? "fritext"
                void startBuild(cat)
              }}
            >
              Skapa din sajt
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </section>

        <MinimalFooter />
      </div>

      <FeatureModal feature={activeFeature} onClose={() => setActiveFeature(null)} />
    </main>
  )
}
