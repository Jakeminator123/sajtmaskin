"use client";

/**
 * AvatarTooltip.tsx
 * =================
 * Floating card component for displaying avatar messages.
 * Appears next to the avatar with smooth spring animations.
 */

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface AvatarTooltipProps {
  /** Message to display (null = no tooltip) */
  message: string | null;
  /** Whether the tooltip is visible */
  visible: boolean;
  /** Callback when close button is clicked */
  onClose?: () => void;
  /** Position relative to avatar */
  position?: "left" | "top";
}

// ============================================================================
// STYLES
// ============================================================================

const positionStyles = {
  left: {
    right: "100%",
    top: "50%",
    transform: "translateY(-50%)",
    marginRight: "1rem",
  },
  top: {
    bottom: "100%",
    left: "50%",
    transform: "translateX(-50%)",
    marginBottom: "1rem",
  },
};

const animationVariants = {
  left: {
    initial: { opacity: 0, x: 20, scale: 0.95 },
    animate: { opacity: 1, x: 0, scale: 1 },
    exit: { opacity: 0, x: 20, scale: 0.95 },
  },
  top: {
    initial: { opacity: 0, y: 10, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 10, scale: 0.95 },
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function AvatarTooltip({
  message,
  visible,
  onClose,
  position = "left",
}: AvatarTooltipProps) {
  // Don't render if no message
  if (!message) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute z-50 pointer-events-auto"
          style={positionStyles[position]}
          initial={animationVariants[position].initial}
          animate={animationVariants[position].animate}
          exit={animationVariants[position].exit}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
          {/* Card container */}
          <div
            className="relative bg-gradient-to-br from-gray-900/95 to-gray-950/95 
                        backdrop-blur-xl border border-teal-500/30 
                        rounded-2xl shadow-2xl shadow-teal-500/10
                        px-4 py-3 max-w-[280px] min-w-[200px]"
          >
            {/* Glow effect */}
            <div className="absolute inset-0 rounded-2xl bg-teal-500/5 blur-xl -z-10" />

            {/* Close button */}
            {onClose && (
              <button
                onClick={onClose}
                className="absolute -top-2 -right-2 w-6 h-6 
                           bg-gray-800 border border-gray-700 rounded-full
                           flex items-center justify-center
                           hover:bg-gray-700 hover:border-teal-500/50
                           transition-colors group"
                aria-label="Stäng"
              >
                <X className="w-3 h-3 text-gray-400 group-hover:text-teal-400" />
              </button>
            )}

            {/* Message */}
            <p className="text-sm text-gray-100 leading-relaxed font-medium">
              {message}
            </p>

            {/* Decorative bottom line */}
            <div className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-teal-500/50 to-transparent" />

            {/* Arrow pointer */}
            {position === "left" && (
              <div
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full
                            w-0 h-0 
                            border-t-[8px] border-t-transparent
                            border-b-[8px] border-b-transparent
                            border-l-[8px] border-l-gray-900/95"
              />
            )}
            {position === "top" && (
              <div
                className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full
                            w-0 h-0 
                            border-l-[8px] border-l-transparent
                            border-r-[8px] border-r-transparent
                            border-t-[8px] border-t-gray-900/95"
              />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default AvatarTooltip;
