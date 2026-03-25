"use client"

import { Check, ArrowRight, CheckCircle2, Rocket, X } from "lucide-react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import {
  useCallback,
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type ReactNode,
} from "react"
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
  type ComparisonMethod,
  type ComparisonParameter,
  type ComparisonScenario,
  type IntegrationItem,
  type ShapeVariant,
  type TechStackItem,
} from "@/components/landing-v2/landing-chat-data"
import { use3DTilt, useInView } from "@/components/landing-v2/landing-hooks"
import { useLandingController, type ChatAreaProps } from "@/components/landing-v2/use-landing-controller"

export type { ChatAreaProps }

const HowItWorksScene = dynamic(
  () => import("./how-it-works-scene").then((mod) => mod.HowItWorksScene),
  { ssr: false, loading: () => <HowItWorksFallback /> },
)

/* ──────────────────── 3D WIREFRAME COMPONENTS ──────────────────── */

const modalParticles = [
  { x: 22, y: 28, dur: 4.2, delay: -1.3 },
  { x: 72, y: 18, dur: 3.7, delay: -0.5 },
  { x: 38, y: 72, dur: 5.1, delay: -2.4 },
  { x: 58, y: 35, dur: 3.9, delay: -1.8 },
  { x: 28, y: 58, dur: 4.5, delay: -3.1 },
  { x: 78, y: 62, dur: 3.3, delay: -0.9 },
  { x: 48, y: 22, dur: 4.8, delay: -2.7 },
  { x: 65, y: 78, dur: 3.6, delay: -1.6 },
]

type MeshProps = { size: number; className: string; borderOpacity?: number }

function CubeMesh({ size, className, borderOpacity = 0.2 }: MeshProps) {
  const half = size / 2
  const face = (transform: string) => ({
    position: "absolute" as const,
    width: size,
    height: size,
    border: `1px solid oklch(0.72 0.15 192 / ${borderOpacity})`,
    background: `oklch(0.72 0.15 192 / 0.02)`,
    transform,
  })
  return (
    <div
      className={className}
      style={{
        width: size, height: size,
        transformStyle: "preserve-3d" as const,
        position: "absolute" as const,
        left: "50%", top: "50%",
        marginLeft: -half, marginTop: -half,
      }}
    >
      <div style={face(`translateZ(${half}px)`)} />
      <div style={face(`rotateY(180deg) translateZ(${half}px)`)} />
      <div style={face(`rotateY(90deg) translateZ(${half}px)`)} />
      <div style={face(`rotateY(-90deg) translateZ(${half}px)`)} />
      <div style={face(`rotateX(90deg) translateZ(${half}px)`)} />
      <div style={face(`rotateX(-90deg) translateZ(${half}px)`)} />
    </div>
  )
}

function SphereMesh({ size, className, borderOpacity = 0.2 }: MeshProps) {
  const half = size / 2
  const ring = (ry: number, rx = 0) => ({
    position: "absolute" as const,
    width: size, height: size,
    borderRadius: "50%",
    border: `1px solid oklch(0.72 0.15 192 / ${borderOpacity})`,
    transform: `rotateY(${ry}deg) rotateX(${rx}deg)`,
  })
  return (
    <div
      className={className}
      style={{
        width: size, height: size,
        transformStyle: "preserve-3d" as const,
        position: "absolute" as const,
        left: "50%", top: "50%",
        marginLeft: -half, marginTop: -half,
      }}
    >
      <div style={ring(0)} />
      <div style={ring(60)} />
      <div style={ring(120)} />
      <div style={ring(0, 90)} />
    </div>
  )
}

function PyramidMesh({ size, className, borderOpacity = 0.2 }: MeshProps) {
  const half = size / 2
  const tri = (ry: number) => ({
    position: "absolute" as const,
    width: size, height: size,
    clipPath: "polygon(50% 8%, 8% 92%, 92% 92%)",
    background: `linear-gradient(to bottom, oklch(0.72 0.15 192 / ${borderOpacity * 0.6}), oklch(0.72 0.15 192 / ${borderOpacity * 0.08}))`,
    transform: `rotateY(${ry}deg)`,
  })
  return (
    <div
      className={className}
      style={{
        width: size, height: size,
        transformStyle: "preserve-3d" as const,
        position: "absolute" as const,
        left: "50%", top: "50%",
        marginLeft: -half, marginTop: -half,
      }}
    >
      <div style={tri(0)} />
      <div style={tri(60)} />
      <div style={tri(120)} />
    </div>
  )
}

function OctaMesh({ size, className, borderOpacity = 0.2 }: MeshProps) {
  const half = size / 2
  const diamond = (ry: number) => ({
    position: "absolute" as const,
    width: size, height: size,
    clipPath: "polygon(50% 5%, 95% 50%, 50% 95%, 5% 50%)",
    background: `linear-gradient(135deg, oklch(0.72 0.15 192 / ${borderOpacity * 0.5}), oklch(0.72 0.15 192 / ${borderOpacity * 0.08}))`,
    transform: `rotateY(${ry}deg)`,
  })
  return (
    <div
      className={className}
      style={{
        width: size, height: size,
        transformStyle: "preserve-3d" as const,
        position: "absolute" as const,
        left: "50%", top: "50%",
        marginLeft: -half, marginTop: -half,
      }}
    >
      <div style={diamond(0)} />
      <div style={diamond(60)} />
      <div style={diamond(120)} />
    </div>
  )
}

function RingMesh({ size, className, borderOpacity = 0.2 }: MeshProps) {
  const half = size / 2
  const s = size * 0.85
  const pad = (size - s) / 2
  const ring = (ry: number, rx: number) => ({
    position: "absolute" as const,
    width: s, height: s,
    left: pad, top: pad,
    borderRadius: "50%",
    border: `1.5px solid oklch(0.72 0.15 192 / ${borderOpacity})`,
    transform: `rotateY(${ry}deg) rotateX(${rx}deg)`,
  })
  return (
    <div
      className={className}
      style={{
        width: size, height: size,
        transformStyle: "preserve-3d" as const,
        position: "absolute" as const,
        left: "50%", top: "50%",
        marginLeft: -half, marginTop: -half,
      }}
    >
      <div style={ring(0, 65)} />
      <div style={ring(60, 65)} />
      <div style={ring(120, 65)} />
    </div>
  )
}

function HexMesh({ size, className, borderOpacity = 0.2 }: MeshProps) {
  const half = size / 2
  const s = size * 0.85
  const pad = (size - s) / 2
  const hex = (z: number) => ({
    position: "absolute" as const,
    width: s, height: s,
    left: pad, top: pad,
    clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
    background: `linear-gradient(135deg, oklch(0.72 0.15 192 / ${borderOpacity * 0.25}), oklch(0.72 0.15 192 / ${borderOpacity * 0.06}))`,
    transform: `translateZ(${z}px)`,
  })
  return (
    <div
      className={className}
      style={{
        width: size, height: size,
        transformStyle: "preserve-3d" as const,
        position: "absolute" as const,
        left: "50%", top: "50%",
        marginLeft: -half, marginTop: -half,
      }}
    >
      <div style={hex(size * 0.22)} />
      <div style={hex(0)} />
      <div style={hex(-size * 0.22)} />
    </div>
  )
}

function renderMiniShape(variant: ShapeVariant) {
  switch (variant) {
    case "double": return <CubeMesh size={44} className="wf-spin-slow" borderOpacity={0.8} />
    case "diamond": return <SphereMesh size={50} className="wf-spin-slow" borderOpacity={0.6} />
    case "grid": return <HexMesh size={48} className="wf-spin-slow" borderOpacity={0.7} />
    case "triple": return <PyramidMesh size={50} className="wf-spin-slow" borderOpacity={0.7} />
    case "fast": return <OctaMesh size={46} className="wf-spin-slow" borderOpacity={0.8} />
    case "pulse": return <RingMesh size={50} className="wf-spin-slow" borderOpacity={0.6} />
  }
}

function WireframeShape({ variant }: { variant: ShapeVariant }) {
  const configs: Record<ShapeVariant, ReactNode> = {
    double: (
      <>
        <CubeMesh size={120} className="wf-spin" borderOpacity={0.2} />
        <CubeMesh size={68} className="wf-spin-reverse" borderOpacity={0.12} />
      </>
    ),
    diamond: (
      <>
        <SphereMesh size={120} className="wf-spin-slow" borderOpacity={0.22} />
        <SphereMesh size={70} className="wf-spin-reverse" borderOpacity={0.12} />
      </>
    ),
    grid: (
      <>
        <HexMesh size={120} className="wf-spin-slow" borderOpacity={0.3} />
        <HexMesh size={72} className="wf-spin-slow-offset" borderOpacity={0.15} />
      </>
    ),
    triple: (
      <>
        <PyramidMesh size={130} className="wf-spin" borderOpacity={0.28} />
        <PyramidMesh size={75} className="wf-spin-reverse" borderOpacity={0.15} />
      </>
    ),
    fast: (
      <>
        <OctaMesh size={120} className="wf-spin-fast" borderOpacity={0.3} />
        <OctaMesh size={65} className="wf-spin-reverse" borderOpacity={0.15} />
      </>
    ),
    pulse: (
      <>
        <RingMesh size={120} className="wf-spin-pulse" borderOpacity={0.25} />
        <RingMesh size={70} className="wf-spin-reverse" borderOpacity={0.12} />
      </>
    ),
  }

  return (
    <div className="relative" style={{ width: 200, height: 200, perspective: 800 }}>
      {configs[variant]}
      <div className="absolute inset-0 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
    </div>
  )
}

/* ──────────────────── COMPARISON RADAR CHART ──────────────────── */

const RADAR_CX = 150
const RADAR_CY = 150
const RADAR_MAX_R = 105
const RADAR_RINGS = [25, 50, 75, 100]

function radarPoint(index: number, score: number, n: number) {
  const angle = (2 * Math.PI * index) / n - Math.PI / 2
  const r = (score / 100) * RADAR_MAX_R
  return {
    x: Math.round((RADAR_CX + r * Math.cos(angle)) * 10) / 10,
    y: Math.round((RADAR_CY + r * Math.sin(angle)) * 10) / 10,
  }
}

function buildRadarPath(m: ComparisonMethod, params: ComparisonParameter[], n: number) {
  return (
    params
      .map((p, i) => {
        const pt = radarPoint(i, m.scores[p.key], n)
        return `${i === 0 ? "M" : "L"}${pt.x},${pt.y}`
      })
      .join("") + "Z"
  )
}

const radarCenterPath = Array.from({ length: 10 })
  .map((_, i) => `${i === 0 ? "M" : "L"}${RADAR_CX},${RADAR_CY}`)
  .join("") + "Z"

function ComparisonRadarChart({
  method,
  wpMethod,
  parameters,
  scenario,
}: {
  method: ComparisonMethod
  wpMethod: ComparisonMethod
  parameters: ComparisonParameter[]
  scenario: ComparisonScenario
}) {
  const { ref, visible } = useInView(0.15)
  const n = parameters.length

  const methodPath = useMemo(() => buildRadarPath(method, parameters, n), [method, parameters, n])
  const wpPath = useMemo(() => buildRadarPath(wpMethod, parameters, n), [wpMethod, parameters, n])

  const labelPositions = useMemo(
    () =>
      parameters.map((_, i) => {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2
        const labelR = RADAR_MAX_R + 22
        const x = Math.round((RADAR_CX + labelR * Math.cos(angle)) * 10) / 10
        const y = Math.round((RADAR_CY + labelR * Math.sin(angle)) * 10) / 10
        const cos = Math.cos(angle)
        const anchor: "start" | "middle" | "end" =
          Math.abs(cos) < 0.15 ? "middle" : cos > 0 ? "start" : "end"
        return { x, y, anchor }
      }),
    [parameters, n],
  )

  const transition = "0.8s cubic-bezier(0.4,0,0.2,1)"

  return (
    <div ref={ref} className="relative">
      <div
        className="transition-all duration-700"
        style={{ opacity: visible ? 1 : 0, transform: visible ? "scale(1)" : "scale(0.85)" }}
      >
        <svg viewBox="0 0 300 300" className="w-full max-w-[380px] mx-auto" overflow="visible">
          <defs>
            <radialGradient id="radar-method-fill" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="oklch(0.72 0.15 192 / 0.22)" />
              <stop offset="100%" stopColor="oklch(0.72 0.15 192 / 0.06)" />
            </radialGradient>
            <radialGradient id="radar-wp-fill" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="oklch(0.5 0 0 / 0.1)" />
              <stop offset="100%" stopColor="oklch(0.5 0 0 / 0.03)" />
            </radialGradient>
          </defs>

          {RADAR_RINGS.map((pct) => (
            <circle
              key={pct}
              cx={RADAR_CX}
              cy={RADAR_CY}
              r={Math.round((pct / 100) * RADAR_MAX_R * 10) / 10}
              fill="none"
              stroke="oklch(0.25 0 0)"
              strokeWidth={pct === 100 ? "0.7" : "0.35"}
              strokeDasharray={pct < 100 ? "2 4" : undefined}
            />
          ))}

          {parameters.map((_, i) => {
            const pt = radarPoint(i, 100, n)
            return <line key={i} x1={RADAR_CX} y1={RADAR_CY} x2={pt.x} y2={pt.y} stroke="oklch(0.25 0 0)" strokeWidth="0.35" />
          })}

          <path
            d={visible ? wpPath : radarCenterPath}
            fill="url(#radar-wp-fill)"
            stroke="oklch(0.5 0 0 / 0.3)"
            strokeWidth="1"
            style={{ transition: `d ${transition}` }}
          />
          <path
            d={visible ? methodPath : radarCenterPath}
            fill="url(#radar-method-fill)"
            stroke="oklch(0.72 0.15 192 / 0.7)"
            strokeWidth="1.5"
            style={{ transition: `d ${transition}` }}
          />

          {parameters.map((p, i) => {
            const pt = visible ? radarPoint(i, method.scores[p.key], n) : { x: RADAR_CX, y: RADAR_CY }
            return (
              <circle
                key={p.key}
                cx={pt.x}
                cy={pt.y}
                r="2.5"
                fill="oklch(0.72 0.15 192)"
                stroke="oklch(0.08 0 0)"
                strokeWidth="1.2"
                style={{ transition: `cx ${transition}, cy ${transition}` }}
              />
            )
          })}

          {parameters.map((p, i) => {
            const pos = labelPositions[i]
            const weight = scenario.weights[p.key]
            return (
              <text key={p.key} x={pos.x} y={pos.y} textAnchor={pos.anchor} dominantBaseline="middle" style={{ fontSize: "7.5px" }}>
                <tspan className="fill-muted-foreground/70">{p.label}</tspan>
                <tspan className="fill-muted-foreground/35" dx="3" style={{ fontSize: "6px" }}>
                  ×{weight}
                </tspan>
              </text>
            )
          })}

        </svg>
      </div>
    </div>
  )
}

/* ──────────────────── LIGHTHOUSE GAUGES ──────────────────── */

const lighthouseScores = [
  { label: "Performance", score: 96 },
  { label: "Tillg\u00e4nglighet", score: 98 },
  { label: "Best Practices", score: 100 },
  { label: "SEO", score: 98 },
]

function LighthouseGauges() {
  const { ref, visible } = useInView(0.25)
  return (
    <div ref={ref} className="flex flex-wrap justify-center gap-8 md:gap-14 mt-14">
      {lighthouseScores.map((item, i) => {
        const r = 40
        const c = 2 * Math.PI * r
        const offset = c - (item.score / 100) * c
        return (
          <div key={item.label} className="flex flex-col items-center gap-3">
            <div className="relative w-24 h-24">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50" cy="50" r={r}
                  fill="none" stroke="oklch(0.15 0 0)" strokeWidth="3.5"
                />
                <circle
                  cx="50" cy="50" r={r}
                  fill="none"
                  stroke="oklch(0.72 0.15 192)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray={c}
                  strokeDashoffset={visible ? offset : c}
                  style={{
                    transition: `stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.2}s`,
                  }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className={`text-xl font-(--font-heading) transition-all duration-700 ${visible ? "text-foreground opacity-100" : "text-muted-foreground opacity-0"}`}
                  style={{ transitionDelay: `${i * 0.2 + 0.6}s` }}
                >
                  {item.score}
                </span>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">{item.label}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ──────────────────── TECH STACK CARD ──────────────────── */

function TechStackCard({ tech, index }: { tech: TechStackItem; index: number }) {
  const { ref: tiltRef, handleMove, handleLeave } = use3DTilt(8)
  const { ref: viewRef, visible } = useInView(0.15)
  const Icon = tech.icon

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      tiltRef.current = node
      viewRef.current = node
    },
    [tiltRef, viewRef],
  )

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const el = e.currentTarget
      const rect = el.getBoundingClientRect()
      el.style.setProperty("--glow-x", `${e.clientX - rect.left}px`)
      el.style.setProperty("--glow-y", `${e.clientY - rect.top}px`)
      handleMove(e)
    },
    [handleMove],
  )

  return (
    <div
      ref={setRefs}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleLeave}
      className={`group relative overflow-hidden rounded-2xl border border-border/20 bg-card/45 px-4 py-4 transition-all duration-700 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      }`}
      style={{
        transitionDelay: `${index * 60}ms`,
        boxShadow: visible ? "0 20px 60px rgba(8, 15, 30, 0.22)" : "none",
        ["--glow-x" as string]: "120px",
        ["--glow-y" as string]: "60px",
      }}
    >
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[linear-gradient(135deg,rgba(255,255,255,0.04),transparent_40%,rgba(45,212,191,0.05)_100%)]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(220px circle at var(--glow-x, 120px) var(--glow-y, 60px), ${tech.glow} 0%, transparent 72%)`,
        }}
      />
      <div className="pointer-events-none absolute inset-x-6 bottom-0 h-px bg-linear-to-r from-transparent via-primary/30 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/15 bg-primary/8 text-primary shadow-lg shadow-primary/5 transition-all duration-300 group-hover:scale-105 group-hover:border-primary/30 group-hover:bg-primary/12">
          <Icon className="h-5 w-5" />
        </div>
        <span className="rounded-full border border-border/20 bg-background/45 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
          {tech.category}
        </span>
      </div>

      <div className="relative z-10 mt-5 space-y-1.5">
        <h3 className="text-sm font-(--font-heading) text-foreground transition-colors duration-300 group-hover:text-primary">
          {tech.name}
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">{tech.detail}</p>
      </div>
    </div>
  )
}

function HowItWorksFallback() {
  return (
    <div className="rounded-[32px] border border-border/20 bg-card/30 p-5 md:p-6 shadow-[0_24px_80px_rgba(6,10,20,0.28)]">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,420px)]">
        <div className="relative overflow-hidden rounded-[28px] border border-border/20 bg-secondary/20 min-h-[420px]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(45,212,191,0.12),transparent_55%)]" />
          <div className="absolute inset-x-10 bottom-16 h-px bg-linear-to-r from-transparent via-primary/35 to-transparent" />
          <div className="absolute left-[14%] top-[26%] h-28 w-28 rounded-4xl border border-primary/20 bg-primary/5 animate-pulse" />
          <div className="absolute left-[34%] top-[18%] h-20 w-24 rounded-3xl border border-border/20 bg-background/30 animate-pulse" />
          <div className="absolute left-[52%] top-[24%] h-24 w-24 rounded-full border border-primary/15 bg-primary/5 animate-pulse" />
          <div className="absolute right-[14%] top-[20%] h-24 w-20 rounded-3xl border border-border/20 bg-background/30 animate-pulse" />
          <div className="absolute right-[8%] bottom-[22%] h-24 w-28 rounded-[1.75rem] border border-emerald-400/20 bg-emerald-400/5 animate-pulse" />
        </div>

        <div className="space-y-3">
          {landingJourneySteps.map((step) => (
            <div key={step.number} className="rounded-2xl border border-border/15 bg-secondary/20 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-sm font-(--font-heading) text-primary">
                  {step.number}
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-(--font-heading) text-foreground">{step.title}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function IntegrationCard({ item, index }: { item: IntegrationItem; index: number }) {
  const { ref: tiltRef, handleMove, handleLeave } = use3DTilt(6)
  const { ref: viewRef, visible } = useInView(0.15)
  const Icon = item.icon

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      tiltRef.current = node
      viewRef.current = node
    },
    [tiltRef, viewRef],
  )

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const el = e.currentTarget
      const rect = el.getBoundingClientRect()
      el.style.setProperty("--glow-x", `${e.clientX - rect.left}px`)
      el.style.setProperty("--glow-y", `${e.clientY - rect.top}px`)
      handleMove(e)
    },
    [handleMove],
  )

  return (
    <div
      ref={setRefs}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleLeave}
      className={`group relative overflow-hidden rounded-2xl border border-border/20 bg-card/40 p-4 transition-all duration-700 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
      }`}
      style={{
        transitionDelay: `${index * 70}ms`,
        animation: `float-particle-kf ${6 + index * 0.35}s ease-in-out infinite`,
        ["--glow-x" as string]: "120px",
        ["--glow-y" as string]: "40px",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(220px circle at var(--glow-x, 120px) var(--glow-y, 40px), ${item.glow} 0%, transparent 72%)`,
        }}
      />
      <div className="relative z-10 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/15 bg-primary/8 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-(--font-heading) text-foreground">{item.name}</p>
          <p className="text-xs text-muted-foreground">{item.detail}</p>
        </div>
      </div>
    </div>
  )
}

/* ──────────────────── FEATURE CARD ──────────────────── */

function FeatureCard({
  feature,
  onClick,
  index = 0,
}: {
  feature: (typeof features)[number]
  onClick: () => void
  index?: number
}) {
  const { ref: scrollRef, visible: scrollVisible } = useInView(0.15)
  const Icon = feature.icon

  const handleMouse = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    el.style.setProperty("--glow-x", `${e.clientX - rect.left}px`)
    el.style.setProperty("--glow-y", `${e.clientY - rect.top}px`)
  }, [])

  return (
    <div
      ref={scrollRef}
      className={`card-3d group relative bg-card/50 backdrop-blur-sm rounded-2xl border border-border/20 p-6 flex flex-col gap-4 hover:border-primary/20 cursor-pointer overflow-hidden transition-all duration-700 ${scrollVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
      style={{ transitionDelay: `${index * 100}ms` }}
      onClick={onClick}
      onMouseMove={handleMouse}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick()
      }}
    >
      {/* Mouse-follow radial glow */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background:
            "radial-gradient(250px circle at var(--glow-x, 50%) var(--glow-y, 50%), oklch(0.72 0.15 192 / 0.07) 0%, transparent 70%)",
        }}
      />

      {/* Mini wireframe decoration — unique shape per card */}
      <div
        className="absolute -top-1 -right-1 opacity-[0.08] group-hover:opacity-[0.25] transition-opacity duration-700 pointer-events-none"
        style={{ width: 80, height: 80, perspective: 400 }}
      >
        {renderMiniShape(feature.shape)}
      </div>

      <div className="relative z-10 w-11 h-11 rounded-xl bg-primary/8 border border-primary/15 flex items-center justify-center group-hover:bg-primary/12 group-hover:border-primary/25 transition-colors">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <h3 className="relative z-10 text-base text-foreground font-(--font-heading)">
        {feature.title}
      </h3>
      <p className="relative z-10 text-sm text-muted-foreground leading-relaxed">
        {feature.description}
      </p>
      <span className="relative z-10 text-xs text-primary/60 group-hover:text-primary transition-colors mt-auto flex items-center gap-1">
        L&auml;s mer <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
      </span>

      {/* Bottom edge glow */}
      <div className="absolute bottom-0 left-[10%] right-[10%] h-px bg-linear-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    </div>
  )
}

/* ──────────────────── FEATURE MODAL ──────────────────── */

function FeatureModal({
  feature,
  onClose,
}: {
  feature: (typeof features)[number] | null
  onClose: () => void
}) {
  if (!feature) return null

  const Icon = feature.icon

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl modal-backdrop-enter" />

      <div
        className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-card/95 backdrop-blur-2xl border border-border/30 rounded-3xl shadow-2xl modal-content-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-30 w-9 h-9 rounded-xl bg-secondary/60 hover:bg-secondary border border-border/30 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all cursor-pointer"
          aria-label="St&auml;ng"
        >
          <X className="w-4 h-4" />
        </button>

        {/* 3D Shape Header */}
        <div className="relative h-52 md:h-64 overflow-hidden rounded-t-3xl bg-linear-to-b from-secondary/40 to-transparent border-b border-border/20">
          <div className="absolute inset-0 grid-background opacity-[0.15]" />
          <div className="modal-scan-line" />
          <div className="absolute inset-0 flex items-center justify-center">
            <WireframeShape variant={feature.shape} />
          </div>
          {modalParticles.map((p, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-primary/40"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                animation: `float-particle-kf ${p.dur}s ease-in-out infinite`,
                animationDelay: `${p.delay}s`,
              }}
            />
          ))}
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-linear-to-t from-card/95 to-transparent" />
        </div>

        {/* Content */}
        <div className="px-7 md:px-8 pb-8 -mt-8 relative z-10">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/5">
              <Icon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-(--font-heading) text-foreground">{feature.title}</h3>
              <p className="text-sm text-primary/70">{feature.modalSubtitle}</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed mb-7">
            {feature.modalDescription}
          </p>

          <div className="space-y-3 mb-7">
            {feature.highlights.map((h, i) => (
              <div key={i} className="flex items-start gap-3 group/h">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-[7px] shrink-0 group-hover/h:scale-150 transition-transform" />
                <span className="text-sm text-foreground/80 leading-relaxed">{h}</span>
              </div>
            ))}
          </div>

          <div className="bg-secondary/30 border border-border/20 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/15">
              <div className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-chart-4/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-primary/60" />
              <span className="ml-2 text-xs text-muted-foreground font-mono">{feature.codeFile}</span>
            </div>
            <pre className="p-4 text-[11px] md:text-xs font-mono text-muted-foreground leading-relaxed overflow-x-auto">
              <code>{feature.codeSnippet}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}

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

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
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
                  {terminal.cursorLine === 1 && <span className="inline-block w-2 h-4 bg-primary/80 ml-1 animate-pulse align-text-bottom" />}
                </p>
                {/* Line 2 */}
                <p className={`text-muted-foreground mt-2 transition-all duration-500 ${terminal.visibleLines >= 2 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}>
                  <span className="text-primary/70">{">"}</span> Analyserar f&ouml;retagsbeskrivning...
                  {terminal.cursorLine === 2 && <span className="inline-block w-2 h-4 bg-primary/80 ml-1 animate-pulse align-text-bottom" />}
                </p>
                {/* Line 3 */}
                <p className={`text-muted-foreground transition-all duration-500 ${terminal.visibleLines >= 3 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}>
                  <span className="text-primary/70">{">"}</span> Genererar React-komponenter...
                  {terminal.cursorLine === 3 && <span className="inline-block w-2 h-4 bg-primary/80 ml-1 animate-pulse align-text-bottom" />}
                </p>
                {/* Line 4 */}
                <p className={`text-muted-foreground transition-all duration-500 ${terminal.visibleLines >= 4 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}>
                  <span className="text-primary/70">{">"}</span> Konfigurerar Next.js routing...
                  {terminal.cursorLine === 4 && <span className="inline-block w-2 h-4 bg-primary/80 ml-1 animate-pulse align-text-bottom" />}
                </p>
                {/* Line 5 */}
                <p className={`text-muted-foreground transition-all duration-500 ${terminal.visibleLines >= 5 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}>
                  <span className="text-primary/70">{">"}</span> Optimerar f&ouml;r Lighthouse 95+...
                  {terminal.cursorLine === 5 && <span className="inline-block w-2 h-4 bg-primary/80 ml-1 animate-pulse align-text-bottom" />}
                </p>
                {/* Line 6 - success */}
                <p className={`mt-2 transition-all duration-700 ${terminal.visibleLines >= 6 ? "opacity-100 translate-x-0 text-foreground" : "opacity-0 -translate-x-4 text-muted-foreground"}`}>
                  <span className="text-primary">{"✓"}</span> Klar! Publicerad till{" "}
                  <span className="text-primary underline">mittforetag.sajtmaskin.se</span>
                  {terminal.cursorLine === 6 && <span className="inline-block w-2 h-4 bg-primary/80 ml-1 animate-pulse align-text-bottom" />}
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

            <HowItWorksScene steps={landingJourneySteps} />
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

