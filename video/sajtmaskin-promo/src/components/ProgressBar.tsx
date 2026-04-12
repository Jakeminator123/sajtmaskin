import { useCurrentFrame, interpolate } from "remotion";
import { COLORS, FONT } from "../styles/colors";

export function ProgressBar({
  startFrame = 0,
  durationFrames = 120,
}: {
  startFrame?: number;
  durationFrames?: number;
}) {
  const frame = useCurrentFrame();
  const localFrame = frame - startFrame;

  if (localFrame < 0) return null;

  const progress = interpolate(localFrame, [0, durationFrames], [0, 100], {
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Track */}
      <div
        style={{
          width: 480,
          height: 8,
          borderRadius: 4,
          backgroundColor: COLORS.muted,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            borderRadius: 4,
            background: `linear-gradient(90deg, ${COLORS.orange}, ${COLORS.orangeLight})`,
          }}
        />
      </div>
      {/* Label */}
      <div
        style={{
          fontFamily: FONT.mono,
          fontSize: 16,
          color: COLORS.mutedForeground,
          letterSpacing: "0.04em",
        }}
      >
        {Math.round(progress)}%
      </div>
    </div>
  );
}
