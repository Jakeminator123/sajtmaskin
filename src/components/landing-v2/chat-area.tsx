"use client"

import { useEffect } from "react"
import { LandingBackground } from "@/components/landing-v2/landing-background"
import { LandingHero } from "@/components/landing-v2/landing-hero"
import { LandingTrustMarquee } from "@/components/landing-v2/landing-trust-marquee"
import { useLandingController, type ChatAreaProps } from "@/components/landing-v2/use-landing-controller"

export type { ChatAreaProps }

/**
 * Startsidans yta: hero + trust-rad längst ner. Övriga sektioner bor på
 * /hur-det-fungerar, /priser, /faq och /teknik — samma mönster som när
 * features flyttades till /teknik.
 */
export function ChatArea(props: ChatAreaProps = {}) {
  const { expandedContent, heroPrefix, onPlayIntro } = props
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
    activeCategory,
    isAuditMode,
    currentAuditUrl,
    handleAuditUrlChange,
    submitPrimaryInput,
  } = useLandingController(props)

  // Legacy-djuplänkar: sektioner som tidigare låg under hero på /.
  useEffect(() => {
    const redirectLegacyHash = () => {
      const hash = window.location.hash
      if (hash === "#funktioner" || hash === "#teknik") {
        router.replace(`/teknik${hash}`)
        return
      }
      if (hash === "#hur-det-fungerar") {
        router.replace("/hur-det-fungerar")
        return
      }
      if (hash === "#priser") {
        router.replace("/priser")
      }
    }
    redirectLegacyHash()
    window.addEventListener("hashchange", redirectLegacyHash)
    return () => window.removeEventListener("hashchange", redirectLegacyHash)
  }, [router])

  return (
    <main className="landing-v2-page relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <LandingBackground
        selectedCategory={selectedCategory}
        isAuditMode={isAuditMode}
        activeCategory={activeCategory}
      />

      {/* Ingen inre scroll — hero fyller ytan, trust-raden sitter längst ner. */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        <LandingHero
          heroPrefix={heroPrefix}
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
        <LandingTrustMarquee />
      </div>
    </main>
  )
}
