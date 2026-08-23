"use client"

/**
 * LanyardCard — ett fysikdrivet "nyckelband" med Sajtmaskins visitkort som
 * hänger från toppen av hjältesektionen. Kortet svänger av sig självt och går
 * att dra/kasta med muspekaren eller touch. Byggt med @react-three/rapier för
 * fysik och meshline för själva bandet. Inga externa 3D-modeller används —
 * kortet byggs av en RoundedBox och en textur som genereras i public/branding.
 */

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber"
import { AdaptiveDpr, Environment, Lightformer, RoundedBox, useTexture } from "@react-three/drei"
import {
  BallCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  useRopeJoint,
  useSphericalJoint,
  type RapierRigidBody,
} from "@react-three/rapier"
import { MeshLineGeometry, MeshLineMaterial } from "meshline"

extend({ MeshLineGeometry, MeshLineMaterial })

// TypeScript: gör meshline-elementen kända för JSX.
declare module "@react-three/fiber" {
  interface ThreeElements {
    meshLineGeometry: ThreeElements["mesh"]
    meshLineMaterial: ThreeElements["meshBasicMaterial"] & {
      resolution?: [number, number]
      lineWidth?: number
      color?: THREE.ColorRepresentation
      depthTest?: boolean
      transparent?: boolean
    }
  }
}

const CARD_TEXTURE = "/branding/lanyard-card.png"
const CARD_BACK_TEXTURE = "/branding/lanyard-card-back.png"
const ACCENT = "#2dd4bf"
// Tre kortare, redan utspända repsegment håller visitkortets nederkant inom
// kameran när fysiken har stabiliserats. De tidigare 1.0-segmenten startade
// hoptryckta men föll sedan ut till full längd och klippte av kortets nederkant.
const ROPE_SEGMENT_LENGTH = 0.75
const CARD_JOINT_Y = 1.45
const FIXED_ANCHOR_Y = 2.8
const CARD_START_Y = -(ROPE_SEGMENT_LENGTH * 3 + CARD_JOINT_Y)

type BandProps = { maxSpeed?: number; minSpeed?: number; autoSwing?: boolean }

function Band({ maxSpeed = 50, minSpeed = 10, autoSwing = true }: BandProps) {
  const band = useRef<THREE.Mesh>(null)
  // `null!` — rapiers joint-hooks kräver RefObject<RapierRigidBody> utan null;
  // refs sätts av <RigidBody ref={...}> före första fysik-steget.
  const fixed = useRef<RapierRigidBody>(null!)
  const j1 = useRef<RapierRigidBody>(null!)
  const j2 = useRef<RapierRigidBody>(null!)
  const j3 = useRef<RapierRigidBody>(null!)
  const card = useRef<RapierRigidBody>(null!)

  const vec = useRef(new THREE.Vector3()).current
  const ang = useRef(new THREE.Vector3()).current
  const dir = useRef(new THREE.Vector3()).current
  const quat = useRef(new THREE.Quaternion()).current
  const euler = useRef(new THREE.Euler()).current

  const { width, height } = useThree((s) => s.size)
  const [dragged, setDragged] = useState<false | THREE.Vector3>(false)
  const [hovered, setHovered] = useState(false)
  // Skiljer ett snabbt "stöt till"-klick från ett drag.
  const pressInfo = useRef<{ x: number; y: number; t: number } | null>(null)

  const texture = useTexture(CARD_TEXTURE)
  const backTexture = useTexture(CARD_BACK_TEXTURE)
  // Beskär texturen till kortets stående format (sidorna är bara mörk gradient).
  // Fönstret är flyttat något åt vänster i bilden så att loggan/ordmärket
  // hamnar exakt centrerat på kortet.
  useEffect(() => {
    // drei's useTexture returns a shared THREE.Texture that must be cropped
    // in place — cloning would break GPU cache and the card UV mapping.
    // eslint-disable-next-line react-hooks/immutability -- GPU texture object
    texture.colorSpace = THREE.SRGBColorSpace
    texture.center.set(0.5, 0.5)
    texture.repeat.set(0.74, 1)
    texture.offset.set(0.09, 0)
    texture.needsUpdate = true
  }, [texture])
  // Baksidans cookie-textur har en vit marginal runt den mörka ytan —
  // beskär till ett centrerat fönster som bara visar den mörka kortytan.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- GPU texture object
    backTexture.colorSpace = THREE.SRGBColorSpace
    backTexture.center.set(0.5, 0.5)
    backTexture.repeat.set(0.56, 0.82)
    backTexture.needsUpdate = true
  }, [backTexture])

  // Utjämnade punkter för ett mjukt band. Startpunkterna motsvarar en rak
  // lodrät lina så att geometrin är giltig redan innan fysiken kickat igång.
  const curve = useRef(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, FIXED_ANCHOR_Y - ROPE_SEGMENT_LENGTH * 3, 0),
      new THREE.Vector3(0, FIXED_ANCHOR_Y - ROPE_SEGMENT_LENGTH * 2, 0),
      new THREE.Vector3(0, FIXED_ANCHOR_Y - ROPE_SEGMENT_LENGTH, 0),
      new THREE.Vector3(0, FIXED_ANCHOR_Y, 0),
    ]),
  ).current
  // Återanvänd punkterna i stället för att allokera 33 nya Vector3 varje
  // frame. Det minskar GC-pauser precis när användaren trycker på canvasen.
  const bandPoints = useRef(Array.from({ length: 19 }, () => new THREE.Vector3())).current

  // Ge meshline-geometrin giltiga punkter direkt vid montering, och sätt en
  // manuell boundingSphere så att Three aldrig försöker beräkna den från
  // position-attributet (som kan innehålla NaN under de allra första framen).
  useEffect(() => {
    const geometry = band.current?.geometry as unknown as
      | (THREE.BufferGeometry & { setPoints: (pts: THREE.Vector3[]) => void })
      | undefined
    if (!geometry) return
    bandPoints.forEach((point, index) => {
      curve.getPoint(index / (bandPoints.length - 1), point)
    })
    geometry.setPoints(bandPoints)
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 12)
    geometry.computeBoundingSphere = () => {
      /* Bandet rör sig inom en känd radie — behåll den manuella sfären. */
    }
  }, [bandPoints, curve])

  const lerped = useRef({ j1: new THREE.Vector3(), j2: new THREE.Vector3() }).current
  const targets = useRef({ j1: new THREE.Vector3(), j2: new THREE.Vector3() }).current

  // Rep-leder mellan ankaret och kortet.
  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], ROPE_SEGMENT_LENGTH])
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], ROPE_SEGMENT_LENGTH])
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], ROPE_SEGMENT_LENGTH])
  useSphericalJoint(j3, card, [[0, 0, 0], [0, CARD_JOINT_Y, 0]])

  useEffect(() => {
    if (hovered) document.body.style.cursor = dragged ? "grabbing" : "grab"
    return () => {
      document.body.style.cursor = "auto"
    }
  }, [hovered, dragged])

  // Ge kortet en liten knuff i starten så det gungar mjukt till liv.
  // Knuffen är lagom stor så att snodden känns spänd och kortet snabbt
  // hittar tillbaka till mitten. Hoppas över efter cookie-flippen.
  useEffect(() => {
    if (!autoSwing) return
    const t = setTimeout(() => {
      card.current?.applyImpulse({ x: -3.5, y: 0, z: 0.8 }, true)
    }, 800)
    return () => clearTimeout(t)
  }, [autoSwing])

  useFrame((state, delta) => {
    if (dragged && card.current) {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera)
      dir.copy(vec).sub(state.camera.position).normalize()
      vec.add(dir.multiplyScalar(state.camera.position.length()))
      ;[card, j1, j2, j3, fixed].forEach((r) => r.current?.wakeUp())
      card.current.setNextKinematicTranslation({
        x: vec.x - dragged.x,
        y: vec.y - dragged.y,
        z: vec.z - dragged.z,
      })
    }

    if (fixed.current && j1.current && j2.current && j3.current && card.current && band.current) {
      // Mjuk uppdatering av mellanpunkterna (clampad så bandet inte "hackar").
      ;[j1, j2].forEach((ref, i) => {
        const key = i === 0 ? "j1" : "j2"
        const store = lerped[key as "j1" | "j2"]
        const trans = ref.current!.translation()
        const target = targets[key as "j1" | "j2"].set(trans.x, trans.y, trans.z)
        if (store.lengthSq() === 0) store.copy(target)
        const clampedDistance = Math.max(0.1, Math.min(1, store.distanceTo(target)))
        store.lerp(target, delta * (minSpeed + clampedDistance * (maxSpeed - minSpeed)))
      })

      const t3 = j3.current.translation()
      const t0 = fixed.current.translation()
      // Skydd: de första fysik-framen kan ge NaN innan kropparna initierats.
      const allFinite =
        Number.isFinite(t3.x) &&
        Number.isFinite(t3.y) &&
        Number.isFinite(t0.x) &&
        Number.isFinite(t0.y) &&
        Number.isFinite(lerped.j1.x) &&
        Number.isFinite(lerped.j2.x)
      if (allFinite) {
        curve.points[0].set(t3.x, t3.y, t3.z)
        curve.points[1].copy(lerped.j2)
        curve.points[2].copy(lerped.j1)
        curve.points[3].set(t0.x, t0.y, t0.z)
        const geometry = band.current.geometry as unknown as {
          setPoints: (pts: THREE.Vector3[]) => void
        }
        bandPoints.forEach((point, index) => {
          curve.getPoint(index / (bandPoints.length - 1), point)
        })
        geometry.setPoints(bandPoints)
      }

      // Dämpa rotationen så kortet återgår mot framsidan (quaternion -> euler).
      const a = card.current.angvel()
      const r = card.current.rotation()
      ang.set(a.x, a.y, a.z)
      quat.set(r.x, r.y, r.z, r.w)
      euler.setFromQuaternion(quat)
      card.current.setAngvel(
        {
          x: ang.x - euler.x * 0.3,
          y: ang.y - euler.y * 0.6,
          z: ang.z - euler.z * 0.2,
        },
        false,
      )
    }
  })

  return (
    <>
      <group position={[0, FIXED_ANCHOR_Y, 0]}>
        <RigidBody ref={fixed} type="fixed" colliders={false} />
        <RigidBody
          ref={j1}
          position={[0, -ROPE_SEGMENT_LENGTH, 0]}
          colliders={false}
          angularDamping={2}
          linearDamping={2}
        >
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody
          ref={j2}
          position={[0, -ROPE_SEGMENT_LENGTH * 2, 0]}
          colliders={false}
          angularDamping={2}
          linearDamping={2}
        >
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody
          ref={j3}
          position={[0, -ROPE_SEGMENT_LENGTH * 3, 0]}
          colliders={false}
          angularDamping={2}
          linearDamping={2}
        >
          <BallCollider args={[0.1]} />
        </RigidBody>

        <RigidBody
          ref={card}
          position={[0, CARD_START_Y, 0]}
          colliders={false}
          angularDamping={2.5}
          linearDamping={2.5}
          type={dragged ? "kinematicPosition" : "dynamic"}
        >
          <CuboidCollider args={[0.85, 1.2, 0.02]} />
          <group
            scale={1}
            position={[0, -0.05, 0]}
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
            onPointerUp={(e) => {
              const press = pressInfo.current
              pressInfo.current = null
              setDragged(false)
              try {
                ;(e.target as Element)?.releasePointerCapture?.(e.pointerId)
              } catch {
                /* Ogiltigt pointerId — ignorera. */
              }
              // Snabbt klick utan rörelse = "stöt till" kortet: det snurrar
              // runt sin egen axel och fjädrar tillbaka som en spänd snodd.
              if (press) {
                const dx = e.nativeEvent.clientX - press.x
                const dy = e.nativeEvent.clientY - press.y
                const quick = performance.now() - press.t < 320 && Math.hypot(dx, dy) < 8
                if (quick) {
                  // Snurra åt det håll man "petar" på kortet (vänster/höger halva).
                  const side = e.point.x >= (card.current?.translation().x ?? 0) ? 1 : -1
                  window.setTimeout(() => {
                    card.current?.wakeUp()
                    card.current?.applyTorqueImpulse({ x: 0, y: 5.5 * side, z: 0.15 * side }, true)
                    card.current?.applyImpulse({ x: 0, y: 0, z: -0.8 }, true)
                  }, 30)
                }
              }
            }}
            onPointerCancel={() => {
              pressInfo.current = null
              setDragged(false)
            }}
            onLostPointerCapture={() => {
              pressInfo.current = null
              setDragged(false)
            }}
            onPointerDown={(e) => {
              // Registrera trycket FÖRST — setPointerCapture kan kasta för
              // inaktiva pekare och får inte stoppa klick-snurren.
              pressInfo.current = {
                x: e.nativeEvent.clientX,
                y: e.nativeEvent.clientY,
                t: performance.now(),
              }
              try {
                ;(e.target as Element)?.setPointerCapture?.(e.pointerId)
              } catch {
                /* Ogiltigt pointerId (t.ex. syntetiska event) — ignorera. */
              }
              const t = card.current!.translation()
              setDragged(new THREE.Vector3(e.point.x - t.x, e.point.y - t.y, e.point.z - t.z))
            }}
          >
            {/* Själva kortet */}
            <RoundedBox args={[1.6, 2.3, 0.04]} radius={0.09} smoothness={3} castShadow receiveShadow>
              <meshPhysicalMaterial
                color="#0a0f14"
                metalness={0.55}
                roughness={0.35}
                clearcoat={0.6}
                clearcoatRoughness={0.3}
                reflectivity={0.6}
              />
            </RoundedBox>

            {/* Framsida med varumärkestextur */}
            <mesh position={[0, 0, 0.025]}>
              <planeGeometry args={[1.5, 2.18]} />
              <meshBasicMaterial map={texture} toneMapped={false} />
            </mesh>

            {/* Baksida — cookie-designen (som ursprungliga cookie-bannern) */}
            <mesh position={[0, 0, -0.025]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[1.5, 2.18]} />
              <meshBasicMaterial map={backTexture} toneMapped={false} />
            </mesh>

            {/* Hål/urtag högst upp */}
            <mesh position={[0, 1.02, 0]}>
              <boxGeometry args={[0.34, 0.09, 0.06]} />
              <meshPhysicalMaterial color="#04070a" metalness={0.6} roughness={0.4} />
            </mesh>

            {/* Metallclips ovanför kortet */}
            <mesh position={[0, 1.25, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.12, 0.03, 12, 24]} />
              <meshStandardMaterial color="#cbd5e1" metalness={1} roughness={0.25} />
            </mesh>
            <mesh position={[0, 1.14, 0]}>
              <boxGeometry args={[0.1, 0.16, 0.05]} />
              <meshStandardMaterial color="#94a3b8" metalness={1} roughness={0.3} />
            </mesh>
          </group>
        </RigidBody>
      </group>

      {/* Bandet — exkluderas från raycasting (tom geometri första framen
          ger annars NaN i bounding-sphere när pekar-event raycastas). */}
      <mesh ref={band} raycast={() => null} frustumCulled={false}>
        <meshLineGeometry />
        <meshLineMaterial
          color={ACCENT}
          depthTest={false}
          resolution={[width, height]}
          lineWidth={0.16}
          transparent
        />
      </mesh>
    </>
  )
}

export function LanyardCard({
  className = "",
  autoSwing = true,
}: {
  className?: string
  autoSwing?: boolean
}) {
  return (
    <div className={`relative w-full select-none ${className}`} aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 11], fov: 25 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent", touchAction: "pan-y pinch-zoom" }}
        dpr={[1, 1.35]}
        performance={{ min: 0.5, max: 1, debounce: 200 }}
      >
        <AdaptiveDpr />
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 4]} intensity={1.1} castShadow />
        <Physics gravity={[0, -40, 0]} timeStep={1 / 60}>
          <Band autoSwing={autoSwing} />
        </Physics>
        <Environment resolution={64}>
          <Lightformer intensity={2.4} color={ACCENT} position={[3, 2, 3]} scale={[6, 6, 1]} form="rect" />
          <Lightformer intensity={1.6} color="#38bdf8" position={[-4, 1, 2]} scale={[5, 5, 1]} form="rect" />
          <Lightformer intensity={1} color="#ffffff" position={[0, 4, -3]} scale={[10, 3, 1]} form="rect" />
        </Environment>
      </Canvas>
    </div>
  )
}
