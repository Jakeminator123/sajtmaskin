"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import type { landingJourneySteps } from "@/components/landing-v2/landing-chat-data"
import { HowItWorksFallback } from "@/components/landing-v2/landing-how-it-works-fallback"
import { usePrefersReducedMotion, useSaveData } from "@/components/landing-v2/landing-hooks"

const HowItWorksScene = dynamic(
  () => import("./how-it-works-scene").then((m) => m.HowItWorksScene),
  { ssr: false, loading: () => <HowItWorksFallback /> },
)

type Steps = typeof landingJourneySteps

/**
 * Loads the WebGL scene only after the section nears the viewport. Keeps the static
 * fallback (and never downloads the three.js chunk) for `prefers-reduced-motion` and
 * for save-data / slow connections — so weak networks stay fast and static.
 */
export function HowItWorksLazy({ steps }: { steps: Steps }) {
  const reduceMotion = usePrefersReducedMotion()
  const saveData = useSaveData()
  const staticOnly = reduceMotion || saveData
  const ref = useRef<HTMLDivElement>(null)
  const [showScene, setShowScene] = useState(false)

  useEffect(() => {
    if (staticOnly) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShowScene(true)
          observer.disconnect()
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px 18% 0px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [staticOnly])

  if (staticOnly) {
    return (
      <div ref={ref}>
        <HowItWorksFallback />
      </div>
    )
  }

  return (
    <div ref={ref}>
      {showScene ? <HowItWorksScene steps={steps} /> : <HowItWorksFallback />}
    </div>
  )
}
