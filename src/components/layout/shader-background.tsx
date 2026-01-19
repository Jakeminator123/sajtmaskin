"use client";

import { memo, useState, useEffect } from "react";
import { Dithering } from "@paper-design/shaders-react";
import { cn } from "@/lib/utils/utils";

const MemoizedDithering = memo(Dithering);

// Sajtstudio palette themes (noir base + neon accents)
export const SHADER_THEMES = {
  // Noir base
  default: {
    color: "#01060C",
    name: "Noir",
  },
  // Deep navy base
  deep: {
    color: "#021522",
    name: "Deep Navy",
  },
  // Neon blue accent
  blue: {
    color: "#4F8BFF",
    name: "Blue",
  },
  // Warm neon accent
  warm: {
    color: "#F07050",
    name: "Warm",
  },
  // Amber glow
  amber: {
    color: "#F0A070",
    name: "Amber",
  },
} as const;

export type ShaderTheme = keyof typeof SHADER_THEMES;

// Color cycle for shimmer effect
const SHIMMER_COLORS = [
  "#01060C", // Noir base
  "#021522", // Deep navy
  "#4F8BFF", // Neon blue
  "#F0A070", // Amber glow
  "#F07050", // Warm accent
  "#F08060", // Warm glow
  "#021522", // Back to deep navy
];

interface ShaderBackgroundProps {
  theme?: ShaderTheme;
  color?: string;
  speed?: number;
  opacity?: number;
  className?: string;
  shimmer?: boolean; // Enable color cycling
  shimmerSpeed?: number; // How fast colors change (seconds per color)
}

export function ShaderBackground({
  theme = "default",
  color,
  speed = 0.25,
  opacity = 0.4,
  className = "",
  shimmer = false,
  shimmerSpeed = 8,
}: ShaderBackgroundProps) {
  const [currentColor, setCurrentColor] = useState(
    color || SHADER_THEMES[theme].color
  );
  const [colorIndex, setColorIndex] = useState(0);
  const transitionDurationMs = getTransitionDurationMs(shimmerSpeed);

  // Shimmer effect - smooth color cycling
  useEffect(() => {
    if (!shimmer) {
      setCurrentColor(color || SHADER_THEMES[theme].color);
      return;
    }

    const interval = setInterval(() => {
      setColorIndex((prev) => (prev + 1) % SHIMMER_COLORS.length);
    }, shimmerSpeed * 1000);

    return () => clearInterval(interval);
  }, [shimmer, shimmerSpeed, color, theme]);

  // Update color when index changes (for shimmer)
  useEffect(() => {
    if (shimmer) {
      setCurrentColor(SHIMMER_COLORS[colorIndex]);
    }
  }, [colorIndex, shimmer]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-0 select-none shader-background bg-background",
        getOpacityClass(opacity),
        className
      )}
    >
      <MemoizedDithering
        colorBack="#00000000"
        colorFront={currentColor}
        speed={speed}
        shape="wave"
        type="4x4"
        pxSize={3}
        scale={1.13}
        className={cn(
          "bg-background h-screen w-screen",
          shimmer ? "transition-all ease-in-out" : "transition-none"
        )}
        style={
          shimmer
            ? {
              transitionDuration: `${transitionDurationMs}ms`,
            }
            : undefined
        }
      />
    </div>
  );
}

// Map opacity (0–1) to the closest Tailwind opacity utility to avoid inline styles.
function getOpacityClass(value: number | undefined): string {
  const normalized = Math.max(0, Math.min(value ?? 0.4, 1));
  const options: Array<{ value: number; cls: string }> = [
    { value: 0, cls: "opacity-0" },
    { value: 0.05, cls: "opacity-5" },
    { value: 0.1, cls: "opacity-10" },
    { value: 0.2, cls: "opacity-20" },
    { value: 0.25, cls: "opacity-25" },
    { value: 0.3, cls: "opacity-30" },
    { value: 0.4, cls: "opacity-40" },
    { value: 0.5, cls: "opacity-50" },
    { value: 0.6, cls: "opacity-60" },
    { value: 0.7, cls: "opacity-70" },
    { value: 0.75, cls: "opacity-75" },
    { value: 0.8, cls: "opacity-80" },
    { value: 0.9, cls: "opacity-90" },
    { value: 0.95, cls: "opacity-95" },
    { value: 1, cls: "opacity-100" },
  ];

  // Find the closest match by minimum absolute distance
  // At equal distance, prefer the lower opacity (less intrusive)
  let closest = options[0];
  let minDistance = Math.abs(normalized - closest.value);

  for (const opt of options) {
    const distance = Math.abs(normalized - opt.value);
    if (distance < minDistance) {
      minDistance = distance;
      closest = opt;
    }
    // Note: We don't update on equal distance, so we prefer lower values
  }

  return closest.cls;
}

// Map shimmer speed (seconds) to transition duration in milliseconds.
// Matches the original behavior: shimmerSpeed / 2 seconds.
function getTransitionDurationMs(speedSeconds: number | undefined): number {
  const speed = Math.max(0, speedSeconds ?? 8);
  return Math.round((speed / 2) * 1000);
}
