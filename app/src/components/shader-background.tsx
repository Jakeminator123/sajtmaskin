"use client";

import { memo } from "react";
import { Dithering } from "@paper-design/shaders-react";

const MemoizedDithering = memo(Dithering);

interface ShaderBackgroundProps {
  color?: string;
  speed?: number;
  opacity?: number;
  className?: string;
}

export function ShaderBackground({
  color = "#002828",
  speed = 0.25,
  opacity = 0.4,
  className = "",
}: ShaderBackgroundProps) {
  return (
    <div
      className={`fixed inset-0 z-0 select-none shader-background bg-black ${className}`}
      style={{ opacity }}
    >
      <MemoizedDithering
        colorBack="#00000000"
        colorFront={color}
        speed={speed}
        shape="wave"
        type="4x4"
        pxSize={3}
        scale={1.13}
        style={{
          backgroundColor: "#000000",
          height: "100vh",
          width: "100vw",
        }}
      />
    </div>
  );
}

export default ShaderBackground;
