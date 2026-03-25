"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import type { landingJourneySteps } from "@/components/landing-v2/landing-chat-data"
import { HowItWorksFallback } from "@/components/landing-v2/landing-how-it-works-fallback"
import { usePrefersReducedMotion } from "@/components/landing-v2/landing-hooks"

const HowItWorksScene = dynamic(
  () => import("./how-it-works-scene").then((m) => m.HowItWorksScene),
  { ssr: false, loading: () => <HowItWorksFallback /> },
)

type Steps = typeof landingJourneySteps

/**
 * Loads the WebGL scene only after the section nears the viewport; keeps static fallback
 * for `prefers-reduced-motion` (same pattern as other landing 3D).
 */
export function HowItWorksLazy({ steps }: { steps: Steps }) {
  const reduceMotion = usePrefersReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const [showScene, setShowScene] = useState(false)

  useEffect(() => {
    if (reduceMotion) return
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
  }, [reduceMotion])

  if (reduceMotion) {
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
