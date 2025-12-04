"use client";

import { memo, useState, useEffect } from "react";
import { Dithering } from "@paper-design/shaders-react";

const MemoizedDithering = memo(Dithering);

// Color themes for different moods/states
export const SHADER_THEMES = {
  // Default - subtle teal (anonymous users)
  default: {
    color: "#002828",
    name: "Teal",
  },
  // Warm welcome - for logged in users
  warm: {
    color: "#2d1f3d", // Purple-ish
    name: "Warm",
  },
  // Sunset vibes
  sunset: {
    color: "#3d1f1f", // Reddish
    name: "Sunset",
  },
  // Ocean calm
  ocean: {
    color: "#1f2d3d", // Blue
    name: "Ocean",
  },
  // Golden hour
  golden: {
    color: "#3d2d1f", // Gold/amber
    name: "Golden",
  },
  // Aurora - pink/magenta
  aurora: {
    color: "#3d1f2d", // Pink/magenta
    name: "Aurora",
  },
  // Cyber - electric blue
  cyber: {
    color: "#1f1f3d", // Deep blue/purple
    name: "Cyber",
  },
} as const;

export type ShaderTheme = keyof typeof SHADER_THEMES;

// Color cycle for shimmer effect
const SHIMMER_COLORS = [
  "#2d1f3d", // Purple
  "#3d1f2d", // Pink
  "#3d2d1f", // Gold
  "#1f2d3d", // Blue
  "#2d1f3d", // Back to purple
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
      className={`fixed inset-0 z-0 select-none shader-background bg-black ${className}`}
      style={{ opacity }}
    >
      <MemoizedDithering
        colorBack="#00000000"
        colorFront={currentColor}
        speed={speed}
        shape="wave"
        type="4x4"
        pxSize={3}
        scale={1.13}
        style={{
          backgroundColor: "#000000",
          height: "100vh",
          width: "100vw",
          transition: shimmer ? `all ${shimmerSpeed / 2}s ease-in-out` : "none",
        }}
      />
    </div>
  );
}

export default ShaderBackground;
