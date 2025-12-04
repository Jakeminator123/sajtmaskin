"use client";

/**
 * FloatingAvatar.tsx
 * ==================
 * Main avatar component that displays a 3D animated character
 * in the bottom-right corner of the screen.
 *
 * Features:
 * - Walk-in animation from off-screen
 * - Reactive animations based on user actions
 * - Floating tooltip for messages
 * - Fully configurable via avatar-config.ts
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Canvas } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { Suspense } from "react";
import { AvatarModel } from "./AvatarModel";
import { AvatarTooltip } from "./AvatarTooltip";
import { useAvatar, AppSection } from "@/contexts/AvatarContext";
import { useAvatarBehavior } from "./useAvatarBehavior";
import { AVATAR_CONFIG } from "./avatar-config";

// ============================================================================
// TYPES
// ============================================================================

interface FloatingAvatarProps {
  /** Current section the user is viewing */
  section?: AppSection;
  /** Whether to show welcome message on first visit */
  showWelcome?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ============================================================================
// LOADING FALLBACK
// ============================================================================

/** Simple wireframe cube shown while GLB loads */
function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="#00b8b8" wireframe />
    </mesh>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FloatingAvatar({
  section = "home",
  showWelcome = true,
  className = "",
}: FloatingAvatarProps) {
  // Get avatar state from context
  const {
    avatarState,
    currentAnimation,
    tooltipMessage,
    tooltipVisible,
    hideTooltip,
  } = useAvatar();

  // Setup behavior (walk-in, section changes, etc.)
  const { handleModelLoaded } = useAvatarBehavior({
    section,
    walkInDelay: AVATAR_CONFIG.walkIn.delay,
    walkInDuration: AVATAR_CONFIG.walkIn.duration,
    showWelcome,
  });

  const [canvasReady, setCanvasReady] = useState(false);

  // Called when Three.js canvas is ready
  const handleCanvasCreated = useCallback(() => {
    setCanvasReady(true);
    // Small delay to ensure GLB model is ready
    setTimeout(handleModelLoaded, 500);
  }, [handleModelLoaded]);

  // Calculate horizontal position based on current state
  const getXPosition = (): number => {
    switch (avatarState) {
      case "loading":
      case "hidden":
        return AVATAR_CONFIG.walkIn.startX; // Off-screen
      default:
        return 0; // Final position
    }
  };

  // Don't render anything if avatar is hidden
  if (avatarState === "hidden") {
    return null;
  }

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 pointer-events-none ${className}`}
    >
      <AnimatePresence>
        <motion.div
          className="relative pointer-events-auto"
          initial={{ x: AVATAR_CONFIG.walkIn.startX, opacity: 0 }}
          animate={{
            x: getXPosition(),
            opacity: avatarState === "loading" ? 0 : 1,
          }}
          exit={{ x: AVATAR_CONFIG.walkIn.startX, opacity: 0 }}
          transition={{
            type: "spring",
            damping: 20,
            stiffness: 100,
            duration: avatarState === "walking_in" ? 2 : 0.5,
          }}
        >
          {/* Tooltip - positioned to the left of avatar */}
          <AvatarTooltip
            message={tooltipMessage}
            visible={tooltipVisible}
            onClose={hideTooltip}
            position="left"
          />

          {/* Avatar container */}
          <div
            className={`relative ${AVATAR_CONFIG.containerWidth} ${AVATAR_CONFIG.containerHeight} cursor-pointer group`}
          >
            {/* Three.js Canvas */}
            <Canvas
              camera={{
                position: [
                  AVATAR_CONFIG.camera.position.x,
                  AVATAR_CONFIG.camera.position.y,
                  AVATAR_CONFIG.camera.position.z,
                ],
                fov: AVATAR_CONFIG.camera.fov,
              }}
              dpr={[1, 2]}
              gl={{ antialias: true, alpha: true }}
              style={{ background: "transparent" }}
              onCreated={handleCanvasCreated}
            >
              {/* Lighting setup */}
              <ambientLight intensity={AVATAR_CONFIG.lighting.ambient} />
              <directionalLight
                position={[5, 5, 5]}
                intensity={AVATAR_CONFIG.lighting.directional1}
              />
              <directionalLight
                position={[-3, 3, -3]}
                intensity={AVATAR_CONFIG.lighting.directional2}
              />

              {/* Environment for realistic reflections */}
              <Environment preset="city" />

              {/* 3D Avatar */}
              <Suspense fallback={<LoadingFallback />}>
                <AvatarModel
                  animation={currentAnimation}
                  position={[
                    AVATAR_CONFIG.avatar.position.x,
                    AVATAR_CONFIG.avatar.position.y,
                    AVATAR_CONFIG.avatar.position.z,
                  ]}
                  rotation={[
                    AVATAR_CONFIG.avatar.rotation.x,
                    AVATAR_CONFIG.avatar.rotation.y,
                    AVATAR_CONFIG.avatar.rotation.z,
                  ]}
                  scale={AVATAR_CONFIG.avatar.scale}
                />
              </Suspense>
            </Canvas>

            {/* Hover hint */}
            <div
              className="absolute bottom-2 left-1/2 -translate-x-1/2
                         bg-black/80 backdrop-blur-sm 
                         text-xs text-teal-300 px-2 py-1 rounded-full
                         opacity-0 group-hover:opacity-100 transition-opacity
                         whitespace-nowrap pointer-events-none"
            >
              Klicka för hjälp
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default FloatingAvatar;
