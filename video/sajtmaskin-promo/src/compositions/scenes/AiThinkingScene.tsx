import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { COLORS, FONT } from "../../styles/colors";
import { ProgressBar } from "../../components/ProgressBar";
import { FadeIn } from "../../components/FadeIn";

const STEPS = [
  { text: "Analyserar din brief...", frame: 10 },
  { text: "Planerar sidstruktur...", frame: 70 },
  { text: "Genererar kod...", frame: 140 },
];

export function AiThinkingScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const dotScale = spring({
    frame: frame % 60,
    fps,
    config: { damping: 6, stiffness: 80 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.background,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 44,
      }}
    >
      {/* Pulsing dot */}
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          backgroundColor: COLORS.orange,
          transform: `scale(${0.8 + dotScale * 0.4})`,
          boxShadow: `0 0 ${20 + dotScale * 20}px ${COLORS.orange}40`,
        }}
      />

      {/* Status steps */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
        }}
      >
        {STEPS.map(({ text, frame: stepFrame }) => {
          const visible = frame >= stepFrame;
          const opacity = visible
            ? interpolate(frame - stepFrame, [0, 15], [0, 1], {
                extrapolateRight: "clamp",
              })
            : 0;

          const active = visible && (
            STEPS.findIndex(s => s.frame === stepFrame) ===
            [...STEPS].reverse().findIndex(s => frame >= s.frame)
              ? false
              : true
          );

          const isLatest = visible &&
            STEPS.filter(s => frame >= s.frame).pop()?.frame === stepFrame;

          return (
            <div
              key={text}
              style={{
                fontFamily: FONT.sans,
                fontSize: 24,
                fontWeight: isLatest ? 500 : 400,
                color: isLatest ? COLORS.foreground : COLORS.mutedForeground,
                opacity,
                letterSpacing: "-0.01em",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              {visible && !isLatest && (
                <span style={{ color: COLORS.green, fontSize: 20 }}>✓</span>
              )}
              {isLatest && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: COLORS.orange,
                    display: "inline-block",
                  }}
                />
              )}
              {text}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <FadeIn startFrame={30}>
        <ProgressBar startFrame={30} durationFrames={240} />
      </FadeIn>
    </AbsoluteFill>
  );
}
