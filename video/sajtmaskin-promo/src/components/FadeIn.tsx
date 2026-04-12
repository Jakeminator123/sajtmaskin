import React from "react";
import { useCurrentFrame, spring, interpolate, useVideoConfig } from "remotion";

export function FadeIn({
  children,
  startFrame = 0,
  direction = "up",
  distance = 30,
  useSpring = true,
}: {
  children: React.ReactNode;
  startFrame?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
  distance?: number;
  useSpring?: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - startFrame;

  if (localFrame < 0) return <div style={{ opacity: 0 }}>{children}</div>;

  const progress = useSpring
    ? spring({ frame: localFrame, fps, config: { damping: 14, stiffness: 100 } })
    : interpolate(localFrame, [0, 20], [0, 1], {
        extrapolateRight: "clamp",
      });

  const offset = (1 - progress) * distance;
  const transforms: Record<string, string> = {
    up: `translateY(${offset}px)`,
    down: `translateY(${-offset}px)`,
    left: `translateX(${offset}px)`,
    right: `translateX(${-offset}px)`,
    none: "none",
  };

  return (
    <div
      style={{
        opacity: progress,
        transform: transforms[direction],
      }}
    >
      {children}
    </div>
  );
}
