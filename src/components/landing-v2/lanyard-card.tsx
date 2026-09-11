"use client"

/**
 * LanyardCard — ett fysikdrivet "nyckelband" med Sajtmaskins visitkort som
 * hänger från toppen av hjältesektionen. Kortet svänger av sig självt och går
 * att dra/kasta med muspekaren eller touch. Byggt med @react-three/rapier för
 * fysik och meshline för själva bandet. Inga externa 3D-modeller används —
 * kortet byggs av en RoundedBox, foliekant och belysta texturytor.
 */

import { useEffect, useMemo, useRef, useState } from "react"
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
import { createCardGrainTexture } from "@/components/landing-v2/lanyard-card-grain"
import {
  LANYARD_CARD_LAYOUT,
  applyLanyardTextureCrop,
  getLanyardCardFaceSize,
  stabilizeLanyardAngularVelocity,
} from "@/components/landing-v2/lanyard-card-layout"

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
// Tre kortare, redan utspända repsegment håller hela visitkortet inom
// kameran när fysiken har stabiliserats. De tidigare 1.0-segmenten startade
// hoptryckta men föll sedan ut till full längd och klippte av kortets nederkant.
const {
  ropeSegmentLength: ROPE_SEGMENT_LENGTH,
  ropeSegmentCount: ROPE_SEGMENT_COUNT,
  cardJointY: CARD_JOINT_Y,
  fixedAnchorY: FIXED_ANCHOR_Y,
  cardWidth: CARD_WIDTH,
  cardHeight: CARD_HEIGHT,
  cardDepth: CARD_DEPTH,
  cardRadius: CARD_RADIUS,
  cardVisualOffsetY: CARD_VISUAL_OFFSET_Y,
  colliderHalfExtents: COLLIDER_HALF_EXTENTS,
  cardLinearDamping: CARD_LINEAR_DAMPING,
  cardAngularDamping: CARD_ANGULAR_DAMPING,
  ropeLinearDamping: ROPE_LINEAR_DAMPING,
  ropeAngularDamping: ROPE_ANGULAR_DAMPING,
  gravity: CARD_GRAVITY,
  initialImpulse: INITIAL_IMPULSE,
  cameraDistance: CAMERA_DISTANCE,
  cameraFovDegrees: CAMERA_FOV_DEGREES,
  cameraY: CAMERA_Y,
  cameraLookAtY: CAMERA_LOOK_AT_Y,
  frontTexture: FRONT_TEXTURE_CROP,
  backTexture: BACK_TEXTURE_CROP,
} = LANYARD_CARD_LAYOUT
const CARD_START_Y = -(ROPE_SEGMENT_LENGTH * ROPE_SEGMENT_COUNT + CARD_JOINT_Y)
const FACE = getLanyardCardFaceSize()

type BandProps = { maxSpeed?: number; minSpeed?: number; autoSwing?: boolean }

function useCompactLanyardCanvas() {
  return useThree((state) => state.size.width < 480)
}

function LanyardLights() {
  const compact = useCompactLanyardCanvas()
  return (
    <>
      <ambientLight intensity={0.48} />
      <directionalLight position={[3.2, 4.6, 4.2]} intensity={compact ? 1.05 : 1.15} />
      {compact ? null : (
        <directionalLight position={[-3.4, 1.2, 2.4]} intensity={0.35} color={ACCENT} />
      )}
    </>
  )
}

function CameraRig() {
  const framed = useRef(false)
  useFrame(({ camera }) => {
    if (framed.current) return
    camera.position.set(0, CAMERA_Y, CAMERA_DISTANCE)
    camera.lookAt(0, CAMERA_LOOK_AT_Y, 0)
    framed.current = true
  })
  return null
}

function CardBody({
  texture,
  backTexture,
  grain,
}: {
  texture: THREE.Texture
  backTexture: THREE.Texture
  grain: THREE.Texture
}) {
  const compact = useCompactLanyardCanvas()
  const holeY = CARD_HEIGHT / 2 - 0.14
  const faceClearcoat = compact ? 0.34 : 0.82
  const bodyClearcoat = compact ? 0.28 : 0.55
  return (
    <>
      {/* Foliekant — ger tjocklek och metallglans när kortet snurrar. */}
      <RoundedBox
        args={[CARD_WIDTH + 0.04, CARD_HEIGHT + 0.04, CARD_DEPTH * 0.62]}
        radius={CARD_RADIUS + 0.012}
        smoothness={4}
      >
        <meshStandardMaterial
          color="#9aa8b8"
          metalness={0.92}
          roughness={0.28}
          envMapIntensity={1.35}
        />
      </RoundedBox>

      {/* Plastkropp */}
      <RoundedBox args={[CARD_WIDTH, CARD_HEIGHT, CARD_DEPTH]} radius={CARD_RADIUS} smoothness={4} castShadow receiveShadow>
        <meshPhysicalMaterial
          color="#070b10"
          metalness={0.42}
          roughness={0.46}
          roughnessMap={grain}
          clearcoat={bodyClearcoat}
          clearcoatRoughness={0.32}
          reflectivity={0.55}
        />
      </RoundedBox>

      {/* Framsida — varumärkestextur som belyst yta, inte en platt dekal. */}
      <mesh position={[0, 0, FACE.z]}>
        <planeGeometry args={[FACE.width, FACE.height]} />
        <meshPhysicalMaterial
          map={texture}
          roughnessMap={grain}
          roughness={0.32}
          metalness={0.14}
          clearcoat={faceClearcoat}
          clearcoatRoughness={0.16}
          envMapIntensity={1.15}
          toneMapped={false}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>

      {/* Baksida — cookie-motivet, samma fysiska yta som framsidan. */}
      <mesh position={[0, 0, -FACE.z]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[FACE.width, FACE.height]} />
        <meshPhysicalMaterial
          map={backTexture}
          roughnessMap={grain}
          roughness={0.34}
          metalness={0.12}
          clearcoat={compact ? 0.3 : 0.78}
          clearcoatRoughness={0.2}
          envMapIntensity={1.05}
          toneMapped={false}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>

      {/* Stansat hål + metallögla */}
      <mesh position={[0, holeY, 0]}>
        <boxGeometry args={[0.36, 0.08, CARD_DEPTH + 0.02]} />
        <meshPhysicalMaterial color="#030508" metalness={0.55} roughness={0.42} />
      </mesh>
      <mesh position={[0, holeY, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.07, 0.012, 10, 20]} />
        <meshStandardMaterial color="#c5d0dc" metalness={1} roughness={0.22} envMapIntensity={1.4} />
      </mesh>

      {/* Metallclips ovanför kortet */}
      <mesh position={[0, CARD_HEIGHT / 2 + 0.16, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.125, 0.028, 14, 28]} />
        <meshStandardMaterial color="#d6dee8" metalness={1} roughness={0.18} envMapIntensity={1.5} />
      </mesh>
      <mesh position={[0, CARD_HEIGHT / 2 + 0.05, 0]}>
        <boxGeometry args={[0.09, 0.15, 0.045]} />
        <meshStandardMaterial color="#9aa8b8" metalness={1} roughness={0.26} envMapIntensity={1.25} />
      </mesh>
    </>
  )
}

function Band({ maxSpeed = 50, minSpeed = 10, autoSwing = true }: BandProps) {
  const band = useRef<THREE.Mesh>(null)
  const visual = useRef<THREE.Group>(null)
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
  const tilt = useRef({ x: 0, y: 0 }).current

  const { width, height } = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const [dragged, setDragged] = useState<false | THREE.Vector3>(false)
  const [hovered, setHovered] = useState(false)
  // Skiljer ett snabbt "stöt till"-klick från ett drag.
  const pressInfo = useRef<{ x: number; y: number; t: number } | null>(null)

  const texture = useTexture(CARD_TEXTURE)
  const backTexture = useTexture(CARD_BACK_TEXTURE)
  const grain = useMemo(() => createCardGrainTexture(), [])
  useEffect(() => () => grain.dispose(), [grain])

  const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
  useEffect(() => {
    // drei's useTexture returns a shared THREE.Texture that must be cropped
    // in place — cloning would break GPU cache and the card UV mapping.
    applyLanyardTextureCrop(texture, FRONT_TEXTURE_CROP, anisotropy)
  }, [texture, anisotropy])
  useEffect(() => {
    applyLanyardTextureCrop(backTexture, BACK_TEXTURE_CROP, anisotropy)
  }, [backTexture, anisotropy])

  // Utjämnade punkter för ett mjukt band. Startpunkterna motsvarar en rak
  // lodrät lina så att geometrin är giltig redan innan fysiken kickat igång.
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(
          0,
          FIXED_ANCHOR_Y - ROPE_SEGMENT_LENGTH * ROPE_SEGMENT_COUNT,
          0,
        ),
        new THREE.Vector3(0, FIXED_ANCHOR_Y - ROPE_SEGMENT_LENGTH * 2, 0),
        new THREE.Vector3(0, FIXED_ANCHOR_Y - ROPE_SEGMENT_LENGTH, 0),
        new THREE.Vector3(0, FIXED_ANCHOR_Y, 0),
      ]),
    [],
  )
  // Återanvänd punkterna i stället för att allokera 33 nya Vector3 varje
  // frame. Det minskar GC-pauser precis när användaren trycker på canvasen.
  const bandPoints = useMemo(
    () => Array.from({ length: 19 }, () => new THREE.Vector3()),
    [],
  )

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
      card.current?.applyImpulse(INITIAL_IMPULSE, true)
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

    // Extra lokal lutning under drag — kortet lutar in i rörelsen utan att
    // slåss med Rapier-rotationen när kroppen är dynamisk igen.
    const tiltStiffness = Math.min(1, delta * (dragged ? 10 : 6))
    const targetTiltY = dragged ? THREE.MathUtils.clamp(state.pointer.x * 0.32, -0.38, 0.38) : 0
    const targetTiltX = dragged ? THREE.MathUtils.clamp(-state.pointer.y * 0.1, -0.18, 0.18) : 0
    tilt.x += (targetTiltX - tilt.x) * tiltStiffness
    tilt.y += (targetTiltY - tilt.y) * tiltStiffness
    if (visual.current) {
      visual.current.rotation.x = tilt.x
      visual.current.rotation.y = tilt.y
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
      card.current.setAngvel(
        stabilizeLanyardAngularVelocity(a, r, euler, quat, ang),
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
          angularDamping={ROPE_ANGULAR_DAMPING}
          linearDamping={ROPE_LINEAR_DAMPING}
        >
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody
          ref={j2}
          position={[0, -ROPE_SEGMENT_LENGTH * 2, 0]}
          colliders={false}
          angularDamping={ROPE_ANGULAR_DAMPING}
          linearDamping={ROPE_LINEAR_DAMPING}
        >
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody
          ref={j3}
          position={[0, -ROPE_SEGMENT_LENGTH * ROPE_SEGMENT_COUNT, 0]}
          colliders={false}
          angularDamping={ROPE_ANGULAR_DAMPING}
          linearDamping={ROPE_LINEAR_DAMPING}
        >
          <BallCollider args={[0.1]} />
        </RigidBody>

        <RigidBody
          ref={card}
          position={[0, CARD_START_Y, 0]}
          colliders={false}
          angularDamping={CARD_ANGULAR_DAMPING}
          linearDamping={CARD_LINEAR_DAMPING}
          type={dragged ? "kinematicPosition" : "dynamic"}
        >
          <CuboidCollider args={[...COLLIDER_HALF_EXTENTS]} />
          <group
            ref={visual}
            scale={1}
            position={[0, CARD_VISUAL_OFFSET_Y, 0]}
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
                    card.current?.applyTorqueImpulse({ x: 0, y: 6.2 * side, z: 0.12 * side }, true)
                    card.current?.applyImpulse({ x: 0, y: 0, z: -0.55 }, true)
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
            <CardBody texture={texture} backTexture={backTexture} grain={grain} />
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
          lineWidth={0.17}
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
        camera={{ position: [0, CAMERA_Y, CAMERA_DISTANCE], fov: CAMERA_FOV_DEGREES }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent", touchAction: "pan-y pinch-zoom" }}
        dpr={[1, 1.35]}
        performance={{ min: 0.5, max: 1, debounce: 200 }}
      >
        <AdaptiveDpr />
        <CameraRig />
        <LanyardLights />
        <Physics gravity={[...CARD_GRAVITY]} timeStep={1 / 60}>
          <Band autoSwing={autoSwing} />
        </Physics>
        <Environment resolution={64}>
          <Lightformer intensity={2.6} color={ACCENT} position={[3, 2, 3]} scale={[6, 6, 1]} form="rect" />
          <Lightformer intensity={1.5} color="#38bdf8" position={[-4, 1, 2]} scale={[5, 5, 1]} form="rect" />
          <Lightformer intensity={1.15} color="#ffffff" position={[0, 4, -3]} scale={[10, 3, 1]} form="rect" />
        </Environment>
      </Canvas>
    </div>
  )
}
