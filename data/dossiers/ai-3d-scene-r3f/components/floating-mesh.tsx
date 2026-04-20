"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";

/**
 * Minimal mesh that rotates on each frame. Replace the geometry to suit
 * the user's request — book = thin box, planet = sphere, etc.
 *
 * Geometries that ship with three (no extra deps):
 *   <boxGeometry args={[w, h, d]} />
 *   <sphereGeometry args={[r, segW, segH]} />
 *   <cylinderGeometry args={[rTop, rBottom, h, segR]} />
 *   <planeGeometry args={[w, h]} />
 *   <torusGeometry args={[r, tube, segR, segT]} />
 */
export function FloatingMesh() {
  const meshRef = useRef<Mesh>(null);

  useFrame((_state, delta) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.y += delta * 0.4;
    meshRef.current.rotation.x += delta * 0.15;
  });

  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      <boxGeometry args={[1.6, 2.2, 0.25]} />
      <meshStandardMaterial color="#d4a373" roughness={0.4} metalness={0.1} />
    </mesh>
  );
}
