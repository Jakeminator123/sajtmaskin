"use client"

/**
 * LanyardExperience — hjältens nyckelband med Sajtmaskins visitkort.
 *
 * Det statiska WebP-kortet SSR:as och är LCP. På kapabel desktop laddas
 * 3D-kortet (Three/Rapier) vid idle och monteras OVANFÖR stagen; först när
 * fysiken rapporterar sin första riktiga frame glider hela lanyarden ner på
 * plats. Laddtiden blir en avsiktlig entré i stället för ett stillbildskort
 * som byter pose. Mobil, reduced-motion och Save-Data hoppar över Three/Rapier
 * och behåller det statiska kortet.
 *
 * Cookie-samtycket bor inte här längre. Det var tidigare ett helskärmskort
 * på desktop som dolde hela startsidan (rigg V-05, SM-137); nu sköter den
 * globala cookie-remsan (`CookieBanner`) samtycket på alla rutter, och kortet
 * laddas oberoende av samtycket (det sätter inga cookies).
 */

import { Component, useCallback, useEffect, useState, type ReactNode } from "react"
import dynamic from "next/dynamic"
import {
  readLanyardStaticOnly,
  scheduleWhenIdle,
  usePrefersReducedMotion,
  useSaveData,
} from "@/components/landing-v2/landing-hooks"
import { StaticLanyardFallback } from "@/components/landing-v2/lanyard-static-fallback"

// Platshållaren syns bara om 3D-chunken laddas långsamt. Wrappern står ovanför
// stagen tills onReady, så i praktiken syns den aldrig.
const LanyardCard = dynamic(
  () => import("@/components/landing-v2/lanyard-card").then((m) => m.LanyardCard),
  { ssr: false, loading: () => <StaticLanyardFallback /> },
)

/** Om fysiken aldrig rapporterar redo (t.ex. pausad tabb) visas kortet ändå. */
const DROP_IN_FALLBACK_MS = 6000
const DROP_IN_HIDDEN_CLASS = "-translate-y-[120%] pointer-events-none"
const DROP_IN_SHOWN_CLASS =
  "translate-y-0 transition-transform duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)]"

/**
 * Fångar init-/renderfel från 3D-kortet (pr-ai-review F-713ac602fd01 på
 * #1026): kortet får aldrig dö för att WebGL är avstängt eller Canvas/Rapier
 * inte kan starta. Fallback = det statiska varumärkeskortet, så hjälteytan
 * aldrig blir tom.
 */
class LanyardErrorBoundary extends Component<
  { children: ReactNode; onFailed?: () => void },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    // Drop-in-wrappern håller innehållet ovanför stagen tills onReady —
    // fallbacken måste släppas ner direkt, annars gapar hero-ytan i 6 s.
    this.props.onFailed?.()
  }
  render() {
    if (this.state.failed) return <StaticLanyardFallback />
    return this.props.children
  }
}

export function LanyardExperience({ className = "" }: { className?: string }) {
  const reducedMotion = usePrefersReducedMotion()
  const saveData = useSaveData()
  const staticOnly = reducedMotion || saveData || readLanyardStaticOnly()
  const [loadPhysics, setLoadPhysics] = useState(false)
  const [physicsReady, setPhysicsReady] = useState(false)
  const handleReady = useCallback(() => setPhysicsReady(true), [])

  useEffect(() => {
    if (staticOnly) return
    return scheduleWhenIdle(() => setLoadPhysics(true))
  }, [staticOnly])

  const showPhysics = loadPhysics && !staticOnly

  useEffect(() => {
    if (!showPhysics || physicsReady) return
    const timer = window.setTimeout(() => setPhysicsReady(true), DROP_IN_FALLBACK_MS)
    return () => window.clearTimeout(timer)
  }, [showPhysics, physicsReady])

  const showStatic = !showPhysics || !physicsReady

  return (
    <div className={`relative h-full w-full ${className}`}>
      {showStatic && <StaticLanyardFallback />}
      {showPhysics && (
        <div
          data-testid="lanyard-stage-3d"
          className={`h-full w-full will-change-transform ${
            physicsReady ? DROP_IN_SHOWN_CLASS : DROP_IN_HIDDEN_CLASS
          }`}
        >
          <LanyardErrorBoundary onFailed={handleReady}>
            <LanyardCard className="h-full" onReady={handleReady} />
          </LanyardErrorBoundary>
        </div>
      )}
    </div>
  )
}
