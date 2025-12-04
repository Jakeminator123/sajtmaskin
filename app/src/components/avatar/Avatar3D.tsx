"use client";

import { Suspense, useState, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import { AvatarModel, AvatarAnimation } from "./AvatarModel";

interface Avatar3DProps {
  animation?: AvatarAnimation;
  className?: string;
  enableControls?: boolean;
  autoRotate?: boolean;
  onAnimationComplete?: () => void;
}

// Loading fallback
function LoadingFallback() {
  return (
    <mesh>
      <sphereGeometry args={[0.5, 32, 32]} />
      <meshStandardMaterial color="#00b8b8" wireframe />
    </mesh>
  );
}

export function Avatar3D({
  animation = "idle",
  className = "",
  enableControls = false,
  autoRotate = false,
  onAnimationComplete,
}: Avatar3DProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  const handleAnimationComplete = useCallback(() => {
    onAnimationComplete?.();
  }, [onAnimationComplete]);

  return (
    <div className={`relative ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 3], fov: 50 }}
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
        onCreated={() => setIsLoaded(true)}
      >
        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[5, 5, 5]}
          intensity={1}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight position={[-5, 5, -5]} intensity={0.3} />

        {/* Environment for reflections */}
        <Environment preset="city" />

        {/* Avatar */}
        <Suspense fallback={<LoadingFallback />}>
          <AvatarModel
            animation={animation}
            position={[0, -1.2, 0]}
            scale={1.2}
            onAnimationComplete={handleAnimationComplete}
          />
        </Suspense>

        {/* Shadow */}
        <ContactShadows
          position={[0, -1.2, 0]}
          opacity={0.4}
          scale={10}
          blur={2}
          far={4}
        />

        {/* Controls */}
        {enableControls && (
          <OrbitControls
            enablePan={false}
            enableZoom={false}
            autoRotate={autoRotate}
            autoRotateSpeed={0.5}
            minPolarAngle={Math.PI / 3}
            maxPolarAngle={Math.PI / 2}
          />
        )}
      </Canvas>

      {/* Loading overlay */}
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

export default Avatar3D;

