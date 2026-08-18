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
import { Environment, Lightformer, RoundedBox, useTexture } from "@react-three/drei"
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
const ACCENT = "#2dd4bf"

type BandProps = { maxSpeed?: number; minSpeed?: number }

function Band({ maxSpeed = 50, minSpeed = 10 }: BandProps) {
  const band = useRef<THREE.Mesh>(null)
  const fixed = useRef<RapierRigidBody>(null)
  const j1 = useRef<RapierRigidBody>(null)
  const j2 = useRef<RapierRigidBody>(null)
  const j3 = useRef<RapierRigidBody>(null)
  const card = useRef<RapierRigidBody>(null)

  const vec = useRef(new THREE.Vector3()).current
  const ang = useRef(new THREE.Vector3()).current
  const dir = useRef(new THREE.Vector3()).current
  const quat = useRef(new THREE.Quaternion()).current
  const euler = useRef(new THREE.Euler()).current

  const { width, height } = useThree((s) => s.size)
  const [dragged, setDragged] = useState<false | THREE.Vector3>(false)
  const [hovered, setHovered] = useState(false)

  const texture = useTexture(CARD_TEXTURE)
  // Beskär texturen till kortets stående format (sidorna är bara mörk gradient).
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.center.set(0.5, 0.5)
    texture.repeat.set(0.74, 1)
    texture.offset.set(0.13, 0)
    texture.needsUpdate = true
  }, [texture])

  // Utjämnade punkter för ett mjukt band.
  const curve = useRef(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]),
  ).current

  const lerped = useRef({ j1: new THREE.Vector3(), j2: new THREE.Vector3() }).current

  // Rep-leder mellan ankaret och kortet.
  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1])
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1])
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1])
  useSphericalJoint(j3, card, [[0, 0, 0], [0, 1.45, 0]])

  useEffect(() => {
    if (hovered) document.body.style.cursor = dragged ? "grabbing" : "grab"
    return () => {
      document.body.style.cursor = "auto"
    }
  }, [hovered, dragged])

  // Ge kortet en liten knuff i starten så det gungar mjukt till liv.
  useEffect(() => {
    const t = setTimeout(() => {
      card.current?.applyImpulse({ x: -7, y: 0, z: 1.5 }, true)
    }, 800)
    return () => clearTimeout(t)
  }, [])

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
        const target = new THREE.Vector3(trans.x, trans.y, trans.z)
        if (store.lengthSq() === 0) store.copy(target)
        const clampedDistance = Math.max(0.1, Math.min(1, store.distanceTo(target)))
        store.lerp(target, delta * (minSpeed + clampedDistance * (maxSpeed - minSpeed)))
      })

      const t3 = j3.current.translation()
      const t0 = fixed.current.translation()
      curve.points[0].set(t3.x, t3.y, t3.z)
      curve.points[1].copy(lerped.j2)
      curve.points[2].copy(lerped.j1)
      curve.points[3].set(t0.x, t0.y, t0.z)
      const geometry = band.current.geometry as unknown as {
        setPoints: (pts: THREE.Vector3[]) => void
      }
      geometry.setPoints(curve.getPoints(32))

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
      <group position={[0, 2.8, 0]}>
        <RigidBody ref={fixed} type="fixed" colliders={false} />
        <RigidBody ref={j1} position={[0, -0.6, 0]} colliders={false} angularDamping={2} linearDamping={2}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody ref={j2} position={[0, -1.2, 0]} colliders={false} angularDamping={2} linearDamping={2}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody ref={j3} position={[0, -1.8, 0]} colliders={false} angularDamping={2} linearDamping={2}>
          <BallCollider args={[0.1]} />
        </RigidBody>

        <RigidBody
          ref={card}
          position={[0, -3.4, 0]}
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
              ;(e.target as Element)?.releasePointerCapture?.(e.pointerId)
              setDragged(false)
            }}
            onPointerDown={(e) => {
              ;(e.target as Element)?.setPointerCapture?.(e.pointerId)
              const t = card.current!.translation()
              setDragged(new THREE.Vector3(e.point.x - t.x, e.point.y - t.y, e.point.z - t.z))
            }}
          >
            {/* Själva kortet */}
            <RoundedBox args={[1.6, 2.3, 0.04]} radius={0.09} smoothness={5} castShadow receiveShadow>
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

            {/* Baksida (samma textur, nedtonad) */}
            <mesh position={[0, 0, -0.025]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[1.5, 2.18]} />
              <meshBasicMaterial map={texture} toneMapped={false} color="#7fb8b0" />
            </mesh>

            {/* Hål/urtag högst upp */}
            <mesh position={[0, 1.02, 0]}>
              <boxGeometry args={[0.34, 0.09, 0.06]} />
              <meshPhysicalMaterial color="#04070a" metalness={0.6} roughness={0.4} />
            </mesh>

            {/* Metallclips ovanför kortet */}
            <mesh position={[0, 1.25, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.12, 0.03, 16, 32]} />
              <meshStandardMaterial color="#cbd5e1" metalness={1} roughness={0.25} />
            </mesh>
            <mesh position={[0, 1.14, 0]}>
              <boxGeometry args={[0.1, 0.16, 0.05]} />
              <meshStandardMaterial color="#94a3b8" metalness={1} roughness={0.3} />
            </mesh>
          </group>
        </RigidBody>
      </group>

      {/* Bandet */}
      <mesh ref={band}>
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

export function LanyardCard({ className = "" }: { className?: string }) {
  return (
    <div className={`relative w-full select-none ${className}`} aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 11], fov: 25 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent", touchAction: "none" }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 4]} intensity={1.1} castShadow />
        <Physics gravity={[0, -40, 0]} timeStep={1 / 60}>
          <Band />
        </Physics>
        <Environment resolution={256}>
          <Lightformer intensity={2.4} color={ACCENT} position={[3, 2, 3]} scale={[6, 6, 1]} form="rect" />
          <Lightformer intensity={1.6} color="#38bdf8" position={[-4, 1, 2]} scale={[5, 5, 1]} form="rect" />
          <Lightformer intensity={1} color="#ffffff" position={[0, 4, -3]} scale={[10, 3, 1]} form="rect" />
        </Environment>
      </Canvas>
    </div>
  )
}
