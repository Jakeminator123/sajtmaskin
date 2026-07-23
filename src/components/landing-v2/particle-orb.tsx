"use client";

import dynamic from "next/dynamic";
import { useInView, usePrefersReducedMotion, useSaveData } from "@/components/landing-v2/landing-hooks";

/*
 * The Three.js scene (three + @react-three/fiber, hundreds of KB) is split into
 * a client-only dynamic chunk so it stays out of the landing first-load bundle.
 * The sized wrapper + glow below render eagerly, so lazy-loading causes no CLS.
 */
const ParticleOrbCanvas = dynamic(
  () => import("@/components/landing-v2/particle-orb-canvas"),
  { ssr: false },
);

function StaticOrbFallback() {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      aria-hidden
    >
      <div className="h-[70%] w-[70%] rounded-full border border-primary/25 bg-primary/15 shadow-[0_0_60px_rgba(45,212,191,0.25)]" />
    </div>
  );
}

export function ParticleOrb() {
  const { ref, visible } = useInView(0.12);
  const reducedMotion = usePrefersReducedMotion();
  const saveData = useSaveData();
  const staticOnly = reducedMotion || saveData;

  return (
    <div ref={ref} className="w-48 h-48 relative">
      <div
        className="absolute inset-[-30%] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(45,212,191,0.2) 0%, rgba(45,212,191,0.05) 40%, transparent 70%)",
        }}
      />
      {staticOnly ? (
        <StaticOrbFallback />
      ) : visible ? (
        <ParticleOrbCanvas />
      ) : (
        <div className="absolute inset-0" aria-hidden />
      )}
    </div>
  );
}
