"use client"

import { Canvas, useFrame } from "@react-three/fiber"
import { Float, PerspectiveCamera } from "@react-three/drei"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import * as THREE from "three"

type JourneyStep = {
  number: string
  scenePosition: number
  title: string
  description: string
  bullets: string[]
}

const STAGE_X = [-4.2, -2.1, 0, 2.1, 4.2] as const
const CAMERA_TARGETS = [
  new THREE.Vector3(-4.2, 0.45, 6.4),
  new THREE.Vector3(-2.1, 0.25, 6.2),
  new THREE.Vector3(0, 0.2, 6.8),
  new THREE.Vector3(2.1, 0.15, 6.2),
  new THREE.Vector3(4.2, 0.35, 6.5),
]
const LOOK_AT_TARGETS = [
  new THREE.Vector3(-4.2, 0.1, 0),
  new THREE.Vector3(-2.1, 0.15, 0),
  new THREE.Vector3(0, 0.15, 0),
  new THREE.Vector3(2.1, 0.1, 0),
  new THREE.Vector3(4.2, 0.25, 0),
]
const GLOW_COLOR = "#5eead4"

/**
 * StageFrame — omsluter varje steg-scen. Aktivt steg lyfts, förstoras och roterar
 * lite snabbare; inaktiva krymper och sjunker undan tydligt så det alltid går att
 * se VILKET steg som är aktivt (kopplat till kort-listan + UI-stadiet till höger).
 */
function StageFrame({
  x,
  index,
  activeStep,
  children,
}: {
  x: number
  index: number
  activeStep: number
  children: ReactNode
}) {
  const groupRef = useRef<THREE.Group>(null)
  const targetScale = useMemo(() => new THREE.Vector3(1, 1, 1), [])

  useFrame((_, delta) => {
    if (!groupRef.current) return
    const distance = Math.abs(activeStep - index)
    const isActive = distance === 0
    // Starkare kontrast än tidigare: aktivt ~1.22, grannar ~0.82, längre bort ~0.5.
    const emphasis = THREE.MathUtils.clamp(1 - distance * 0.5, 0.3, 1)
    const scale = 0.58 + emphasis * 0.64
    targetScale.setScalar(scale)

    groupRef.current.scale.lerp(targetScale, 0.09)
    groupRef.current.position.y = THREE.MathUtils.lerp(
      groupRef.current.position.y,
      isActive ? 0.28 : -0.18 * distance,
      0.09,
    )
    groupRef.current.position.z = THREE.MathUtils.lerp(
      groupRef.current.position.z,
      isActive ? 0.35 : -0.35 * distance,
      0.09,
    )
    groupRef.current.rotation.y += delta * (isActive ? 0.34 : 0.12)
  })

  return (
    <group ref={groupRef} position={[x, 0, 0]}>
      {children}
    </group>
  )
}

function CompanyStage({ activeStep }: { activeStep: number }) {
  return (
    <StageFrame x={STAGE_X[0]} index={0} activeStep={activeStep}>
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.4}>
        <mesh position={[0, 0.65, 0]}>
          <octahedronGeometry args={[0.6, 0]} />
          <meshStandardMaterial color={GLOW_COLOR} emissive={GLOW_COLOR} emissiveIntensity={1.1} wireframe />
        </mesh>
      </Float>
      <mesh position={[-0.55, -0.8, 0]}>
        <boxGeometry args={[0.55, 1.45, 0.55]} />
        <meshStandardMaterial color="#0f172a" emissive="#164e63" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0, -0.45, 0]}>
        <boxGeometry args={[0.72, 2.1, 0.72]} />
        <meshStandardMaterial color="#111827" emissive="#0f766e" emissiveIntensity={0.85} />
      </mesh>
      <mesh position={[0.58, -0.95, 0]}>
        <boxGeometry args={[0.48, 1.1, 0.48]} />
        <meshStandardMaterial color="#0f172a" emissive="#134e4a" emissiveIntensity={0.7} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(2.1, 3, 1.4)]} />
        <lineBasicMaterial color="#2dd4bf" transparent opacity={0.45} />
      </lineSegments>
    </StageFrame>
  )
}

function InputStage({ activeStep }: { activeStep: number }) {
  const cards = useMemo(
    () => [
      [-0.65, 0.65, 0] as const,
      [0.65, 0.65, 0] as const,
      [-0.65, -0.65, 0] as const,
      [0.65, -0.65, 0] as const,
    ],
    [],
  )

  return (
    <StageFrame x={STAGE_X[1]} index={1} activeStep={activeStep}>
      {cards.map((position, index) => (
        <Float key={index} speed={2 + index * 0.2} rotationIntensity={0.12} floatIntensity={0.25}>
          <mesh position={position}>
            <boxGeometry args={[0.95, 0.55, 0.12]} />
            <meshStandardMaterial
              color={index % 2 === 0 ? "#0f172a" : "#111827"}
              emissive={index === activeStep ? "#14b8a6" : "#155e75"}
              emissiveIntensity={0.75}
            />
          </mesh>
        </Float>
      ))}
      <mesh position={[0, 0, -0.35]}>
        <ringGeometry args={[1.15, 1.27, 48]} />
        <meshBasicMaterial color="#5eead4" transparent opacity={0.35} />
      </mesh>
    </StageFrame>
  )
}

/**
 * BuildStage — steg 3 "AI bygger". Speglar det faktiska UI-stadiet: en
 * browser-mockup vars innehållsblock byggs upp (skalas in) i loop, med en
 * omgivande kod-ring. Tydligare koppling till "sajten byggs" än en abstrakt form.
 */
function BuildStage({ activeStep }: { activeStep: number }) {
  const barsRef = useRef<THREE.Group>(null)
  const contentBars = useMemo(
    () => [
      { y: 0.12, w: 1.5 },
      { y: -0.16, w: 1.2 },
      { y: -0.44, w: 1.62 },
    ],
    [],
  )
  const dots = useMemo(() => ["#f87171", "#fbbf24", "#34d399"], [])

  useFrame((state) => {
    if (!barsRef.current) return
    const t = state.clock.getElapsedTime()
    barsRef.current.children.forEach((child, i) => {
      // Staggrad "build up": blocken växer in på bredden i en mjuk loop.
      const phase = (t * 0.6 - i * 0.28) % 2.2
      const grow = THREE.MathUtils.clamp(phase < 1.1 ? phase / 1.1 : 1, 0.05, 1)
      child.scale.x = THREE.MathUtils.lerp(child.scale.x, grow, 0.15)
    })
  })

  return (
    <StageFrame x={STAGE_X[2]} index={2} activeStep={activeStep}>
      <Float speed={1.2} rotationIntensity={0.12} floatIntensity={0.18}>
        <group>
          {/* Browser-ram */}
          <mesh position={[0, 0, -0.06]}>
            <boxGeometry args={[2.35, 1.7, 0.12]} />
            <meshStandardMaterial color="#0b1220" emissive="#0f766e" emissiveIntensity={0.5} />
          </mesh>
          {/* Övre fältet */}
          <mesh position={[0, 0.72, 0.02]}>
            <boxGeometry args={[2.35, 0.3, 0.14]} />
            <meshStandardMaterial color="#111827" emissive="#155e75" emissiveIntensity={0.7} />
          </mesh>
          {/* Trafikljus-prickar */}
          {dots.map((color, i) => (
            <mesh key={color} position={[-1.02 + i * 0.16, 0.72, 0.12]}>
              <boxGeometry args={[0.08, 0.08, 0.05]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.1} />
            </mesh>
          ))}
          {/* Hero-block */}
          <mesh position={[0, 0.4, 0.08]}>
            <boxGeometry args={[2.05, 0.18, 0.06]} />
            <meshStandardMaterial color="#5eead4" emissive="#2dd4bf" emissiveIntensity={0.9} />
          </mesh>
          {/* Innehållsblock som byggs upp */}
          <group ref={barsRef}>
            {contentBars.map((bar) => (
              <mesh key={bar.y} position={[0, bar.y, 0.08]}>
                <boxGeometry args={[bar.w, 0.14, 0.05]} />
                <meshStandardMaterial color="#67e8f9" emissive="#0ea5e9" emissiveIntensity={0.8} />
              </mesh>
            ))}
          </group>
        </group>
      </Float>
      {/* Omgivande kod-ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <torusGeometry args={[1.7, 0.015, 8, 90]} />
        <meshBasicMaterial color="#5eead4" transparent opacity={0.3} />
      </mesh>
    </StageFrame>
  )
}

function DeployStage({ activeStep }: { activeStep: number }) {
  return (
    <StageFrame x={STAGE_X[3]} index={3} activeStep={activeStep}>
      <Float speed={1.8} rotationIntensity={0.18} floatIntensity={0.18}>
        <mesh>
          <sphereGeometry args={[0.95, 24, 24]} />
          <meshStandardMaterial color="#0f172a" emissive="#0f766e" emissiveIntensity={0.65} wireframe />
        </mesh>
      </Float>
      {[0, 1, 2].map((orbit) => (
        <group key={orbit} rotation={[orbit * 0.7, orbit * 0.85, orbit * 0.45]}>
          <mesh position={[1.3, 0, 0]} scale={0.12}>
            <sphereGeometry args={[1, 12, 12]} />
            <meshStandardMaterial color="#99f6e4" emissive="#2dd4bf" emissiveIntensity={1.3} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.3, 0.01, 10, 80]} />
            <meshBasicMaterial color="#5eead4" transparent opacity={0.35} />
          </mesh>
        </group>
      ))}
    </StageFrame>
  )
}

function ResultsStage({ activeStep }: { activeStep: number }) {
  const bars = useMemo(
    () => [
      { x: -0.95, height: 0.8, color: "#0ea5e9" },
      { x: -0.35, height: 1.35, color: "#14b8a6" },
      { x: 0.25, height: 1.9, color: "#22c55e" },
      { x: 0.85, height: 2.35, color: "#86efac" },
    ],
    [],
  )

  return (
    <StageFrame x={STAGE_X[4]} index={4} activeStep={activeStep}>
      {bars.map((bar) => (
        <mesh key={bar.x} position={[bar.x, -1.4 + bar.height / 2, 0]}>
          <boxGeometry args={[0.38, bar.height, 0.38]} />
          <meshStandardMaterial color={bar.color} emissive={bar.color} emissiveIntensity={0.9} />
        </mesh>
      ))}
      <mesh position={[0.1, 1.25, 0]}>
        <torusGeometry args={[0.75, 0.08, 10, 48, Math.PI * 1.35]} />
        <meshStandardMaterial color="#86efac" emissive="#22c55e" emissiveIntensity={1.1} />
      </mesh>
      <mesh position={[0.92, 1.72, 0.05]} rotation={[0, 0, -0.3]}>
        <coneGeometry args={[0.18, 0.42, 24]} />
        <meshStandardMaterial color="#86efac" emissive="#22c55e" emissiveIntensity={1.15} />
      </mesh>
    </StageFrame>
  )
}

/**
 * ActiveSpotlight — en glödande piedestal + ljuskägla som glider till det aktiva
 * stegets position. Gör "vilket steg är aktivt" omisskännligt även i 3D-vyn.
 */
function ActiveSpotlight({ activeStep }: { activeStep: number }) {
  const ringRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const pulseRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    const targetX = STAGE_X[activeStep] ?? 0
    const t = state.clock.getElapsedTime()
    for (const ref of [ringRef, glowRef, lightRef, pulseRef]) {
      if (ref.current) ref.current.position.x = THREE.MathUtils.lerp(ref.current.position.x, targetX, 0.1)
    }
    if (pulseRef.current) {
      const s = 1 + Math.sin(t * 2.2) * 0.12
      pulseRef.current.scale.setScalar(s)
      const mat = pulseRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.22 + (Math.sin(t * 2.2) + 1) * 0.12
    }
  })

  return (
    <group>
      {/* Glödande golvring under aktivt steg */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[STAGE_X[0], -1.6, 0]}>
        <ringGeometry args={[0.8, 1.1, 64]} />
        <meshBasicMaterial color={GLOW_COLOR} transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={pulseRef} rotation={[-Math.PI / 2, 0, 0]} position={[STAGE_X[0], -1.59, 0]}>
        <ringGeometry args={[1.12, 1.5, 64]} />
        <meshBasicMaterial color={GLOW_COLOR} transparent opacity={0.25} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]} position={[STAGE_X[0], -1.61, 0]}>
        <circleGeometry args={[0.78, 48]} />
        <meshBasicMaterial color={GLOW_COLOR} transparent opacity={0.14} />
      </mesh>
      <pointLight ref={lightRef} position={[STAGE_X[0], 1.2, 2.2]} intensity={14} color={GLOW_COLOR} distance={7} />
    </group>
  )
}

function PipelineScene({ activeStep }: { activeStep: number }) {
  useFrame((state) => {
    const cameraTarget = CAMERA_TARGETS[activeStep] ?? CAMERA_TARGETS[0]
    const lookAtTarget = LOOK_AT_TARGETS[activeStep] ?? LOOK_AT_TARGETS[0]
    state.camera.position.lerp(cameraTarget, 0.06)
    state.camera.lookAt(lookAtTarget)
  })

  return (
    <>
      <PerspectiveCamera makeDefault position={CAMERA_TARGETS[0]} fov={34} />
      <ambientLight intensity={0.9} />
      <pointLight position={[0, 4, 6]} intensity={18} color="#5eead4" />
      <pointLight position={[4, -3, 4]} intensity={9} color="#60a5fa" />
      <pointLight position={[-6, -2, 3]} intensity={6} color="#22c55e" />

      {/* Rail/golv */}
      <mesh position={[0, -1.65, -0.45]} scale={[11.5, 0.05, 0.05]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#0f172a" emissive="#0f766e" emissiveIntensity={0.8} />
      </mesh>

      <ActiveSpotlight activeStep={activeStep} />

      <CompanyStage activeStep={activeStep} />
      <InputStage activeStep={activeStep} />
      <BuildStage activeStep={activeStep} />
      <DeployStage activeStep={activeStep} />
      <ResultsStage activeStep={activeStep} />
    </>
  )
}

export function HowItWorksScene({ steps }: { steps: JourneyStep[] }) {
  const [activeStep, setActiveStep] = useState(0)
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]

        if (!mostVisible) return
        const nextIndex = Number((mostVisible.target as HTMLElement).dataset.stepIndex ?? 0)
        setActiveStep(nextIndex)
      },
      {
        threshold: [0.35, 0.6, 0.85],
        rootMargin: "-10% 0px -25% 0px",
      },
    )

    const nodes = cardRefs.current.filter(Boolean)
    nodes.forEach((node) => {
      if (node) observer.observe(node)
    })

    return () => observer.disconnect()
  }, [steps.length])

  return (
    <div className="rounded-[32px] border border-border/20 bg-card/30 p-5 md:p-6 shadow-[0_24px_80px_rgba(6,10,20,0.28)]">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,420px)]">
        <div className="lg:sticky lg:top-24">
          <div className="relative min-h-[420px] overflow-hidden rounded-[28px] border border-border/20 bg-secondary/20 md:min-h-[520px]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(45,212,191,0.16),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_35%,rgba(34,197,94,0.04)_100%)]" />
            <Canvas gl={{ alpha: true, antialias: true }} dpr={[1, 1.5]}>
              <PipelineScene activeStep={activeStep} />
            </Canvas>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-background/85 via-background/30 to-transparent" />
            <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-border/20 bg-background/55 p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/12 text-sm font-(--font-heading) text-primary">
                    {steps[activeStep]?.number}
                  </span>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">Aktivt steg</p>
                    <p className="mt-0.5 text-sm font-(--font-heading) text-foreground">{steps[activeStep]?.title}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {steps.map((step, index) => (
                    <span
                      key={step.number}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        index === activeStep ? "w-8 bg-primary" : "w-2 bg-primary/25"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {steps.map((step, index) => {
            const isActive = index === activeStep
            return (
              <button
                key={step.number}
                ref={(node) => {
                  cardRefs.current[index] = node
                }}
                data-step-index={index}
                type="button"
                aria-current={isActive ? "step" : undefined}
                onMouseEnter={() => setActiveStep(index)}
                onFocus={() => setActiveStep(index)}
                onClick={() => setActiveStep(index)}
                className={`relative w-full overflow-hidden rounded-[24px] border p-4 text-left transition-all duration-300 ${
                  isActive
                    ? "border-primary/40 bg-primary/10 shadow-[0_16px_44px_rgba(8,145,178,0.18)] ring-1 ring-primary/25 md:scale-[1.02]"
                    : "border-border/15 bg-secondary/20 opacity-70 hover:opacity-100 hover:border-border/35 hover:bg-secondary/30"
                }`}
              >
                {/* Aktiv-accent till vänster */}
                <span
                  className={`absolute inset-y-3 left-0 w-1 rounded-full bg-primary transition-all duration-300 ${
                    isActive ? "opacity-100" : "opacity-0"
                  }`}
                />
                <div className="flex items-start gap-3 pl-1">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-sm font-(--font-heading) transition-colors ${
                      isActive
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border/20 bg-background/40 text-muted-foreground"
                    }`}
                  >
                    {step.number}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-base font-(--font-heading) text-foreground">{step.title}</p>
                      {isActive && (
                        <span className="rounded-full border border-primary/30 bg-primary/12 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                          Aktivt
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {step.bullets.map((bullet) => (
                        <span
                          key={bullet}
                          className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                            isActive
                              ? "border-primary/25 bg-primary/10 text-primary/90"
                              : "border-border/20 bg-background/35 text-muted-foreground"
                          }`}
                        >
                          {bullet}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
