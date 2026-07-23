"use client"

import { Canvas, useFrame } from "@react-three/fiber"
import { Float, PerspectiveCamera, RoundedBox } from "@react-three/drei"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react"
import * as THREE from "three"

type JourneyStep = {
  number: string
  scenePosition: number
  title: string
  description: string
  bullets: string[]
}

/* ──────────────────────────── palett ──────────────────────────── */
// En sammanhållen teal→grön palett. Accenten glider mot grönt ju längre in i
// resan man kommer (steg 1 = teal, steg 5 = "gröna siffror").
const TEAL = new THREE.Color("#2dd4bf")
const GREEN = new THREE.Color("#22c55e")
const ACCENT = "#5eead4"
const ACCENT_DEEP = "#0d9488"
const SKY = "#38bdf8"
const AMBER = "#fbbf24"
const CORAL = "#f87171"
const GREEN_SOFT = "#86efac"
const SLAB = "#0b1220"
const SLAB_2 = "#111a2e"

const TOTAL_STEPS = 5

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/* ─────────────────────────── byggblock ─────────────────────────── */

/** Tunn, glödande stapel (rundade hörn) — används i flera dioramas. */
function Bar({
  position,
  args,
  color,
  emissive,
  intensity = 0.85,
}: {
  position: [number, number, number]
  args: [number, number, number]
  color: string
  emissive?: string
  intensity?: number
}) {
  return (
    <RoundedBox position={position} args={args} radius={0.04} smoothness={2}>
      <meshStandardMaterial
        color={color}
        emissive={emissive ?? color}
        emissiveIntensity={intensity}
        metalness={0.35}
        roughness={0.45}
      />
    </RoundedBox>
  )
}

/* ── 01 · Registrera företaget ─────────────────────────────────────
 * Ett stående "företagskort" (identitet/registrering): rundat kort med
 * rubrikfält, logotyp-cirkel, text-rader och ett grönt "godkänt"-sigill.
 */
function CompanyStage() {
  const sealRef = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (!sealRef.current) return
    const t = state.clock.getElapsedTime()
    sealRef.current.scale.setScalar(1 + Math.sin(t * 2.4) * 0.05)
  })

  return (
    <group>
      {/* Kort-bas */}
      <RoundedBox args={[1.9, 2.35, 0.16]} radius={0.16} smoothness={3}>
        <meshStandardMaterial color={SLAB_2} metalness={0.4} roughness={0.5} />
      </RoundedBox>
      {/* Rubrikfält */}
      <RoundedBox position={[0, 0.86, 0.1]} args={[1.62, 0.42, 0.08]} radius={0.08} smoothness={2}>
        <meshStandardMaterial color={ACCENT_DEEP} emissive={TEAL} emissiveIntensity={0.9} metalness={0.3} roughness={0.4} />
      </RoundedBox>
      {/* Logotyp-cirkel */}
      <mesh position={[-0.5, 0.2, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.08, 40]} />
        <meshStandardMaterial color={ACCENT} emissive={TEAL} emissiveIntensity={1.1} metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Text-rader */}
      <Bar position={[0.32, 0.34, 0.12]} args={[0.82, 0.13, 0.05]} color="#e2e8f0" emissive="#94a3b8" intensity={0.35} />
      <Bar position={[0.24, 0.06, 0.12]} args={[0.66, 0.11, 0.05]} color="#64748b" emissive="#475569" intensity={0.25} />
      <Bar position={[0, -0.42, 0.12]} args={[1.4, 0.12, 0.05]} color="#475569" emissive="#334155" intensity={0.2} />
      <Bar position={[-0.12, -0.66, 0.12]} args={[1.16, 0.12, 0.05]} color="#475569" emissive="#334155" intensity={0.2} />
      {/* Grönt godkänt-sigill */}
      <Float speed={2.4} rotationIntensity={0.15} floatIntensity={0.4}>
        <group ref={sealRef} position={[0.6, -0.92, 0.34]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.34, 0.34, 0.09, 40]} />
            <meshStandardMaterial color={GREEN} emissive={GREEN} emissiveIntensity={1.2} metalness={0.4} roughness={0.3} />
          </mesh>
          {/* Bock */}
          <mesh position={[-0.05, -0.02, 0.06]} rotation={[0, 0, -0.7]}>
            <boxGeometry args={[0.08, 0.2, 0.05]} />
            <meshStandardMaterial color="#f0fdf4" emissive={GREEN_SOFT} emissiveIntensity={0.8} />
          </mesh>
          <mesh position={[0.02, 0.03, 0.06]} rotation={[0, 0, 0.6]}>
            <boxGeometry args={[0.08, 0.34, 0.05]} />
            <meshStandardMaterial color="#f0fdf4" emissive={GREEN_SOFT} emissiveIntensity={0.8} />
          </mesh>
        </group>
      </Float>
    </group>
  )
}

/* ── 02 · Välj spår och fyll i input ───────────────────────────────
 * Fyra inmatnings-tiles (Fritext / Template / Analyserad / Audit) i 2×2,
 * en aktiv (teal), plus en prompt-rad med blinkande markör.
 */
function InputStage() {
  const caretRef = useRef<THREE.Mesh>(null)
  const activeTileRef = useRef<THREE.MeshStandardMaterial>(null)
  const tiles = useMemo(
    () => [
      { pos: [-0.62, 0.66, 0] as const, active: true },
      { pos: [0.62, 0.66, 0] as const, active: false },
      { pos: [-0.62, -0.02, 0] as const, active: false },
      { pos: [0.62, -0.02, 0] as const, active: false },
    ],
    [],
  )

  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    if (caretRef.current) {
      const mat = caretRef.current.material as THREE.MeshStandardMaterial
      mat.opacity = Math.sin(t * 4) > 0 ? 1 : 0.12
    }
    if (activeTileRef.current) {
      activeTileRef.current.emissiveIntensity = 0.8 + Math.sin(t * 2.6) * 0.35
    }
  })

  return (
    <group position={[0, 0.05, 0]}>
      {tiles.map((tile, i) => (
        <Float key={i} speed={2 + i * 0.25} rotationIntensity={0.08} floatIntensity={0.2}>
          <RoundedBox position={tile.pos} args={[1.02, 0.58, 0.12]} radius={0.1} smoothness={2}>
            {tile.active ? (
              <meshStandardMaterial
                ref={activeTileRef}
                color={ACCENT_DEEP}
                emissive={TEAL}
                emissiveIntensity={1}
                metalness={0.35}
                roughness={0.4}
              />
            ) : (
              <meshStandardMaterial color={SLAB_2} emissive="#1e293b" emissiveIntensity={0.4} metalness={0.35} roughness={0.55} />
            )}
          </RoundedBox>
          {/* Ikon-prick på varje tile */}
          <mesh position={[tile.pos[0] - 0.34, tile.pos[1], tile.pos[2] + 0.08]}>
            <sphereGeometry args={[0.07, 16, 16]} />
            <meshStandardMaterial
              color={tile.active ? "#f0fdfa" : ACCENT}
              emissive={tile.active ? ACCENT : ACCENT_DEEP}
              emissiveIntensity={tile.active ? 1.2 : 0.6}
            />
          </mesh>
        </Float>
      ))}

      {/* Prompt-rad */}
      <RoundedBox position={[0, -0.86, 0.1]} args={[2.3, 0.5, 0.14]} radius={0.12} smoothness={2}>
        <meshStandardMaterial color={SLAB} emissive={ACCENT_DEEP} emissiveIntensity={0.4} metalness={0.4} roughness={0.45} />
      </RoundedBox>
      <Bar position={[-0.5, -0.86, 0.19]} args={[0.9, 0.11, 0.05]} color="#94a3b8" emissive="#64748b" intensity={0.3} />
      {/* Blinkande markör */}
      <mesh ref={caretRef} position={[0.12, -0.86, 0.19]}>
        <boxGeometry args={[0.05, 0.26, 0.05]} />
        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={1.4} transparent opacity={1} />
      </mesh>
      {/* Skicka-knapp */}
      <mesh position={[0.92, -0.86, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.1, 32]} />
        <meshStandardMaterial color={ACCENT} emissive={TEAL} emissiveIntensity={1.2} metalness={0.5} roughness={0.3} />
      </mesh>
    </group>
  )
}

/* ── 03 · AI bygger i iterationer ──────────────────────────────────
 * Browser-mockup vars innehållsblock byggs upp i en mjuk loop + en
 * "AI-gnista" som sveper över ytan. Tydlig koppling till "sajten byggs".
 */
function BuildStage() {
  const barsRef = useRef<THREE.Group>(null)
  const sparkRef = useRef<THREE.Mesh>(null)
  const contentBars = useMemo(
    () => [
      { y: 0.02, w: 1.6 },
      { y: -0.26, w: 1.28 },
      { y: -0.54, w: 1.7 },
    ],
    [],
  )
  const dots = useMemo(() => [CORAL, AMBER, "#34d399"], [])

  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    if (barsRef.current) {
      barsRef.current.children.forEach((child, i) => {
        const phase = (t * 0.6 - i * 0.3) % 2.4
        const grow = THREE.MathUtils.clamp(phase < 1.1 ? phase / 1.1 : 1, 0.04, 1)
        child.scale.x = THREE.MathUtils.lerp(child.scale.x, grow, 0.15)
      })
    }
    if (sparkRef.current) {
      sparkRef.current.position.x = Math.sin(t * 1.3) * 0.95
      sparkRef.current.position.y = 0.35 + Math.cos(t * 0.9) * 0.55
      const mat = sparkRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 1.6 + Math.sin(t * 6) * 0.6
    }
  })

  return (
    <group>
      {/* Browser-ram */}
      <RoundedBox args={[2.55, 1.95, 0.16]} radius={0.14} smoothness={3}>
        <meshStandardMaterial color={SLAB} emissive={ACCENT_DEEP} emissiveIntensity={0.35} metalness={0.4} roughness={0.5} />
      </RoundedBox>
      {/* Övre fältet */}
      <RoundedBox position={[0, 0.82, 0.06]} args={[2.55, 0.36, 0.12]} radius={0.06} smoothness={2}>
        <meshStandardMaterial color={SLAB_2} emissive="#155e75" emissiveIntensity={0.55} metalness={0.35} roughness={0.5} />
      </RoundedBox>
      {/* Trafikljus-prickar */}
      {dots.map((color, i) => (
        <mesh key={color} position={[-1.08 + i * 0.18, 0.82, 0.14]}>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} />
        </mesh>
      ))}
      {/* Hero-block */}
      <Bar position={[0, 0.44, 0.12]} args={[2.2, 0.2, 0.06]} color={ACCENT} emissive={TEAL.getStyle()} intensity={1} />
      {/* Innehållsblock som byggs upp (vänsterankrade: skalas i x från vänsterkant) */}
      <group ref={barsRef}>
        {contentBars.map((bar) => (
          <group key={bar.y} position={[-bar.w / 2, bar.y, 0.12]}>
            <mesh position={[bar.w / 2, 0, 0]}>
              <boxGeometry args={[bar.w, 0.15, 0.05]} />
              <meshStandardMaterial color="#67e8f9" emissive={SKY} emissiveIntensity={0.85} metalness={0.3} roughness={0.45} />
            </mesh>
          </group>
        ))}
      </group>
      {/* AI-gnista */}
      <mesh ref={sparkRef} position={[0, 0.35, 0.24]}>
        <sphereGeometry args={[0.09, 20, 20]} />
        <meshStandardMaterial color="#f0fdfa" emissive={ACCENT} emissiveIntensity={1.8} />
      </mesh>
    </group>
  )
}

/* ── 04 · Koppla data och publicera ────────────────────────────────
 * Ett klot med en omloppsbana av integrations-noder (betalning/databas/
 * e-post) + en publicerings-pil uppåt. "Kopplas ihop och går live."
 */
function DeployStage() {
  const orbitRef = useRef<THREE.Group>(null)
  const arrowRef = useRef<THREE.Group>(null)
  const nodes = useMemo(
    () => [
      { angle: 0, color: ACCENT },
      { angle: (Math.PI * 2) / 3, color: SKY },
      { angle: (Math.PI * 4) / 3, color: GREEN_SOFT },
    ],
    [],
  )

  useFrame((state, delta) => {
    if (orbitRef.current) orbitRef.current.rotation.z += delta * 0.5
    if (arrowRef.current) {
      const t = state.clock.getElapsedTime()
      arrowRef.current.position.y = 1.1 + Math.sin(t * 2) * 0.14
      const mat = (arrowRef.current.children[0] as THREE.Mesh)
        .material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 1 + Math.sin(t * 3) * 0.4
    }
  })

  return (
    <group>
      {/* Klot */}
      <Float speed={1.4} rotationIntensity={0.25} floatIntensity={0.2}>
        <mesh>
          <icosahedronGeometry args={[0.85, 1]} />
          <meshStandardMaterial color={SLAB_2} emissive={ACCENT_DEEP} emissiveIntensity={0.7} metalness={0.5} roughness={0.35} wireframe />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.7, 32, 32]} />
          <meshStandardMaterial color={SLAB} emissive={TEAL} emissiveIntensity={0.4} metalness={0.6} roughness={0.3} />
        </mesh>
      </Float>

      {/* Omloppsbana + noder */}
      <group ref={orbitRef} rotation={[Math.PI / 2.6, 0, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.5, 0.02, 12, 96]} />
          <meshBasicMaterial color={ACCENT} transparent opacity={0.4} />
        </mesh>
        {nodes.map((node, i) => (
          <group key={i} rotation={[0, 0, node.angle]}>
            <mesh position={[1.5, 0, 0]}>
              <boxGeometry args={[0.28, 0.28, 0.28]} />
              <meshStandardMaterial color={node.color} emissive={node.color} emissiveIntensity={1.1} metalness={0.4} roughness={0.35} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Publicerings-pil uppåt */}
      <group ref={arrowRef} position={[0, 1.1, 0.4]}>
        <mesh>
          <coneGeometry args={[0.24, 0.42, 4]} />
          <meshStandardMaterial color={GREEN_SOFT} emissive={GREEN} emissiveIntensity={1.2} metalness={0.4} roughness={0.3} />
        </mesh>
        <mesh position={[0, -0.34, 0]}>
          <boxGeometry args={[0.14, 0.32, 0.14]} />
          <meshStandardMaterial color={GREEN_SOFT} emissive={GREEN} emissiveIntensity={1} />
        </mesh>
      </group>
    </group>
  )
}

/* ── 05 · Optimera mot gröna siffror ───────────────────────────────
 * Ett stigande stapeldiagram (grönt) med en uppåt-trend-pil. "Gröna siffror."
 */
function ResultsStage() {
  const trendRef = useRef<THREE.Group>(null)
  const bars = useMemo(
    () => [
      { x: -1.05, height: 0.6, color: "#0ea5e9" },
      { x: -0.35, height: 1.05, color: "#14b8a6" },
      { x: 0.35, height: 1.5, color: "#22c55e" },
      { x: 1.05, height: 1.95, color: GREEN_SOFT },
    ],
    [],
  )

  useFrame((state) => {
    if (!trendRef.current) return
    const t = state.clock.getElapsedTime()
    trendRef.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh
      const mat = mesh.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 0.9 + Math.sin(t * 3 + i * 0.6) * 0.4
    })
  })

  return (
    <group position={[0, -0.55, 0]}>
      {/* Golvlinje */}
      <mesh position={[0, -0.08, -0.1]}>
        <boxGeometry args={[2.7, 0.04, 0.04]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.35} />
      </mesh>
      {/* Staplar */}
      {bars.map((bar) => (
        <RoundedBox
          key={bar.x}
          position={[bar.x, bar.height / 2, 0]}
          args={[0.44, bar.height, 0.44]}
          radius={0.08}
          smoothness={2}
        >
          <meshStandardMaterial color={bar.color} emissive={bar.color} emissiveIntensity={0.9} metalness={0.35} roughness={0.4} />
        </RoundedBox>
      ))}
      {/* Trend-pil (segment som stiger upp-höger) */}
      <group ref={trendRef} position={[0, 0.28, 0.32]}>
        {[
          [-1.05, 0.65],
          [-0.35, 1.1],
          [0.35, 1.55],
          [1.05, 2.0],
        ].map(([x, y], i) => (
          <mesh key={i} position={[x, y, 0]}>
            <sphereGeometry args={[0.1, 16, 16]} />
            <meshStandardMaterial color="#f0fdf4" emissive={GREEN_SOFT} emissiveIntensity={1} />
          </mesh>
        ))}
        {/* Pilspets */}
        <mesh position={[1.05, 2.0, 0]} rotation={[0, 0, -0.72]}>
          <coneGeometry args={[0.16, 0.36, 20]} />
          <meshStandardMaterial color="#f0fdf4" emissive={GREEN} emissiveIntensity={1.2} />
        </mesh>
      </group>
    </group>
  )
}

const STAGE_COMPONENTS: ComponentType[] = [
  CompanyStage,
  InputStage,
  BuildStage,
  DeployStage,
  ResultsStage,
]

/* ─────────────────────────── piedestal ─────────────────────────── */
/**
 * Glödande piedestal under dioramat: en ring + puls + mjuk skiva. Accentfärgen
 * glider teal→grön ju längre in i resan (aktivt steg) så framstegskänslan blir tydlig.
 */
function Pedestal({ activeStep }: { activeStep: number }) {
  const ringRef = useRef<THREE.MeshBasicMaterial>(null)
  const pulseRef = useRef<THREE.Mesh>(null)
  const discRef = useRef<THREE.MeshBasicMaterial>(null)
  const colorRef = useRef(TEAL.clone())

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime()
    const target = TEAL.clone().lerp(GREEN, activeStep / (TOTAL_STEPS - 1))
    colorRef.current.lerp(target, Math.min(1, delta * 3))
    if (ringRef.current) ringRef.current.color.copy(colorRef.current)
    if (discRef.current) discRef.current.color.copy(colorRef.current)
    if (pulseRef.current) {
      const mat = pulseRef.current.material as THREE.MeshBasicMaterial
      mat.color.copy(colorRef.current)
      const s = 1 + (Math.sin(t * 2) + 1) * 0.14
      pulseRef.current.scale.set(s, s, 1)
      mat.opacity = 0.18 + (Math.sin(t * 2) + 1) * 0.06
    }
  })

  return (
    <group position={[0, -1.62, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <ringGeometry args={[0.95, 1.18, 72]} />
        <meshBasicMaterial ref={ringRef} color={ACCENT} transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={pulseRef} position={[0, 0, -0.01]}>
        <ringGeometry args={[1.2, 1.7, 72]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.22} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, -0.02]}>
        <circleGeometry args={[0.95, 56]} />
        <meshBasicMaterial ref={discRef} color={ACCENT} transparent opacity={0.12} />
      </mesh>
    </group>
  )
}

/* ─────────────────────── focus-scen (swap) ─────────────────────── */
/**
 * Visar ETT diorama i taget, centrerat och tydligt. Vid stegbyte gör hela
 * scenen en snabb "flip-swap" (krymper + vrider ut det gamla, byter, växer in
 * det nya) — bara ett diorama ritas åt gången, vilket också håller det lätt.
 */
function FocusStage({ activeStep }: { activeStep: number }) {
  const outerRef = useRef<THREE.Group>(null)
  const innerRef = useRef<THREE.Group>(null)
  const stageRefs = useRef<Array<THREE.Group | null>>([])
  const shownRef = useRef(activeStep)
  const swapRef = useRef(1)

  useFrame((state, delta) => {
    const speed = 3.6
    if (shownRef.current !== activeStep) {
      swapRef.current -= delta * speed
      if (swapRef.current <= 0) {
        shownRef.current = activeStep
        swapRef.current = 0
      }
    } else {
      swapRef.current = Math.min(1, swapRef.current + delta * speed)
    }

    stageRefs.current.forEach((group, i) => {
      if (group) group.visible = i === shownRef.current
    })

    const s = easeOutCubic(THREE.MathUtils.clamp(swapRef.current, 0, 1))
    if (outerRef.current) {
      outerRef.current.scale.setScalar(0.2 + 0.8 * s)
      outerRef.current.rotation.y = (1 - s) * 1.15
      outerRef.current.position.y = (1 - s) * -0.3
    }
    if (innerRef.current) {
      const t = state.clock.getElapsedTime()
      innerRef.current.rotation.y = Math.sin(t * 0.5) * 0.32
      innerRef.current.rotation.x = Math.sin(t * 0.4) * 0.05
    }
  })

  return (
    <group ref={outerRef}>
      <group ref={innerRef}>
        {STAGE_COMPONENTS.map((Stage, i) => (
          <group
            key={i}
            ref={(el) => {
              stageRefs.current[i] = el
            }}
            visible={i === activeStep}
          >
            <Stage />
          </group>
        ))}
      </group>
    </group>
  )
}

/* ──────────────────────── kamera-parallax ──────────────────────── */
/** Mjuk kamera-parallax som följer musen — ger djup utan att desorientera. */
function CameraRig() {
  useFrame((state) => {
    const { camera, pointer } = state
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, pointer.x * 0.55, 0.045)
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0.35 + pointer.y * 0.4, 0.045)
    camera.lookAt(0, 0.05, 0)
  })
  return null
}

function PipelineScene({ activeStep }: { activeStep: number }) {
  const keyLightRef = useRef<THREE.PointLight>(null)
  const keyColor = useRef(TEAL.clone())

  useFrame((_, delta) => {
    const target = TEAL.clone().lerp(GREEN, activeStep / (TOTAL_STEPS - 1))
    keyColor.current.lerp(target, Math.min(1, delta * 2.5))
    if (keyLightRef.current) keyLightRef.current.color.copy(keyColor.current)
  })

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0.35, 7.4]} fov={32} />
      <CameraRig />

      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#bff7ee", "#050914", 0.55]} />
      <pointLight ref={keyLightRef} position={[3.4, 4.2, 5.5]} intensity={26} color={ACCENT} distance={24} />
      <pointLight position={[-4.5, -1.5, 3.5]} intensity={9} color="#60a5fa" distance={20} />
      <pointLight position={[0, -2.6, 4]} intensity={6} color={GREEN} distance={18} />
      <directionalLight position={[2, 5, 4]} intensity={0.5} color="#ffffff" />

      <Pedestal activeStep={activeStep} />
      <FocusStage activeStep={activeStep} />
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
          <div className="relative min-h-[420px] overflow-hidden rounded-[28px] border border-border/20 bg-[#060b16] md:min-h-[520px]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(45,212,191,0.20),transparent_55%),radial-gradient(circle_at_80%_85%,rgba(34,197,94,0.12),transparent_50%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_40%)]" />
            <Canvas
              gl={{ alpha: true, antialias: true }}
              dpr={[1, 1.6]}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            >
              <PipelineScene activeStep={activeStep} />
            </Canvas>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-[#060b16] via-[#060b16]/45 to-transparent" />
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
                    <button
                      key={step.number}
                      type="button"
                      aria-label={`Visa steg ${step.number}`}
                      onClick={() => setActiveStep(index)}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        index === activeStep ? "w-8 bg-primary" : "w-2 bg-primary/25 hover:bg-primary/50"
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
