"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Object3D } from "three";
import type * as THREE from "three";
import { useInView, usePrefersReducedMotion } from "@/components/landing-v2/landing-hooks";

function DottedSphere({ radius = 1.2, dotCount = 800, dotSize = 0.035 }) {
  const groupRef = useRef<THREE.Group>(null);
  const instancedRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);

  const dots = useMemo(() => {
    const positions: [number, number, number][] = [];
    const phi = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < dotCount; i++) {
      const y = 1 - (i / (dotCount - 1)) * 2;
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = phi * i;

      const x = Math.cos(theta) * radiusAtY * radius;
      const z = Math.sin(theta) * radiusAtY * radius;
      positions.push([x, y * radius, z]);
    }
    return positions;
  }, [radius, dotCount]);

  useEffect(() => {
    const mesh = instancedRef.current;
    if (!mesh) return;

    for (let i = 0; i < dots.length; i++) {
      const [x, y, z] = dots[i];
      dummy.position.set(x, y, z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [dots, dummy]);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.08;
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.05) * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={instancedRef} args={[undefined, undefined, dots.length]}>
        <sphereGeometry args={[dotSize, 8, 8]} />
        <meshStandardMaterial
          color="#F59E0B"
          emissive="#E67E22"
          emissiveIntensity={0.8}
          metalness={0.9}
          roughness={0.1}
        />
      </instancedMesh>
    </group>
  );
}

function GlowingCore() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 1.5) * 0.02;
      meshRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.15, 32, 32]} />
      <meshStandardMaterial
        color="#F59E0B"
        emissive="#E67E22"
        emissiveIntensity={2}
        metalness={0.5}
        roughness={0.1}
      />
    </mesh>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[5, 5, 5]} intensity={2} color="#F59E0B" />
      <pointLight position={[-5, -5, -5]} intensity={1} color="#E67E22" />
      <pointLight position={[0, 0, 5]} intensity={1.5} color="#FCD34D" />
      <GlowingCore />
      <DottedSphere radius={1.2} dotCount={800} dotSize={0.035} />
    </>
  );
}

function StaticOrbFallback() {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      aria-hidden
    >
      <div className="h-[70%] w-[70%] rounded-full border border-primary/25 bg-primary/15 shadow-[0_0_60px_rgba(230,126,34,0.25)]" />
    </div>
  );
}

export function ParticleOrb() {
  const { ref, visible } = useInView(0.12);
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div ref={ref} className="w-48 h-48 relative">
      <div
        className="absolute inset-[-30%] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(230,126,34,0.2) 0%, rgba(230,126,34,0.05) 40%, transparent 70%)",
        }}
      />
      {reducedMotion ? (
        <StaticOrbFallback />
      ) : visible ? (
        <Canvas
          camera={{ position: [0, 0, 4], fov: 45 }}
          style={{ background: "transparent" }}
          dpr={[1, 1.65]}
          gl={{ alpha: true, antialias: true }}
        >
          <Scene />
        </Canvas>
      ) : (
        <div className="absolute inset-0" aria-hidden />
      )}
    </div>
  );
}
