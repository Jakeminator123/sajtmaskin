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
 * - Click to open chat modal for asking questions
 * - Proactive tips when user seems stuck
 * - Dismiss/minimize button to hide avatar
 * - Fully configurable via avatar-config.ts
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Canvas } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { Suspense } from "react";
import { X, MessageCircle } from "lucide-react";
import { AvatarModel } from "./AvatarModel";
import { AvatarTooltip } from "./AvatarTooltip";
import { AvatarChatModal } from "./AvatarChatModal";
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
// PROACTIVE TIPS CONFIG
// ============================================================================

/** Time in ms before showing a proactive tip when user is idle */
const PROACTIVE_TIP_DELAY = 30000; // 30 seconds

/** Tips shown when user seems stuck on a section */
const PROACTIVE_TIPS: Record<AppSection, string[]> = {
  home: [
    "Testa att skriva vad du vill bygga! 🚀",
    "Kolla in mallarna för inspiration!",
    "Behöver du hjälp? Klicka på mig!",
  ],
  builder: [
    "Skriv i chatten för att förfina designen!",
    "Inte nöjd? Be om ändringar så fixar vi!",
    "Klicka 'Ladda ner' för att spara koden.",
  ],
  templates: [
    "Klicka på en mall för att komma igång!",
    "Varje mall är anpassningsbar efteråt.",
  ],
  audit: [
    "Skriv in din webbadress för analys!",
    "Jag kan hitta förbättringsmöjligheter. 🔍",
  ],
  projects: [
    "Klicka på ett projekt för att fortsätta.",
    "Här sparas allt du bygger!",
  ],
  category: ["Välj en underkategori för mer specifika mallar!"],
};

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
// MINIMIZED BUTTON (shown when avatar is dismissed)
// ============================================================================

function MinimizedButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="fixed bottom-4 right-4 z-50 w-12 h-12 
                 bg-gradient-to-br from-teal-600 to-teal-800 
                 rounded-full shadow-lg shadow-teal-500/30 
                 border border-teal-400/30
                 flex items-center justify-center
                 hover:from-teal-500 hover:to-teal-700
                 transition-colors group"
      title="Visa guiden"
    >
      <MessageCircle className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
      {/* Pulse effect */}
      <span className="absolute inset-0 rounded-full bg-teal-500/30 animate-ping" />
    </motion.button>
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
    triggerReaction,
    hideAvatar,
    showAvatar,
  } = useAvatar();

  // Setup behavior (walk-in, section changes, etc.)
  const { handleModelLoaded, isLoaded } = useAvatarBehavior({
    section,
    walkInDelay: AVATAR_CONFIG.walkIn.delay,
    walkInDuration: AVATAR_CONFIG.walkIn.duration,
    showWelcome,
  });

  const [canvasReady, setCanvasReady] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const proactiveTipTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastInteractionRef = useRef<number>(Date.now());

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

  // Handle avatar click - open chat
  const handleAvatarClick = useCallback(() => {
    lastInteractionRef.current = Date.now();
    setChatOpen((prev) => !prev);
    if (!chatOpen) {
      hideTooltip();
    }
  }, [chatOpen, hideTooltip]);

  // Handle dismiss - hide avatar and show minimized button
  const handleDismiss = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // Don't trigger avatar click
      setIsMinimized(true);
      hideAvatar();
      setChatOpen(false);
    },
    [hideAvatar]
  );

  // Handle restore - show avatar again
  const handleRestore = useCallback(() => {
    setIsMinimized(false);
    showAvatar();
  }, [showAvatar]);

  // Setup proactive tips - show tip if user is idle for a while
  useEffect(() => {
    if (!isLoaded || avatarState !== "idle" || isMinimized) return;

    const checkAndShowTip = () => {
      const timeSinceInteraction = Date.now() - lastInteractionRef.current;

      if (
        timeSinceInteraction >= PROACTIVE_TIP_DELAY &&
        !chatOpen &&
        !tooltipVisible
      ) {
        const tips = PROACTIVE_TIPS[section] || PROACTIVE_TIPS.home;
        const randomTip = tips[Math.floor(Math.random() * tips.length)];
        triggerReaction("preview_toggle", randomTip);
        lastInteractionRef.current = Date.now();
      }
    };

    // Check every 10 seconds
    proactiveTipTimerRef.current = setInterval(checkAndShowTip, 10000);

    return () => {
      if (proactiveTipTimerRef.current) {
        clearInterval(proactiveTipTimerRef.current);
      }
    };
  }, [
    isLoaded,
    avatarState,
    section,
    chatOpen,
    tooltipVisible,
    triggerReaction,
    isMinimized,
  ]);

  // Reset interaction timer on user activity
  useEffect(() => {
    const handleActivity = () => {
      lastInteractionRef.current = Date.now();
    };

    window.addEventListener("click", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("scroll", handleActivity);

    return () => {
      window.removeEventListener("click", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("scroll", handleActivity);
    };
  }, []);

  // Show minimized button when avatar is hidden
  if (isMinimized || avatarState === "hidden") {
    return (
      <AnimatePresence>
        <MinimizedButton onClick={handleRestore} />
      </AnimatePresence>
    );
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
          {/* Chat Modal */}
          <AvatarChatModal
            isOpen={chatOpen}
            onClose={() => setChatOpen(false)}
            currentSection={section}
          />

          {/* Tooltip - positioned to the left of avatar */}
          {!chatOpen && (
            <AvatarTooltip
              message={tooltipMessage}
              visible={tooltipVisible}
              onClose={hideTooltip}
              position="left"
            />
          )}

          {/* Avatar container */}
          <div
            className={`relative ${AVATAR_CONFIG.containerWidth} ${AVATAR_CONFIG.containerHeight} cursor-pointer group`}
            onClick={handleAvatarClick}
          >
            {/* Dismiss/Minimize button */}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={handleDismiss}
              className="absolute -top-1 -right-1 z-10 w-6 h-6 
                         bg-gray-900/90 border border-gray-700 rounded-full
                         flex items-center justify-center
                         opacity-0 group-hover:opacity-100
                         hover:bg-red-900/80 hover:border-red-500/50
                         transition-all duration-200"
              title="Göm guiden"
            >
              <X className="w-3 h-3 text-gray-400 hover:text-red-400" />
            </motion.button>

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
              {chatOpen ? "Stäng chat" : "Klicka för hjälp"}
            </div>

            {/* Pulsing indicator when idle for a while */}
            {avatarState === "idle" && !chatOpen && !tooltipVisible && (
              <motion.div
                className="absolute top-2 left-2 w-3 h-3 bg-teal-500 rounded-full"
                animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default FloatingAvatar;
