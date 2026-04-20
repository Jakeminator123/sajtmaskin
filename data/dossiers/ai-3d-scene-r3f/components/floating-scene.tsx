"use client";

import { Canvas } from "@react-three/fiber";
import { Float, OrbitControls, Environment } from "@react-three/drei";
import { Suspense } from "react";
import { FloatingMesh } from "@/components/floating-mesh";

/**
 * Decorative 3D scene wrapper. Drop this anywhere on the page.
 *
 * Usage:
 *   <section className="relative h-[420px]">
 *     <FloatingScene className="absolute inset-0 -z-10" />
 *     <div className="relative z-10">...hero copy...</div>
 *   </section>
 *
 * Replace <FloatingMesh /> with your own mesh component. Whatever you
 * import here MUST exist as a real file in components/ — see
 * floating-mesh.tsx for the minimal example.
 */
export function FloatingScene({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        className="motion-reduce:hidden"
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <Suspense fallback={null}>
          <Float speed={1.5} rotationIntensity={0.6} floatIntensity={1.2}>
            <FloatingMesh />
          </Float>
          <Environment preset="studio" />
        </Suspense>
        <OrbitControls enableZoom={false} enablePan={false} />
      </Canvas>
    </div>
  );
}
